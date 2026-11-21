/**
 * 冒烟死按钮分类的纯决策,不依赖 Playwright。
 * 单一来源:scripts/ui-smoke.mjs 与单测共用这一份。
 */
/** 幂等选中项:点当前已选中的值本就无变化,不判失败 */
export const SMOKE_ALLOWLIST: readonly string[] = [
  '/settings 点「×1」', // 战报速度默认 ×1
  '/settings 点「跟随系统」', // 主题默认跟随系统
  '/inventory 弹窗内点「不设」' // 智能收纳的阶级线默认「不设」
]

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 干净重试按名定位按钮的正则。
 *
 * - 容忍 CJK 字间空格多寡(如「战 力▸拆解」)
 * - 容忍**数字**不同:「深入探寻小险 … 一胜约 219 石」这类按钮名里嵌着当次生成的数值,
 *   下一轮再点必然换了数。按字面精确匹配的话 `cleanRetry` 永远找不到它、一律判成
 *   「干净态无法单独复现」—— 那条读数是假的,该按钮其实从未被单独验证过。
 *   只把数字段松开,文字骨架仍须逐字相同。
 */
export function namePattern(label: string): RegExp {
  /*
   * 先摘数字段再做转义。
   *
   * 反过来做不行:escapeRe 会把小数点写成 `\.`,之后再按 `[.,]` 找数字边界就找不到分隔符,
   * 一段 `1.4` 会被拆成两半来匹配(实测「遇险 ×1.4」与「×1.6」之间认不出来)。
   */
  const NUM = '\u0000'
  const body = label
    .replace(/\d+(?:[.,]\d+)*[万亿]?/g, NUM)
    .split(NUM)
    .map(escapeRe)
    .join('\\d+(?:[.,]\\d+)*[万亿]?')
    /*
     * 空白用 `\s*`,不是 `\s+`。
     *
     * 名字里的空格有两处来源,而且**不稳定**:
     *   · 同一元素内的字间空隙(「连 炼」那种排版空格) —— innerText 里是一个空格
     *   · 相邻两个元素拼接(「深入探寻」与「小险」是两个 span) —— innerText 有时有空格、
     *     有时因布局紧凑而没有
     * 写成 `\s+`(至少一个)时,后者会被判成「名字不一样」;实测「深入探寻小险行程」
     * 与「深入探寻小险 行程」就是这种情况,弹窗内控件因此恒被判「找不到目标按钮」。
     * `\s*` 对两种都成立,而文字骨架仍须逐字相同 —— 不会因此误配到别的按钮。
     */
    .replace(/\s+/g, '\\s*')
    /*
     * 再在「中文与中文之间」补可选空白 —— 元素拼接处本来没有空格时也要能放宽。
     *
     * 原先只在原 label 已有空白的位置插 `\s*`:label 是「深入探寻小险 行程」时,
     * 重放后的「深入探寻小险行程」能匹配;反过来 label 是「小险行程」(没空格)、
     * 重放后有空格,就匹配不上(评审指出)。
     * 两种方向都会真实发生 —— 同一份 innerText 在不同时刻给不给空格并不稳定。
     *
     * 只在中文字符边界放宽,不动 ASCII:英文/数字之间插空白会误配
     * (`x1` 与 `x 1` 不该是同一个名字)。
     */
    .replace(/([\u4e00-\u9fa5])(?=[\u4e00-\u9fa5])/g, '$1\\s*')
  return new RegExp('^' + body + '$')
}

/**
 * 「点的是当前已选中的页签」—— 与白名单同类(幂等),但按**状态**认,不写死路径。
 *
 * 页签点自己本来就没有变化:它已经是选中态,点它不切换任何东西。
 * 白名单里那三条是同一种情况的特例(默认值本身就是选中值),但路径一改、
 * 页签一换就得手写新条目 —— 实测 `/codex` 的「界域」与 `/collection` 的「成就」
 * 都是各自页面的默认页签,一次都没进白名单,于是每次都被判成「死按钮」。
 * 按 aria-selected 认,才覆盖得住。
 */
export function isSelectedTabState(
  role: string | null,
  ariaSelected: string | null
): boolean {
  return role === 'tab' && ariaSelected === 'true'
}

/**
 * 干净重试的结论。`'modal-unreachable'` 只对弹窗内控件有意义 ——
 * 类型上绑住,防止调用方把页面控件也标成弹窗盲点。
 */
export type SmokeCleanResult =
  | boolean
  | null
  | 'selected-tab'
  | 'modal-unreachable'
  | 'state-dependent'
  | 'state-dependent-retreat'
  | 'state-dependent-expedition'
  | 'state-dependent-secretRealm'
  | 'state-dependent-exploration'

export type SmokeDecision = { bucket: 'dead' | 'silent'; line: string }

/**
 * cleanResult 来自 ui-smoke 的干净重试:
 *   true           单独点有变化 → 功能正常(读数)
 *   false          单独点也无变化 → 真死控件(判失败)
 *   null           干净态找不到该按钮 → 无法复现(读数)
 *   'selected-tab' 点的是当前已选中的页签 → 幂等(读数)
 *   'modal-unreachable' 弹窗内按钮,干净态复现不了那个弹窗 → 无法复现(读数)
 *   'state-dependent'   重放时页面已处于「点了也没用」的状态(如历练在途)→ 读数
 * 白名单优先,恒为读数。
 *
 * `'selected-tab'` 单列一档,不复用 `true`:
 * 两者结论相同(都不判失败),但**归因不同** —— 复用时报表写成「干净重试有变化,
 * 功能正常」,而实际是「它本来就是选中态,点了不会有变化」。归因错了,
 * 下次真出现一个点了没变化的页签时,人会照着这句话以为功能是好的。
 */
export function classifySmoke(
  route: string,
  kind: 'page' | 'modal',
  label: string,
  cleanResult: SmokeCleanResult,
  allowlist: readonly string[] = SMOKE_ALLOWLIST
): SmokeDecision {
  const verb = kind === 'modal' ? '弹窗内点' : '点'
  const entry = `${route} ${verb}「${label}」`
  if (allowlist.includes(entry)) return { bucket: 'silent', line: `${entry}(幂等选中项,不判失败)` }
  /*
   * `'modal-unreachable'` 只对弹窗内控件成立 —— 类型上先挡住。
   *
   * 评审指出:调用方传 `kind: 'page'` 加 `'modal-unreachable'` 时,若无校验就会
   * 走进这一支,把**页面级**控件记成「弹窗内盲点」。那是把真缺陷藏起来:
   * 页面控件复现不了通常是脚本或页面真出了问题,不该披上「复现不了那扇窗」的说法。
   * 类型上绑死(见 SmokeCleanResult),运行时再挡一次。
   */
  /*
   * `'state-dependent'` —— 重放时页面已经处在「点了也没用」的状态。
   *
   * 实测 `/world` 的六档历练模式按钮:主循环点「深入探寻」→ 真的出发了,
   * 存档里 `adventure.session` 从此为真;`modalRetry` 重放那一步时,
   * `startExploration` 在「历练在途」分支直接 return false(带 toast 拒因),
   * 弹窗不关、界面不变 —— 于是它被判成「死按钮」。
   *
   * 那不是缺陷:按钮在**可出发的状态下**是好的,重放时状态已经变了。
   * 这一档与 `'cleanResult === false'`(真死控件)必须分开 ——
   * 前者说明判据的语境界不到,后者说明控件有问题。
   */
  /*
   * `'state-dependent'` 同样只对弹窗内控件成立。
   *
   * 评审指出:页面控件传入这一档时若无校验,会披上「重放时已在途」的说法 ——
   * 而页面级重试根本没有重放语境,那是把缺陷藏起来。
   * 与 `'modal-unreachable'` 同一处理:类型上绑 + 运行时挡。
   */
  const STATE_REASON: Record<string, string> = {
    'state-dependent': '在途',
    'state-dependent-retreat': '闭关',
    'state-dependent-expedition': '远征',
    'state-dependent-secretRealm': '秘境',
    // readBusyState 读到的第四种:历练在途
    'state-dependent-exploration': '历练在途'
  }
  const stateKey = cleanResult as string
  if (stateKey in STATE_REASON) {
    /*
     * 归因要写出**具体**是哪个状态。
     *
     * 评审指出:四种互斥状态原先共用一句「已在途/闭关」,玩家身在秘境时
     * 报表也这么说 —— 读的人据此去查「在途」会发现对不上。
     * 状态本来就分得清(`readBusyState` 读的是四个不同字段),文案也该跟上。
     */
    if (kind !== 'modal') {
      return { bucket: 'dead', line: `${entry} —— 归类错:页面控件不该有「重放时已在途」这一档` }
    }
    return {
      bucket: 'silent',
      line: `${entry}(重放时${STATE_REASON[stateKey]},按钮在可出发状态下才有效,未单独验证)`
    }
  }
  if (kind !== 'modal' && cleanResult === 'modal-unreachable') {
    return { bucket: 'dead', line: `${entry} —— 归类错:页面控件不该有「弹窗内盲点」这一档` }
  }
  if (cleanResult === 'modal-unreachable') {
    /*
     * 弹窗内按钮:干净态复现不了那一扇窗,故判不了,不判失败。
     *
     * 这一档**单列**,不复用 `null`。干净重试只做「导航到路由 → 找按钮 → 点 → 比指纹」,
     * 而弹窗内按钮要先点开某一扇触发的窗;重放那一步需要知道是哪扇、点哪个入口,
     * 这份信息在 `clickInsideModal` 的循环里并没有留下。复用 `null` 会把
     * 「重试过但找不到」与「根本没法重试」写成同一句话 —— 前者暗示还有救,
     * 后者说明这一档天生覆盖不到,后续要么补重放、要么承认盲区。
     */
    return { bucket: 'silent', line: `${entry}(弹窗内控件,干净态复现不了那扇窗,未单独验证)` }
  }
  if (cleanResult === 'selected-tab') {
    return { bucket: 'silent', line: `${entry}(已是选中态,点了本无变化)` }
  }
  if (cleanResult === true) {
    return { bucket: 'silent', line: `${route} 干净重试有变化(功能正常,抑制误报):${verb}「${label}」` }
  }
  if (cleanResult === null) return { bucket: 'silent', line: `${entry}(干净态无法单独复现,不判失败)` }
  return { bucket: 'dead', line: entry }
}
