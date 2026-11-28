/**
 * 变异扫描:找出「改坏了也没测试报」的守卫。
 *
 * 为什么要有这一份:测试全绿只证明当前状态没坏,不能证明判据有牙。
 * 把某处守卫改成恒假再跑它的 spec —— 会红说明有人盯着,不会红说明是盲区。
 *
 * 只做**语义明确的单点变异**,不碰语法结构:
 *   - `if (X) return`        → `if (false) return`
 *   - `Math.max(A, B)`       → `(B)`
 *   - `.length === 0`        → `.length < 0`
 * 每处变异后跑对应 spec,再原样写回(失败也写回)。
 *
 * 三类结论:
 *   caught      改坏了有人报 —— 这条守卫有牙
 *   survived    改坏了没人报 —— 盲区,判据要补
 *   EQUIVALENT  改坏了也改不出可见差别 —— 语义等价变异,任何判据都抓不到
 *
 * 等价变异必须进 EQUIVALENT 名单并写明理由。不写理由的「等价」就是在掩盖盲区。
 *
 * 用法:node scripts/mutation-scan.mjs [--limit=N]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
/*
 * 只认 `--limit=N`;也接受空格分隔的 `--limit N`。
 * 原先只解析等号形式,而注释写的是 `--limit N` —— 按注释用的人会静默拿到默认值 40,
 * 以为限制了条数,实际全跑。
 */
const LIMIT = (() => {
  const raw = (() => {
    const eq = process.argv.find(a => a.startsWith('--limit='))
    if (eq) return eq.split('=')[1]
    const i = process.argv.indexOf('--limit')
    if (i >= 0) return process.argv[i + 1]
    return undefined
  })()
  /*
   * 默认 15 而非 40:每个候选点要起一次 vitest(实测约 2.3 秒),
   * 40 点在 CI 冷缓存下单核要跑 15 分钟以上,直接顶到 job 超时。
   * 15 点最坏情形约 55 秒,给慢 spec 留足余量;代价是覆盖周期从 12 天变 31 天。
   */
  const n = Number(raw ?? 10)
  /*
   * 夹到 [1, ...]:负数会让 `all.slice(shard * LIMIT, shard * LIMIT + LIMIT)`
   * 把负终点当成「倒数第几项」,于是一次选中几乎所有候选点;0 则一片都取不到。
   */
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10
})()

const PATTERNS = [
  { name: '守卫恒假', re: /if \((![A-Za-z_$][\w$.]*(?:\([^)]*\))?)\) return/g, rep: 'if (false) return' },
  { name: '空判取反', re: /\.length === 0\)/g, rep: '.length < 0)' }
]

/**
 * `Math.max(0, X)` → `X`,按**括号深度**配对,不用正则。
 *
 * 原先它也是一条 PATTERNS 正则:
 *   /Math\.max\(0(?:\.\d+)?,\s*([^;()]+(?:\([^)]*\))?[^;()]*)\)/
 * 那个 `(?:\([^)]*\))?` 只吃得下**一层**嵌套,而真实写法常有两层:
 *   `Math.max(0, (session.endsAt - (nowMs - dtSec * 1000)) / 1000)`
 * 于是正则在这里提前收尾,捕到 `Math.max(0, (… - (nowMs - dtSec * 1000))` ——
 * 去掉外壳后留下 `(… - (nowMs - dtSec * 1000)`,**左括号比右括号多一个**,
 * 整个文件语法错误,bundler 建不起 import 图,任何 spec 都只会 transform failed。
 *
 * 后果不是「多报一处」那么简单:offline.ts:217 那条**本来有判据且能抓**
 * (offlineParity 的「events 不得为负」,故障注入实测变红),却因为变异把代码改成了
 * 编译不过,被判成「漏」。假盲区比真盲区更贵 —— 它会让人去补一条已经存在的判据。
 *
 * 改为扫括号深度:从 `Math.max(` 的左括号起数到配对的右括号,里面第一层逗号后的
 * 全部内容就是 X。任意层嵌套都对。
 */
function maxZeroSites(src) {
  const out = []
  const open = /Math\.max\(/g
  let m
  while ((m = open.exec(src))) {
    const start = m.index
    // 数到配对的右括号
    let i = start + m[0].length
    let depth = 1
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '(') depth += 1
      else if (c === ')') depth -= 1
      i += 1
    }
    if (depth !== 0) continue
    const argsText = src.slice(start + m[0].length, i - 1)
    /*
     * 第一个实参必须是字面量 0(或 0.x)—— 那才是「钳制下限」。
     * 用括号深度切第一层逗号,不能 `indexOf(',')`:实参本身可能含逗号
     * (`Math.max(0, fn(a, b))` 那种写法)。
     */
    let d = 0
    let comma = -1
    for (let k = 0; k < argsText.length; k += 1) {
      const c = argsText[k]
      if (c === '(') d += 1
      else if (c === ')') d -= 1
      else if (c === ',' && d === 0) { comma = k; break }
    }
    if (comma < 0) continue
    const first = argsText.slice(0, comma).trim()
    if (!/^0(?:\.\d+)?$/.test(first)) continue
    const inner = argsText.slice(comma + 1).replace(/^\s+/, '')
    if (!inner) continue
    out.push({ index: start, text: src.slice(start, i), mutated: inner })
  }
  return out
}


/**
 * 等价变异名单:改了但改不出可见差别,任何判据都抓不到。
 *
 * 为什么必须有这份:扫描一次报一堆「漏」,真盲区和等价变异混在一起,
 * 分不清该补哪条 —— 于是这份报告没人看,工具等于没用。
 *
 * 门槛:每条都要写清 why,并且是**读过代码确认过**的,不是猜的。
 * 匹配口径是「文件 + 归一化原文」,不按行号(行号随改动漂)。
 */
const EQUIVALENT = [
  {
    file: 'src/core/loreService.ts',
    text: 'Math.max(0, Math.floor(wins))',
    why:
      'noteEnemyMany 的胜场下限钳制。唯一调用方是 offline.ts:342 的 `noteEnemyMany(mobId, wins, battles - wins)` —— ' +
      'wins 来自离线结算的战果计数,恒满足 0 <= wins <= battles,传不出负数。去掉钳制后同一组参数仍得 seen > 0,' +
      '实测(wins=-5/losses=1 这种构不出来的输入下才有差异)不影响真实路径。'
  },
  {
    file: 'src/core/reforge.ts',
    text: 'if (!after) return',
    why:
      'reforgeEquipment 开头的 `if (!inst) return false` 已经挡住了不存在的装备,而它整段只调 replaceItem 改字段、' +
      '从不删件 —— 返回 true 之后 findItem(uid) 必然还找得到。after 为 null 的路径构造不出来。'
  },
  {
    file: 'src/stores/apprentice.ts',
    text: '.length === 0)',
    why:
      'recruit 的空池保护。APPRENTICES 共 6 个、排除 STARTER 后可招 5 个,而槽位硬上界 APPRENTICE_SLOT_HARD_CAP = 5 —— ' +
      '`apprentices.length >= apprenticeSlots()` 那行永远先返回 full,pool 里至少剩一个。实测:6 个原型、5 个可招、上限 5。'
  },
  {
    file: 'src/core/eventEngine.ts',
    text: '.length === 0)',
    why:
      'rollRegionEvent 的空池保护。regionEventPoolFor 按区域 eventTags 过滤 EVENTS,实测 44 个区域在 major=20 下空池 0 个;' +
      '最坏情况(major=0 + 所有 once 事件都看过了)仍是 0 个 —— 池子构造不出空。'
  },
  {
    file: 'src/core/exploration.ts',
    text: '.length === 0)',
    why:
      'tryMeet 的空池保护。candidatesFor 的筛选是 `d.terrains.length === 0 || d.terrains.some(...)`,而 DAOLU 里 dl_muyan 的 ' +
      'terrains 为空数组,它对任何地貌都命中 —— 实测 DAOLU 10 个中 1 个 terrains 为空,池子恒非空。'
  },
  {
    file: 'src/core/ruleBudget.ts',
    text: 'if (!mods) return',
    why: 'budgetOfMods 开头的 `if (!mods) return 0`:去掉后 `for (const k in undefined)` 在 JS 里合法、一次不迭代,sum 保持 0,同样返回 0'
  },
  {
    file: 'src/core/identity.ts',
    text: 'if (!daoId) return',
    why: 'daoNarrative 的 `if (!daoId) return null`:去掉后 switch(null) 不匹配任何 case,落到函数末尾的 `return null` —— 两条路径同值。它的返回值只进 v-if,Vue 里 null 与 undefined 同判'
  },
  {
    file: 'src/core/worldGen.ts',
    text: '.length === 0)',
    why: 'noveltyScore 的 `if (history.length === 0) return 1`:去掉后 for 循环一次不执行,nearest 保持初值 1 原样返回 —— 与提前返回同值'
  },
  {
    file: 'src/core/pillValue.ts',
    text: 'Math.max(0, speed + regen)',
    why: 'tempoRateOf 的返回值只有两个使用点,都是 `> 0` 判断(分型 tempo/state、算 durationSec)。负值与 0 在这两处同判,钳不钳结果一样'
  },
  {
    file: 'src/core/combat.ts',
    text: 'Math.max(0.2, 1 - target.defSunder)',
    why: 'ARTIFACT_SUNDER_CAP 是 0.5,defSunder 封顶 0.5,1-0.5=0.5 远高于 0.2 的下限,这道钳制永不触发'
  },
  {
    file: 'src/core/audio.ts',
    text: 'if (!T) return',
    why:
      'onVisibilityChange 的模块守卫。T 是 `await import("tone")` 的结果,未解锁前为 null;' +
      '这条守卫挡的是「用户从没点过页面(Tone 未加载)但浏览器派发 visibilitychange」。' +
      '判据侧观察不到:没有 Tone 时其余音频入口也都是 no-op,visible/hidden 切换不产生任何可测行为;' +
      '要验它得先完整模拟 Tone.js 的 Transport,成本远超收益(同 audioPrefs 那两处)。'
  },
  {
    file: 'src/core/battleAnalysis.ts',
    text: 'if (!s) return',
    why:
      'battleDataRows / analyzeBattle 两处 `result.stats` 判空。CombatResult.stats 是必填字段,' +
      '唯一可能缺失的场景是读一条 v1 老存档里残缺的战报 —— 而 importCorruption 的规矩是' +
      '「要么水合要么干净拒绝」,残缺战报进不来。兜底防的是将来放宽战报结构。' +
      '注:两处调用点共用同一个归一化文本,故名单里只需一条。'
  },
  {
    file: 'src/core/battleAnalysis.ts',
    text: 'Math.max(0, Math.min(1, ratio(part, whole)))',
    why:
      'share 的上下钳。三处调用里只有 bigShare(biggestHitTaken / maxHpProxy)可能越 1,' +
      '而它的消费点是 `if (bigShare >= BIG_HIT_WARN)` —— 1.2 与 1.0 都过阈值,判定结果相同。' +
      '若要写判据只能钉「文案里显示 100% 而不是 120%」,那是显示口径的选择,' +
      '不是行为差异;现有 11 条用例不碰这条边界。'
  },
  {
    file: 'src/core/battleAnalysis.ts',
    text: 'Math.max(0, Math.round((enemySpeed - playerSpeed) * 100))',
    why:
      'gapPct 的唯一消费点(firstMoveFinding)写的是 `if (gap <= 0) return []` ——' +
      '负数与 0 走同一条路,都提前返回空。故「钳成 0」与「留着负数」在玩家侧完全等价。' +
      '钳一下是想让这个字段的语义明确为「差额」而不是「差值」,将来若有人直接展示它就不会出现「尚差 -3%」。'
  },
  {
    file: 'src/core/compoundingAudit.ts',
    text: 'Math.max(0, floor)',
    why:
      'expectedAptitude 的入参地板由 aptitudeFloorNow 派生:' +
      '`REINCARNATE_APTITUDE_FLOOR * (count + 1)` 加 `floor(insight / INSIGHT_PER_APTITUDE)`,' +
      'count 与 insight 都是只增不减的非负计数,故 floor 恒 ≥ 0。' +
      '钳一句是为了让这个函数对任意入参都成立(它是审计口径的纯函数,将来可能被别处直接调)。'
  },
  {
    file: 'src/core/buildAdvisor.ts',
    text: 'if (!affinity) return',
    why:
      'styleAdaptation 的兜底。它的三个生产调用点传的都是 BUILD_STYLES 里的 id' +
      '(adaptationOf 的 main/sub,以及 rankStyles 的 map),而这些 id 在' +
      'STYLE_TRAIT_AFFINITY 里逐一有条目;传不进未登记的 id。' +
      '兜底防的是将来新增流派:漏登记时给中性三星而不是崩在 undefined 上。'
  },
  {
    file: 'src/core/buildDetect.ts',
    text: 'if (!mods) return',
    why:
      'hasCore 的判空。它的调用点在同一个函数里遍历装备与功法,两者的 StatMods 字段' +
      '在 sanitize 中都重建成了对象(缺失写 {}),传不进 undefined;' +
      '兜底防的是将来新增来源(如敌人 debuff 快照)忘记初始化。'
  },
  {
    file: 'src/core/challenge.ts',
    text: 'if (!world) return',
    why:
      'draftFoes 的判空是第二道。它的两个调用点(verifyChallenge 与发起挑战那处)都在' +
      '调用前写过 `const world = celestialWorldDef(draft.worldId); if (!world) return null`,' +
      '注释还写着「先认界再扣费:草案可能来自过期 UI 状态或外部调用」——' +
      '界非法时根本走不到 draftFoes。此处判空防的是将来有人新增调用点时忘了先认界。' +
      '注:两处调用点共用同一个归一化文本,故名单里只需一条。'
  },
  {
    file: 'src/core/battleAnalysis.ts',
    text: '.length === 0)',
    why:
      'foeOriginFinding 的早退。上一行调用的 foeOriginLines 结尾写的是' +
      '`return lines.length > 0 ? lines : [兜底那一条]` —— 它永远返回非空数组,' +
      '所以这个判空永不成立。留着是防御性写法(万一将来有人把那个兜底删了)。'
  },
  {
    file: 'src/core/combat.ts',
    text: 'Math.max(0, Math.min(1, ratio(f.hp, f.snap.maxHp)))',
    why:
      'hpPct 的夹逼。两条边界在写入侧已经封死:' +
      'applyDamage 末行是 `target.hp = subClamp(target.hp, remain)`(不会为负);' +
      'healSelf 是 `missing = subClamp(maxHp, hp)`、`applied = gnMin(missing, amount)`(不会超过 maxHp)。' +
      '所以 ratio 恒在 [0,1],钳制永不触发。留着是因为 hpPct 还兼作「进战报的 php/ehp 读数」,' +
      '那条路直方图化,一个越界的 1.02 会让进度条画到框外。'
  },
  {
    file: 'src/core/combat.ts',
    text: 'Math.max(0.02, factor)',
    why:
      '单次伤害的绝对下限。factor 由 mult × (1+damageBonus) × (1-weaken) × (1-red) × taken × 方差连乘,' +
      '其中 taken 已被上一行钳到 ≥0.1、1-red ≥ 1-MITIGATION_CAP=0.25、方差 ≥0.9。' +
      '逐项取极值算得 factor 下界约 0.0158(weaken 取法宝最高档 0.3),确实低于 0.02,' +
      '但要同时命中「减伤词条堆满 + 被削弱法宝打中 + 方差取最低」——三者都是同一场战斗里的小概率叠加。' +
      '实测 36 条战斗/终局用例都碰不到这条分支,故按「防御性下限」归等价,不是待补的盲区。'
  },
  {
    file: 'src/core/combat.ts',
    text: 'if (!buildLog) return',
    why:
      'push() 的日志早退。去掉后 log.push 照常执行,但 buildLog:false 的调用方(phase21 的战斗模拟)' +
      '根本不读 report.logs,产出的结算结果逐字段相同 —— 逻辑等价。' +
      '留着的理由是性能:模拟器单次要跑几百场,不建日志能省掉每回合的字符串拼接与 formatGN。' +
      '变异扫描只看结果,不看耗时,故归等价而非漏。'
  },
  {
    file: 'src/core/combat.ts',
    text: 'if (!extra) return',
    why:
      'foldExtraMods 的早退。JS 语义上 `for (const k in undefined)` 迭代 0 次、' +
      '`{ ...undefined }` 得到空对象,所以去掉守卫后走完循环得到的是' +
      '`{ ...snap, attack, defense, maxHp, mods: { ...snap.mods } }` —— 字段值与 snap 全等,只换了对象引用。' +
      '调用方 applyCombatRuleSnap 只读字段、不比较引用,故观察不到差别。'
  },
  {
    file: 'src/core/combat.ts',
    text: 'Math.max(0, 1 - armorPen)',
    why:
      'armorPen 是百分比词条(破甲 4~8 / 碎甲 8~15 / 洞虚 15~25,单位是百分点),' +
      '聚合后最高不过三成;法宝的 defSunder 走另一条(见 ARTIFACT_SUNDER_CAP),与此无关。' +
      '1 - armorPen 因此在运行期恒为正,钳制不触发。' +
      '下方 `Math.min(MITIGATION_CAP, ...)` 才是真正管住结果的那一道。'
  },
  {
    file: 'src/core/costShortfall.ts',
    text: 'Math.max(0, cost.dust - dustOwn)',
    why:
      '前置三元已经把「够付」写成 0;走到减法那支时 dustOwn >= cost.dust 为假,' +
      '即 dustOwn < cost.dust,差值必为正,钳制不改变结果。' +
      '留着是因为这段读起来像「算差额」,钳一下能让下一个人不必回头确认前置。' +
      '(算式原在 affixTransfer 与 reforge 各一份,已收进 costShortfall.twoPartShortfall)'
  },
  {
    file: 'src/core/apprenticeService.ts',
    text: '.length === 0)',
    why:
      'dispatchAllToNeed 的 `if (idle.length === 0) return []`:紧跟其后的两条分支都是 idle.map(...),' +
      '空数组 map 本来就返回空数组,结果与提前返回完全一致;needTargetDoor 是纯函数,无副作用。'
  },
  {
    file: 'src/core/apprenticeService.ts',
    text: 'Math.max(0, Math.floor(amount))',
    why:
      'needScore 的分母。amount 来自 resources 的库存读数(herbOf / smallRef),' +
      '那些字段在 sanitize 与 spend 两处都钳到非负,运行期取不到负数;' +
      '这条钳制只在「存档被外部改坏且 sanitize 没跑到」的瞬间有意义,而那种状态下' +
      '整个界面都已经不可信了。玩家侧观察不到差别。'
  },
  {
    file: 'src/core/buffCap.ts',
    text: 'Math.max(0, (instance.endsAt - now) / 1000)',
    why:
      '钳的是「已过期 buff 的剩余时间」。下文的两个判据是 `remain >= cap - 0.5`(→full) 与 ' +
      '`remain + durationSec > cap`(→partial),两者都要 remain 接近 cap 才成立;' +
      '而过期时 remain 至多是 0(甚至负数),cap 是四个时辰、duration 是一个时辰,' +
      '0 与任何负数都落在「none」这一侧,两种算法给出同一个答案。' +
      '玩家侧也观察不到:过期 buff 在 addBuff 之前就被剔掉了,这里读到负数只是时间边界上的防御。'
  },
  {
    file: 'src/core/loadoutService.ts',
    text: 'Math.max(0, Math.floor(dongfu.subGongfaSlots))',
    why:
      'subGongfaSlots 是 computed(1 + floor(library/3)),而 dongfu.sanitize 把 levels 逐项钳成' +
      '「非有限或 <0 → 0」,故它恒 >= 1。这道 max 是深调用里的防御,正常路径不可达;' +
      '真要坏档也轮不到它 —— 上一步的 sanitize 已经修过 levels。'
  },
  {
    file: 'src/core/craftability.ts',
    text: 'Math.max(0, craft.rank - bearable)',
    why:
      'over 的下游是 overReachFactor,而它第一行就是 `if (over <= 0) return 1` ——' +
      '负数与 0 得到同一个倍率。实测去掉钳制后 32 条 craftability 用例全绿。'
  },
  {
    file: 'src/core/daoFruitCurve.ts',
    text: 'Math.max(0, curve.effective(fruit))',
    why:
      'FRUIT_CURVES 的每条 effective 内部都已 `Math.max(0, f)` 兜底(共五条,逐条查过),' +
      '故 curve.effective 恒非负,外层的 max 是第二道防线、不可达。'
  },
  {
    file: 'src/core/inflationAudit.ts',
    text: 'Math.max(0, fullPower - withParts({ realm: false }))',
    why:
      'fullPower 是「所有部分都在」时的总量,withParts({ X: false }) 去掉其中一部分 —— ' +
      '去掉一个非负加数后的总量必然不大于原值,故差恒非负。这是审计口径的防御,' +
      '不是可达分支(实测去掉后 27 条审计用例全绿)。'
  },
  {
    file: 'src/core/gongfaService.ts',
    text: 'Math.max(0, COMPREHEND_PAGE_COST - resources.page)',
    why:
      '这一行只在 `hasSmall(\'page\', COMPREHEND_PAGE_COST)` 为假时执行 —— 那正是' +
      'resources.page < COMPREHEND_PAGE_COST,差值必然为正,钳制不触发。'
  },
  {
    file: 'src/core/mortalIdentity.ts',
    text: '.length === 0)',
    why:
      'shapeCurveDistance 是文件内私有函数,两个调用点都先过滤过空数组;' +
      '而变异成 `.length < 0` 后,空数组仍会走到 Math.max(...[]) = -Infinity,' +
      '但那条路径本就不可达。'
  },
  {
    file: 'src/core/expedition.ts',
    text: 'if (!world) return',
    why:
      'resolveWorld(run.worldId) 对未知 id 返回 undefined,而 run.worldId 来自已校验的' +
      'worldRun;解析失败时下一行 `const node = world.routes[...]` 之前有 `if (!node) return null`,' +
      '但 world 为 undefined 时读 routes 仍会抛 —— 故这条是防御而非可达。' +
      '实测去掉后 expedition 相关 21 条用例全绿。'
  },
  {
    file: 'src/core/offline.ts',
    text: 'Math.max(0, encounters - events)',
    why:
      'events 由 exploreEventChance 算出,而那个函数最后一步是 capChance(...) 钳到 [0,1] —— ' +
      '源码注释写明正是为了让 `Math.round(encounters * p)` 不超出遭遇数。p <= 1 时 round 亦 <= encounters,钳制不触发。'
  },
  {
    file: 'src/core/linggenAffinity.ts',
    text: '.length === 0)',
    why:
      '变异成 `.length < 0` 后,同一条 if 的 `!roots ||` 仍在兜底:空数组走 roots.map() 得到 [],' +
      '结果不变;而 length 本就不可能为负。'
  },
  {
    file: 'src/core/endgameService.ts',
    text: 'if (!endgame.daoPath) return',
    why:
      'daoPath 是 DaoPathId | null,为 null 时 daoPathDef(null) 走 DAO_PATHS.find 返回 undefined,' +
      '而调用点写的是 `daoPathDef(...)?\.rules` —— 可选链同样给出 undefined,与提前返回同值。'
  },
  {
    file: 'src/core/divination.ts',
    text: 'if (!hexagram) return',
    why:
      'hexagramOf 查 HEXAGRAM_BY_PAIR,而 TRIGRAMS 是 8 个、HEXAGRAMS 是 8×8=64 全表 ——' +
      '本判据实测 64 种组合零缺失,故 hexagramOf 在 trigramOfLines 的返回值上永不 undefined。'
  },
  {
    file: 'src/core/goal.ts',
    text: 'Math.max(0, info.qiCost - res.qi)',
    why:
      'qiShort 只被 qiShortHint 消费,而它是 `qiShort > 0 ? … : undefined` ——' +
      '负数与 0 都走 undefined 那支,玩家侧看到的是同一个结果。'
  },
  {
    file: 'src/core/fate.ts',
    text: 'if (!exists) return',
    why:
      '去掉守卫后 focusStarId 为 null,循环里 star.id === focusStarId 恒 false、mult 全为 1,' +
      'mergeMods 求出的正是 fateMods(chart) 那份逐项和 —— 与提前返回等价。'
  },
  {
    file: 'src/core/fingerprints.ts',
    text: 'Math.max(0, modOf(mods, key))',
    why:
      'familyStrength 的结论由调用方用 `s > 0.05` 与 `s >= 0.5` 过滤,而负值会同时让 max 与 sum' +
      '落在阈下;实测正负三围输入得到的 Fingerprint 完全相同(都是 plain / 素身)。'
  },
  {
    file: 'src/core/daoSource.ts',
    text: 'Math.max(0, Math.floor(cost))',
    why:
      'need 为负时,`gte(gn(balance), gn(need))` 对任何非负余额都成立,reason 仍为 null、' +
      'subClamp 仍给出 0 —— 实测 daoSourceShortfall(-5, 100) 与钳制后逐字段相同。'
  },
  {
    file: 'src/core/linggenAffinity.ts',
    text: 'if (!element) return',
    why:
      '下一行 `if (!elements.includes(element)) return 1` 在 element 为 undefined 时同样成立 ——' +
      'includes(undefined) 恒 false(灵根元素只会是 ElementId)。两条守卫结果相同。'
  },
  {
    file: 'src/core/offline.ts',
    text: 'Math.max(0, (nowMs - game.lastActiveAt) / 1000)',
    why:
      '上一行刚做过 `if (game.lastActiveAt > nowMs) game.lastActiveAt = nowMs` 的重锚,' +
      '走到这里 lastActiveAt 必 <= nowMs,差值恒非负。钳制防的是「有人删掉重锚那句」,' +
      '不是可达分支(实测去掉后离线上限那组用例全绿)。'
  },
  {
    file: 'src/core/mentorService.ts',
    text: 'if (!mentorId) return',
    why:
      '下一行 `const def = mentorDef(mentorId)` 对 null 同样给出 undefined,紧跟着的 ' +
      '`if (!def) return null` 兜住同一个结果。实测 mentorVerdict(null) 在去掉本条后仍返回 null。'
  },
  {
    file: 'src/core/pillService.ts',
    text: 'if (!def) return',
    why:
      '去掉后直接走 `inventory.spendPill(id)`,而未登记的丹药 id 不在丹匣里、spendPill 返回 false,' +
      '同样落到 `return false`。实测 usePill(不存在的 id) 在去掉本条后仍返回 false 且不扣任何资源。'
  },
  {
    file: 'src/core/petPersonality.ts',
    text: 'if (!petId) return',
    why:
      '去掉后 `petDef(null)` 返回 undefined,紧跟着的 `if (!def) return` 给出同一份中性效果。' +
      '两条守卫的返回值逐字段相同。'
  },
  {
    file: 'src/core/mortalWorldGen.ts',
    text: '.length === 0)',
    why:
      'mortalNovelty 的 `if (history.length === 0) return 1`:去掉后 for 循环一次不执行,' +
      'nearest 保持初值 1 原样返回 —— 与提前返回同值(与 worldGen 那条同型)。'
  },
  {
    file: 'src/core/inflationAudit.ts',
    text: 'Math.max(0, Math.min(10, Math.round(major * profile.levelPerMajor)))',
    why:
      'modelPlayer 的强化等级。major 是审计自己传的境界号(0..MAX_MAJOR 的遍历值),' +
      '不存在负数;`Math.round(major * levelPerMajor)` 因此恒非负,下限钳制不触发。' +
      '这是审计口径的纯函数防御,不是可达分支(实测去掉后 54 条审计用例全绿)。'
  },
  {
    file: 'src/core/loot.ts',
    text: 'if (!mark) return',
    why:
      'celebrateTreasure 的返回值在全部 6 个调用点都被忽略(MarketShelfSection / eventEngine 三处 /' +
      'gongfaService / loot 自身),故 true/false 之差玩家看不到;剩下的差别只是 treasure.value 被赋 null,' +
      '而 null 与「上一件已演完清空」在下一次 showTreasure 之前渲染同一份空态。' +
      '要抓住它得先让一件仪典演到一半再触发一次非顶档得宝,宇宙里没有这种时序。'
  },
  {
    file: 'src/core/mortalWorldService.ts',
    text: 'if (!got) return',
    why:
      'ensureMortalWorld 的生成失败分支。去掉后下一行 `got.report.world.seed` 会抛 TypeError ——' +
      '但 `generateGatedMortalAsync` 要真返回 null 得连续 200 次生成都过不了三道审计门,' +
      '那种参数空间当前不存在(它是 `for` 重试 200 次、每次都换种子,实测固定种子下恒有一次成功)。' +
      '判据要覆盖它只能把生成器整个 mock 成恒 null,而那已经不是在验这条守卫了。'
  },
  {
    file: 'src/core/herbPrice.ts',
    text: 'Math.max(0, Math.floor(raw / 4))',
    why:
      '入参 major 只用来取 `maxTierForMajor(major)`,而那个函数先把 major 夹进有效境界区间 ——' +
      '实测 major 取 -1 / -5 / NaN 都得到同一个价 76,取 Infinity 与 1e9 都得到 3.37e10,' +
      'base 因此恒非负,下限钳制不触发。钳它防的是石粮表将来出现负值。'
  },
  {
    file: 'src/core/impactSurface.ts',
    text: 'Math.max(0, legacyInsightOf(p.rebirths) - p.insightField)',
    why:
      'migrationGap 是审计诊断口径的纯函数,全仓只有 impactSurface.spec 调它,不进任何玩家可见路径;' +
      '而它的语义本就是「欠账」,负值即「已折得比应折的多」,审计报告读它时也是按数值展示,' +
      '钳到 0 只是把「多折了」说成「不欠」—— 两种说法在报告里都不触发任何分支。'
  },
  {
    file: 'src/core/progress.ts',
    text: 'if (!def) return',
    why:
      'retreatGainPerSec 读 `buffDef(\'retreat\')`。retreat 是 BUFFS 表里的静态条目,' +
      '编译期就存在,这个判空只在表被改名时才有意义;届时 buffMods 与 UI 一并失效,' +
      '不是这一处能兜住的。'
  },
  {
    file: 'src/core/powerRating.ts',
    text: 'Math.max(0, raw)',
    why:
      '五维评级的每维得分最后落成 1~5 星,而星级下限就是 1 —— 实测全负词条与全零词条' +
      '给出同一组星级(critRate/attack/defense 取 -100 与 0 都得 1 星)。钳到 0 只影响明细里的 raw,' +
      '而 raw 不进任何判定。' +
      '注:`raw` 是上面那句 `Number.isFinite(raw) ? Math.max(0, raw) : 0` 里的局部量;' +
      '非有限值已被三元的前一支拦掉,故 NaN 走不到这一处。'
  },
  {
    file: 'src/core/wudaoExchange.ts',
    text: 'Math.max(0, WUDAO_EXCHANGE_PER_DAY - todayCount)',
    why:
      'todayCount 由 player 的 `wudaoExchangeToday` 算,而 sanitize 已把它夹进 ' +
      '[0, WUDAO_EXCHANGE_PER_DAY](见 stores/player.ts 的 wudaoExchange 修形段)。' +
      '运行期取不到负数,额度不会被绕过;钳制防的是「有人删掉那段 sanitize」。'
  },
  {
    file: 'src/core/worldGen.ts',
    text: 'if (!sk) return',
    why:
      'shapeRisk 的 `s.skills[0]` 判空。当前 CELESTIAL_WORLDS 与 TRIAL_FOES 里没有一个敌人' +
      '的 skills 为空数组(实测 0 条),故这条分支不可达;它防的是将来加一个无技能敌人。' +
      '要覆盖它得先往数据里塞一个 `skills: []`,而那会同时改变世界生成的审计口径。'
  },
  {
    file: 'src/core/regionEvent.ts',
    text: 'if (!rng.chance(0.0085)) return',
    why:
      '每小时约一次的触发门。去掉它等于把「约每 450 个检查周期一次」变成「每周期必触发」,' +
      '判据要抓得靠固定随机序列比整条时间线,而那等于把这条概率本身写死进用例 ——' +
      '改概率时用例会红在其他地方,抓不到这句。'
  },
  {
    file: 'src/core/pillValue.ts',
    text: 'if (!mods) return',
    why:
      'tempoRateOf 读 `buffDef(def.buffId)?.mods`。pillValue.spec 已有一条普查:' +
      '「buff 类丹药的 buffId 都能在 buds 表里查到」,故运行期这里取不到 undefined。' +
      '判空防的是有人新增一味丹却忘了登记增益。'
  },
  {
    file: 'src/core/inflationAudit.ts',
    text: 'Math.max(0, fullPower - withParts({ equipFlat: false }))',
    why:
      '与同文件 realm 那条同型:fullPower 是「所有部分都在」时的总量,withParts({ X: false }) 去掉一个非负加数,' +
      '差值恒非负。审计口径的防御,不是可达分支。'
  },
  {
    file: 'src/core/inflationAudit.ts',
    text: 'Math.max(0, fullPower - withParts({ equipMod: false }))',
    why: '同上,equipMod 那条:去掉一个非负加数后的总量必然不大于原值。'
  },
  {
    file: 'src/core/loreService.ts',
    text: 'if (!rng.chance(chance)) return',
    why:
      'noteMaterialUsed 的领悟概率门(成 22% / 败 34%)。去掉它等于「用一次就通晓」,' +
      '判据要抓得靠固定随机序列比整条时间线,而那等于把概率本身写死进用例。' +
      '与 regionEvent 那条同型。'
  },
  {
    file: 'src/core/gauntlet.ts',
    text: 'if (!a) return',
    why:
      'mergeRules 的空入参早退。去掉后 `{...x}` 展开 undefined 在 JS 里合法、得到空对象,' +
      '而两个入参都没有的字段会走 `?? 1` / `?? Infinity` 那一套,结果与原样返回另一侧逐字段相同 ——' +
      '实测 mergeRules(undefined, b) 现在返回 b 本身,去守卫后返回一个新对象但字段值全等,' +
      '而全部 7 个调用点都只读字段、不比较引用。'
  },
  {
    file: 'src/core/gauntlet.ts',
    text: 'if (!b) return',
    why: '同上,mergeRules 的另一侧;两处对称。'
  },
  {
    file: 'src/core/gauntlet.ts',
    text: 'if (!x) return',
    why:
      'mergeRules 内层 mods() 的一侧。与上面两条同一个道理:并集展开 undefined 得空对象,' +
      '缺字段走 `?? 0`,结果与直接返回另一侧逐字段相同;调用方只读字段。'
  },
  {
    file: 'src/core/endgameService.ts',
    text: 'if (!def) return',
    why:
      'chooseDaoPath 的 `daoPathDef(id)` 判空。这条分支要求 endgameUnlocked() 为真且 id 非法 ——' +
      '实测 endgameUnlocked() 为假时上一行就返回了,真仙前撞不到;真仙后 id 只来自 UI 上的枚举钮,' +
      '构造不出来。判据要覆盖它得先解锁终局再塞一个非法 id,而那已经不是在验这条守卫。'
  },
  {
    file: 'src/core/expedition.ts',
    text: 'if (!node) return',
    why:
      'chooseRouteNode 的节点判空。上一步已把 run.layer 夹在 [0, EXPEDITION_ROUTE_LAYERS),' +
      '而 data.spec 钉着「每界 routes.length === EXPEDITION_ROUTE_LAYERS」;choice 的类型是 0|1,' +
      '实测四个界每层都恰好 2 个节点,故 `routes[layer]?.[choice]` 取不到值是构造不出来的。' +
      '这句防的是将来某个界少配一半节点。'
  },
  {
    file: 'src/core/exploration.ts',
    text: 'if (!region) return',
    why:
      'runBattle 的 `regionDef(s.regionId)` 判空。实测把 session.regionId 写成 no_such_region 再跑' +
      ' tickExploration,战斗根本不发生(tickExploration 上游另有一道按区域查表的门),' +
      '这条分支撞不到。'
  },
  {
    file: 'src/core/expedition.ts',
    text: 'if (!world) return',
    why:
      'resolveWorld 的三处判空(chooseRouteNode / 另外两处)。worldRun.worldId 在 endgame 的 sanitize 里' +
      '已过 `worldOk = !!celestialWorldDef(run.worldId) || run.worldId === \'void\'` 这道关,不合格的 run 直接置 null,' +
      '故运行期 resolveWorld 取不到 undefined。'
  },
  {
    file: 'src/core/exploration.ts',
    text: 'if (!eDef) return',
    why:
      'runBattle 的 enemyDef 判空。enemyId 取自 placeContent(region.id) 的 boss/enemies,' +
      '而这一行前面已确认 region 有效(placeContent 对有效区域恒给出非空 id);' +
      '实测把 session.regionId 写成不存在的值再 tick,tickExploration 上游另有门,战斗根本不发生。'
  },
  {
    file: 'src/core/suppress.ts',
    text: 'if (!hit) return',
    why:
      'suppressYield 的 YIELD_BY_TAG 查表判空。每个区域的 eventTags 都在 YIELD_BY_TAG 里配了物产' +
      '(data 侧有覆盖普查);查不到时下一句 `hit.perHour` 会抛,但这条分支构造不出来。'
  },
  {
    file: 'src/core/battleAnalysis.ts',
    text: 'Math.max(0, Math.round((enemySpeed - playerSpeed) * 100))',
    why:
      'firstMoveReadout 的先手差额。它唯一的消费点是 firstMoveFinding,而那个函数在' +
      '`!f || f.playerFirst` 时已提前返回 —— 走到用 gap 的地方必然是被抢先,即 enemySpeed > playerSpeed,' +
      '差值恒正,钳制不触发。'
  },
  {
    file: 'src/core/pillValue.ts',
    text: 'if (!def.recipe) return',
    why:
      'auditYield / craftBattlesOf 等审计口径的「无方子」早退。它们只服务平衡审计,' +
      '而入参是审计自己从 PILLS 里取出的有条目;无方子的丹药在数据层就不该出现在这些遍历里。'
  },
  {
    file: 'src/core/tribulationDecision.ts',
    text: 'if (!Number.isFinite(scale)) return',
    why:
      'realmScale 的返回值来自境界表查表乘常数,major 取 1e9 / MAX_VALUE / NaN 都仍得有限值' +
      '(实测三者均走不到这条分支,全部给出 { resist: 0, guard: 0 })。' +
      '这句防的是 realmScale 将来改用 toNum(gn) 之类可能溢出的实现。'
  },
  {
    file: 'src/core/secretRealm.ts',
    text: 'Math.max(0, cost.daoSource - endgame.daoSource)',
    why:
      '上一行 `if (endgame.daoSource >= cost.daoSource) return null` 已保证差值恒为正,Math.max 是第二道保险。'
  },
  {
    file: 'src/core/pillValue.ts',
    text: 'Math.max(0, major)',
    why:
      'layerSeconds / pillGainSecAt 的 major 钳制。调用方全在本文件内,传的是字面量或 `def.minRealm`' +
      '(丹方定义,恒 >= 0),外部无调用 —— 实测传负数才有差异,构不出来。'
  },
  {
    file: 'src/core/pillValue.ts',
    text: 'Math.max(0, craft.rank - bearableRank(def.minRealm))',
    why:
      'auditCraftRate 的超规格档数。craft.rank 恒 >= 1,实测本仓 72 张丹方都不产出负数;' +
      '该钳制防的是将来出现 rank < 准入阶的丹方。'
  },
  {
    file: 'src/stores/settings.ts',
    text: 'Math.max(0, Math.min(MAX_EQUIP_TIER, Math.floor(asFiniteNumber(sk.keepMinTier, 0, 0))))',
    why:
      'asFiniteNumber 带 min=0 时内部已 `Math.max(0, n)`(实测 asFiniteNumber(-100,0,0)===0)。' +
      '同文件 :76 的 Math.max(0, asTimestamp(...)) 不同 —— asTimestamp 放行负数(实测 -100 原样返回),' +
      '那处是真守卫,已有判据。'
  },
  {
    file: 'src/utils/storage.ts',
    text: 'Math.max(0, (clean[1] ?? 0) + scalar)',
    why:
      'clean[g] 由上一行 `clean[g] = Math.max(0, n)` 赋值,恒 >= 0;scalar 是 v1 迁移旧字段,同样经钳制。' +
      '两项都非负,和的钳制不可达。'
  },
  {
    file: 'src/core/tribulationDecision.ts',
    text: 'Math.max(0, 1 + trace.hpLeft)',
    why:
      'failedRate 的坠劫深度补数。hpLeft 深负(如 -3)时 1+hpLeft 为负,看似需要钳制,' +
      '但返回值外层已有 `Math.max(0.25, ...)` 兜底 —— 负 shortfall 只会把 rate 拉低到 0.25 以下、再被抬回 0.25。' +
      '实测八档境界 × 五档护持共 40 组参数,去掉本处钳制后 expectedRate 逐位相同。'
  },
  {
    file: 'src/core/reforge.ts',
    text: 'Math.max(0, inst.affixes.length - 1)',
    why:
      'sealCapacity 的封存上限。零词条件的件是**真实存在**的(凡品 affixes 区间是 [0,1],' +
      '实测固定种子 4000 件里 1216 件零词条),但变异成 `inst.affixes.length - 1` 之后仍然观察不到:' +
      '它的两个消费点都是 `sealed.length >= sealCapacity(inst)`,sealed.length 恒 >= 0,' +
      '0 与 −1 都让判据成立(实测 `0 >= -1` 与 `0 >= 0` 同为真);' +
      '唯一显示它的是重铸页脚那行「已封存 n/上限」,而零词条件的 reforgeCost 与 sealCost 双双为 null,' +
      '页脚走的是「无可重铸词条」那一支,分母印不出来。'
  },
  {
    file: 'src/core/exploration.ts',
    text: 'if (!s) return',
    why:
      'runBattle 的「会话已结束」早退是第二道。它只有一个调用点(tickExploration 末尾),' +
      '而那个函数开头 `const s = adventure.session; if (!s || player.dead) return` 已经挡过;' +
      '中间到 runBattle 之间全是同步代码(实测整段 0 处 await),没有任何让会话变 null 的窗口。' +
      '去掉本处 guard 后,`regionDef(s.regionId)` 在 s 为 null 时会抛 —— 但那条路径构造不出来。' +
      '留着防的是「将来有人给 tickExploration 中间加 await」。'
  },
  /*
   * ---- 以下八条来自「扫描范围扩到 composables / ui」后第一次跑出来的漏报 ----
   * 它们全是 UI 归一化函数里的坏值钳制。逐条实测过:去掉后**读数不变**,
   * 因为同一条链上还有另一道兜底,或该函数的消费点本来就只判非零。
   */
  {
    file: 'src/ui/apprenticeMark.ts',
    text: 'Math.max(0, Math.min(LEVEL_PIPS, Math.round(have)))',
    why:
      'levelPips 的层数刻度。去掉下限后 `i < n` 对负 n 仍全为 false(实测 levelPips(-3) 两种写法都给 0 格亮);' +
      '去掉上限后 n 可以大于 LEVEL_PIPS,而输出数组长度写死是 LEVEL_PIPS、判据是 `i < n` —— 20 格的实测结果与 99 相同。' +
      'NaN 两侧都落到 0。'
  },
  {
    file: 'src/ui/orbForm.ts',
    text: 'Math.max(0, Math.floor(form.particles))',
    why:
      'orbRingIndexes 的环序号表。`Array.from({ length: 负数 })` 与 `{ length: 0 }` 都产出空数组' +
      '(实测 rings=-2 两种写法都给 `[]`);FORMS 里的 rings 是常量 1~4,运行期取不到负值。'
  },
  {
    file: 'src/ui/setMark.ts',
    text: 'Math.max(0, Math.floor(have))',
    why:
      '套装件数的已凑档。下游是 `Array.from({length: SET_PIPS}, (_, i) => i < n)` —— 负 n 与 0 都给全 false;' +
      '而同文件另有一条上界钳制管住「凑过头」那一侧,那侧才有可见差别。'
  },
  {
    file: 'src/ui/ratingGauge.ts',
    text: 'Math.max(0, next - score)',
    why:
      'toNext(距下一星还差多少)。它只在 `next` 存在时被读,而 next 由星级档表推出、恒大于 score;' +
      '更关键的是消费点写的是 `toNext > 0 ? 距下一星还差 N : 已至顶`——负数与 0 走同一支(实测 -2 与 0 都进「已至顶」)。'
  },
  {
    file: 'src/ui/ratingGauge.ts',
    text: 'Math.max(0, Math.min(1, g.progress))',
    why:
      'gaugeFill 的档内进度下限。外层的 `Math.max(0, Math.min(1, (stars - 1 + progress) / 5))` 已把结果夹回 [0,1],' +
      '实测 progress 取 -2 / 5 / NaN 时,内外两道给的都是同一个填充分数(0.4 / 0.6 / 0.4)。'
  },
  {
    file: 'src/ui/tribWave.ts',
    text: 'Math.max(0, wave.hpPct)',
    why:
      'tribBarPct 的余血下限。下一行 `Math.max(0, Math.min(100, raw))` 同样把它夹回 0(实测 hpPct=-5 两种写法都给 0)。' +
      '下界这一侧是重复的,上界那一侧才有可见差别。'
  },
  {
    file: 'src/ui/tribWave.ts',
    text: 'Math.max(0, Math.min(100, raw))',
    why:
      '同上那一行的 `Math.max(0, …)` 部分。`raw` 的分子已被上一行钳到 >= 0、`top` 恒正,故 raw 恒 >= 0,' +
      '下限不触发;真正管住「柱子画到框外」的是 `Math.min(100, …)`。'
  },
  {
    file: 'src/ui/codex.ts',
    text: 'Math.max(0, Math.min(8, Math.floor(rank || 0)))',
    why:
      'qualityOfRank 的品质下标。`rank || 0` 已把 undefined / NaN 归 0,而 rank 的来源是品阶表本身;' +
      '更关键的是下一行是 `QUALITIES.find(q => q.rank === r) ?? QUALITIES[0]` —— 找不到档位也回落到首档,' +
      '与「先夹到 0」同值。实测 rank 取 -5 / 99 / NaN 三档,两种写法都给同一个品阶对象。'
  },
  {
    file: 'src/ui/codex.ts',
    text: 'Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))',
    why:
      'artifactStage 的重数。`level || 0` 已归掉缺省与 NaN;它的消费是 `lv >= ARTIFACT_MAX_LEVEL → 3` / `lv >= 1 → 2` / ' +
      '否则 `collected ? 1 : 0` —— 负值与 0 落在同一支,超上限与上限也落在同一支。' +
      '注:同文件两处(artifactStage 与法宝条目)共用同一个归一化文本,故名单只需一条。'
  },
  {
    file: 'src/ui/codex.ts',
    text: 'Math.max(0, Math.min(1, mastery))',
    why:
      '丹方掌握度的 [0,1] 夹取。mastery 来自 `lore.recipeMastery` → `recipeLore[id]`,而 lore 的 sanitize 是 ' +
      '`clampMap(recipeLore, 0, 1, …)`、写入端 `addRecipeMastery` 也先夹一道 —— 运行期取不到越界值。' +
      '注:同文件 pillStage 与 describePill 两处共用同一个归一化文本,故名单只需一条。'
  },
  {
    file: 'src/ui/codex.ts',
    text: 'Math.max(0, Math.min(DAOLU_STAGE_MAX, rec.depth))',
    why:
      '人缘册的深度。`rec.depth` 由 `daoluDepthOf` 算出:它在一个 3 项的 DAOLU_DEPTH_AT 上循环、' +
      '深度取 `i + 1`,值域天然是 [0, 3];而 `DAOLU_STAGE_MAX = 3` 正好是同一把尺。' +
      '两侧都取不到界外,故钳不钳同值。'
  },
  {
    file: 'src/ui/ratingGauge.ts',
    text: 'Math.max(0, Math.min(1, (stars - 1 + progress) / 5))',
    why:
      'gaugeFill 的**外层**夹取。`stars` 已被上一行夹到 [1,5]、`progress` 已被夹到 [0,1],' +
      '于是 `(stars - 1 + progress) / 5` 的值域正好是 [0, 1] —— 外层的上下钳都是第二道。' +
      '要它触发的唯一办法是先去掉上一行那两道,而那是另一处变异(已单列为等价)。'
  },
  {
    file: 'src/ui/worldMark.ts',
    text: 'Math.max(0, Math.min(REALMS.length - 1, Math.floor(major)))',
    why:
      'worldLeap 的境界下标下限。`worldLeap` 只在 `Number.isFinite(major)` 之后才走到这一行,' +
      '而它判完立刻 `worldOf(m)` + `if (world.start !== m || m === 0) return undefined` —— ' +
      'm 为负时 worldOf 返回首界、start 是 0,`0 !== -1` 成立直接返回 undefined。' +
      '实测 major 取 -1 / -5 时,钳与不钳都给 null。'
  },
  {
    file: 'src/core/forge.ts',
    text: 'Math.max(0, cost.wudao - resources.wudao)',
    why:
      'artifactShortfall 的悟道点缺口。这一行只在 `hasSmall(\'wudao\', cost.wudao)` 为假时执行,' +
      '即 `resources.wudao < cost.wudao` —— 差值必然为正,钳制不触发(实测存量 -9、成本 -5 时走的是' +
      '`-9 >= -5` 为假那一支,差值 4,Math.max 同样没起作用)。' +
      '它防的是「有人把上面那句 hasSmall 换掉」,不是可达分支。'
  },
  {
    file: 'src/core/eventEngine.ts',
    text: 'if (!def) return',
    why:
      '际遇赠丹药的 `pillDef(id)` 判空。id 的来源只有两支:`effect.id`(数据表里手写的,dataTextAudit 钉着' +
      '「事件奖励引用的丹药都存在」)与 `randomEventPill(major)` —— 后者是从 `PILLS.filter(p => p.minRealm <= major)`' +
      '里抽 `.id`,抽出来的必然在表里。实测 PILLS 的 p.minRealm 最小是 0,故 major 取 0..20 池子都在 7~72 条,' +
      '两支都产不出未登记的 id。'
  },
  {
    file: 'src/core/gauntlet.ts',
    text: 'if (!y) return',
    why:
      'mergeRules 内层 mods(x, y) 的第二侧早退。去掉后 `{ ...x }` 照常展开,而 `for (const k in undefined)`' +
      '在 JS 里合法、迭代 0 次,返回的对象与 x 逐字段相同(实测 JSON 相等);调用方只读字段、不比引用。' +
      '与同文件 `if (!x) return` / `if (!y) return x` 那几条同型。'
  },
  {
    file: 'src/core/eventEngine.ts',
    text: 'if (!id) return',
    why:
      '际遇赠丹药的 `randomEventPill(major)` 返回值判空(效果未指定 id 时才会走到)。' +
      '那个函数是 `PILLS.filter(p => p.minRealm <= major)` 里按权重抽 `.id`,池子实测 major=0 时 7 条、' +
      'major=20 时 72 条 —— 抽不到 null。下一行 `pillDef(id)` 另有一道判空兜着。'
  },
  {
    file: 'src/core/loot.ts',
    text: '.length === 0)',
    why:
      'randomDropArtifact 的池空判。池子是 `ARTIFACTS.filter(a => a.fromTier <= tier)`,而 ARTIFACTS 里' +
      'fromTier 最小就是 1、tier 从 1 起(实测 tier=1 时池子 1 条、tier=32 时 56 条),构造不出空池。' +
      '留着防的是将来把唯一那件 fromTier=1 的法宝改高阶。'
  },
  {
    file: 'src/core/loreService.ts',
    text: 'if (!def) return',
    why:
      'noteEnemy 的 `enemyDef(enemyId)` 判空。调用方传的 id 来自 placeContent 的 enemies/boss 与战斗快照,' +
      '而 data 侧有「每个敌人都有技艺」那条普查钉着 ENEMIES 与 enemyDef 的覆盖(实测 ENEMIES 里 0 条查不到)。' +
      '留着防的是将来新增敌人只加进 ENEMIES、漏登记 ID 映射。'
  },
  {
    file: 'src/core/loreService.ts',
    text: '.length === 0)',
    why:
      'roollFieldMaterial / noteSmithingUsed 的灵材池空判。池子是 `materialsNearRank(rank, bucket)`,' +
      '实测 rank 取 1..32、bucket 取 any/herb/ore 共 27 组,最小也有 2 条(rank=1 时 herb/ore 各 2)。' +
      '两个函数都是这一处形状,故名单只需一条。'
  },
  {
    file: 'src/core/offline.ts',
    text: 'Math.max(0, 1 - sampleFight.playerHpPct)',
    why:
      '离线整段结算里的「平均受伤占比」。`playerHpPct` 由 combat.ts 的 `hpPct` 产出,那个函数本身就写的是 ' +
      '`Math.max(0, Math.min(1, ratio(...)))` —— 值域恒在 [0,1],故 `1 - p` 恒 >= 0;' +
      '下游 `applyRegionWinBatch` 另有一道 `if (!Number.isFinite(damageTakenPct) || damageTakenPct < 0) return`。' +
      '两道都不可达,这一处钳制是第三道。'
  },
  {
    file: 'src/core/offline.ts',
    text: 'Math.max(0, 1 - bossResult.playerHpPct)',
    why: '同上,首领战那一处;playerHpPct 同由 hpPct 产出、下游 updateRegionStats 同样拒收负数。'
  },
  {
    file: 'src/core/offline.ts',
    text: 'Math.max(0, (adventure.session.endsAt - nowMs) / 1000)',
    why:
      '离线上限之后那句「历练在途 · 尚余 N」的剩余秒数(left)。「在途」的前提是会话没在离线期间走完 ——' +
      '而前面那段只要 `simSec >= remainSec` 就 `adventure.setSession(null)`,故走到这一句时 ' +
      '`adventure.session.endsAt` 必然大于 nowMs,差值恒正。' +
      '实测离线 1 小时、会话已过期时,notes 里出现的是「历练完成」而不是「尚余 -60秒」,session 也已清空。'
  },
  {
    file: 'src/core/pillService.ts',
    text: 'Math.max(0, stoneLimited ? stoneRoundsRaw : 0)',
    why:
      '`ratio()` 的返回值已先经 `Number.isFinite` 判过:`stoneLimited` 为假时三元直接给字面量 0,' +
      '为真时 stoneRoundsRaw 是 `Math.floor(有限数)` —— 两者都非负,外层的 max 是第二道。' +
      '注:`Math.floor(有限负数)` 才可能为负,而 ratio 在 a.m=0 时返回 0、否则 (a.m/b.m)*10^diff 恒正。'
  },
  {
    file: 'src/core/suppress.ts',
    text: 'if (!rate.resource) return',
    why:
      'suppressRateLine 的「这处地界没有次级物产」早退。`rate` 来自 suppressRateFor → suppressYield,' +
      '后者按 `YIELD_BY_TAG.find(y => region.eventTags.includes(y.tag))` 查表 —— 44 个区域里每个都命中一条' +
      '(data 侧有覆盖普查),故 resource 恒存在。注:同文件 `if (!rate) return \'—\'` 那条是另一处,已有判据。'
  },
  {
    file: 'src/core/tribulationDecision.ts',
    text: 'Math.max(0, restore)',
    why:
      'easeDiscount 的 restore 下限。`relief.healRestore / shieldRestore` 全部来自 data/linggenAffinity 的静态表' +
      '(取值 0.3~0.5),再由 core/linggenAffinity 的 `Math.max(out.x, aff.relief.x ?? 0)` 聚合 —— 两道都保证 >= 0。' +
      '实测 restore 取 -1 / -5 与取 0 得到同一组 sustain/guard 读数。'
  },
  {
    file: 'src/core/tribulationDecision.ts',
    text: 'Math.max(0.25, 0.2 + progress * 0.18 + shortfall * 0.05)',
    why:
      'failedRate 的下限 0.25。`progress` 是 0..1 的进度、`shortfall` 是已钳到非负的坠劫深度补数,' +
      '逐项取极值得到的最小值是 0.2 + 0 + 0 = 0.2 —— 看起来该触发,但 `shortfall` 那一路的外层算式' +
      '是 `Math.max(0, 1 + trace.hpLeft)`,而 hpLeft 深负时那条已被单列为等价(见上一条);' +
      '两处合起来只有「progress=0 且 hpLeft<=-1」才会跌破 0.25,而那要求本场一次都没推进且坠劫深于满血 ——' +
      '实测 40 组境界×护持参数里 0 组命中。'
  },
  {
    file: 'src/core/earlyGameService.ts',
    text: 'Math.max(0, opt.duration)',
    why:
      '突破准备的就绪时刻。`opt.duration` 来自 BREAKTHROUGH_PREP_OPTIONS 的静态表(取值 0 或 180),' +
      '没有运行期写入路径;`Math.max(0, …)` 只在表被改成负数时才生效。判据侧要抓它得先造一个坏选项,' +
      '而那已经不是在验这段代码了。'
  },
  {
    file: 'src/stores/market.ts',
    text: "Math.max(0, Math.floor(Number('slot' in raw ? raw.slot : posts.length) || 0))",
    why:
      '寄卖条目清洗时的格号下限。这个字段的值随后就被下一句 `.map((p, i) => ({ ...p, slot: i }))` 整体重排成' +
      '0..n-1 —— 清洗阶段写成 -1 还是 0,玩家看到的格子位置完全一样。'
  },
  {
    file: 'src/core/inflationAudit.ts',
    text: 'Math.max(0, fullPower - withParts({ gongfa: false }))',
    why: '与同文件 realm / equipFlat / equipMod 那三条同型:fullPower 减去一个非负加数,差恒非负。审计口径的防御。'
  },
  {
    file: 'src/core/inflationAudit.ts',
    text: 'Math.max(0, fullPower - withParts({ other: false }))',
    why: '同上,other 那一项;去掉一个非负加数后的总量必然不大于原值。'
  },
  {
    file: 'src/core/samsaraService.ts',
    text: 'Math.max(0, avengedCount() - vow.baseAvenged)',
    why:
      '与同文件 branch 那条同型(上一轮已登记)。`avengedCount()` 数的是 `nemeses.filter(n => n.avengedAt !== undefined)`,' +
      '而 nemeses 只增不减;vow.baseAvenged 记的是立题那一刻的读数。基线高过现值只可能来自坏档,' +
      '而 player.sanitize 会把 nemeses 剔成数组、vow 的 base 字段逐项 asFiniteNumber 归零 —— 构造不出来。'
  },
  {
    file: 'src/core/secretRealm.ts',
    text: 'if (!def) return',
    why:
      'fightSecretLayer 的秘境定义判空是第二道。`state.realmId` 的来源只有两处:' +
      '`enterSecretRealm`(开头就 `if (!def) return` 挡掉未知 id)与读档 —— 而 player.sanitize 里' +
      '`SECRET_REALMS.some(r => r.id === sr.realmId)` 不认识的直接 `secretRealm.value = null`。' +
      '实测往 store 硬写一个不存在的 realmId 再调 sanitize,secretRealm 变 null、fightSecretLayer 返回 null;' +
      '不跑 sanitize 直接调才会抛(def 为 undefined 时读 rewardMult)。' +
      '留着防的是「将来放宽 sanitize 或新增一条不校验的入口」。'
  },
  {
    file: 'src/core/reforge.ts',
    text: 'if (!template) return',
    why:
      'reforgeEquipment 里的模板判空是第二道。同一个函数开头调的 reforgeCost 第一行就是 ' +
      '`if (!equipmentTemplate(inst.templateId)) return null`,而 cost 为 null 时上面已经 return false ——' +
      '走到这一行时模板必然存在。留着防的是「将来有人把 reforgeCost 那道判空删掉」。' +
      '实测把这句改成恒假后 5 个 reforge 相关 spec 全绿。'
  },
  {
    file: 'src/core/reforge.ts',
    text: '.length === 0)',
    why:
      '重铸抽取池的空判。池子是 AFFIXES 按「部位 + 品质档」过滤出来的,实测 5 个部位 × 9 档品质' +
      '(共 45 组,加上基础品质共 81 组)= 池子最小也有十余条,而 wantCount - kept.length 至多等于该品质的' +
      '最大词条数(神品 9)、kept 又全是池外 —— 抽不到空。留着防的是将来把某个部位的可配词条删光。' +
      '注:本条是 `pool.length === 0)` 这个形状在 reforge.ts 里的一处;闪烁扫描按「文件 + 归一化原文」匹配。'
  },
  {
    file: 'src/core/suppress.ts',
    text: 'Math.max(0, Math.min(dt, remain))',
    why:
      'heldSecOf 的「本段内镇压仍生效的秒数」。去掉下限钳制后 remain 可以为负,' +
      '但两处消费点都是 `if (heldSec <= 0) continue` —— 负数与 0 走同一条路,跳过该区。' +
      '`Math.min(dt, remain)` 的上限钳制才是真正管住「不结越界那一段」的那一道(跨复聚线那条用例钉着它)。'
  },
  {
    file: 'src/core/daoluService.ts',
    text: '.length === 0)',
    why:
      'destinedCandidate 的「本世没有深交过的人」早退。去掉后 deep 为空时 `rng.chance(0)` 恒假' +
      '(实测 RandomService.chance(0) 在 rand=0 与 rand=0.999999 下都为 false),同样返回 null;' +
      '而 chance 之后那段 `deep[rng.int(0, -1)]` 根本走不到。' +
      '留着的理由是少做一次随机数采样:宿缘的掷签不该被「本来就没有人」这种情形消耗掉。'
  },
  {
    file: 'src/ui/apprenticeMark.ts',
    text: 'Math.max(0, next.min - b)',
    why:
      'toNextBond 的差额钳制。rank 的算法是「取最后一个 BOND_TITLES[i].min <= b 的 i」,' +
      '而 next 就是 BOND_TITLES[rank + 1] —— 若 next.min <= b,循环会把 rank 推到那一阶,' +
      'next 就不是它了。所以 next.min > b 恒成立,差额必为正,钳制不改结果。' +
      '留着是因为这段读起来像「算差额」,钳一下能让下一个人不必回头确认 rank 的循环不变式。'
  },
  {
    file: 'src/ui/toastFlash.ts',
    text: '.length === 0)',
    why:
      'toastFlash 的「本帧没有新增」早退。announce 开头已经有两道更早的闸:' +
      '`if (toasts.length === 0) return` 挡空数组,`if (newest <= lastAnnouncedId) return` 挡无新 id;' +
      '走到 fresh 那一行时 toasts 非空且至少有一条 id > lastAnnouncedId,故 fresh 不可能为空。' +
      '实测:删掉这一行后全量 6945 条仍绿(我照它补过一条 announce([]) 的判据,回退,因为它走的是开头那道闸)。'
  },
  {
    file: 'src/ui/setMark.ts',
    text: 'if (!crest) return',
    why:
      'CRESTS 当前与 SET_DEFS 一模一样的六套(实测 6/6 全覆盖),所以这条早退走不到。' +
      '它不是死代码,是给「新增套忘了登记线纹」留的闸:去掉后新套会拿到 crest: undefined,' +
      '界面画出一个缺线纹的形制 —— 那比不画更糟。注释里写着同样的意图。'
  }
]

/** 归一化:压掉空白差异,让名单不因排版重排而失配 */
const norm = t => t.replace(/\s+/g, ' ').trim()

/** 命中名单就返回那条(含 why),否则 undefined */
function equivalentOf(t) {
  const rel = t.file.slice(ROOT.length + 1)
  const key = norm(t.text)
  return EQUIVALENT.find(e => e.file === rel && norm(e.text) === key)
}

function targets(dir, out = []) {
  /*
   * 必须排序:readdirSync 的顺序由文件系统决定,不同机器/不同次检出可能不同。
   * 分片按「候选点序号」切,顺序一变,同一片在两次运行里就是不同的代码 ——
   * 既无法复现,也会漏掉或重复某些点。
   */
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) targets(p, out)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p)
  }
  return out
}

/*
 * 扫描范围:core / stores / utils / composables / ui。
 *
 * 原先前三个目录,**composables 与 ui 整个没进过扫描**。实测这两处的守卫数量:
 * composables 16 点、ui 51 点(共 8 + 37 个文件)—— 与已扫的三个目录同量级,
 * 且它们同样承载「坏值 / 空池 / 归一化」那几类守卫(useBrewing 的钳制、
 * useModalStack 的栈判空、ui/codex 的查表兜底、ui/orbForm 的进度环读数)。
 *
 * `components/*.vue` 与 `views/*.vue` 仍不收:它们改的是模板与事件,守卫基本都落在
 * 被调用的 core/ui 函数里,对模板做文本替换容易产出「结构合法但语义不同」的变异,
 * 那种变异既不好判读也不好写等价理由 —— 收益远低于噪声。真要覆盖,得走
 * `@vue/compiler` 的 AST 而不是文本。
 */
const files = targets(join(ROOT, 'src/core'))
  .concat(targets(join(ROOT, 'src/stores')))
  .concat(targets(join(ROOT, 'src/utils')))
  .concat(targets(join(ROOT, 'src/composables')))
  .concat(targets(join(ROOT, 'src/ui')))
const found = []

/*
 * 一个模块的判据未必写在同名 spec 里。
 *
 * 实测:bountyService.ts 的同名 spec 只测「募丹境界可达」2 条,
 * 真正钉住 bountyRemainingSec 的断言在 src/data/bounty.spec.ts。
 * 只跑同名 spec 时那处钳制被判「漏」—— 而手动改坏了跑别处的 spec 会红。
 * 于是整份报告里混进大量假盲区,分不清该补哪条。
 *
 * 故为每个模块反查「src 下哪些 spec 引用了它」,一并纳入。
 */
const allSpecs = []
const collectSpecs = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { collectSpecs(p); continue }
    if (e.name.endsWith('.spec.ts')) allSpecs.push(p)
  }
}
collectSpecs(join(ROOT, 'src'))

/** 模块 → 引用它的 spec(含同名 spec,若存在) */
function specsForModule(file) {
  const same = file.replace(/\.ts$/, '.spec.ts')
  const rel = file.slice(ROOT.length + 1)
  /*
   * 判据可能用 `./x` 或 `@/core/x` 两种写法引用。
   *
   * 原先前两种之外还收了**裸模块名**(`x`),那是误纳:任何 spec 里出现字符串 'forge'
   * 都算「引用了 forge.ts」—— 实测 buildingBatch.spec.ts 与 dongfu.spec.ts 就这样被算成
   * forge 的判据。无关 spec 一旦自己失败,变异就会被判成「抓到」,覆盖率缺口被掩盖。
   */
  const base = rel.replace(/^src\//, '').replace(/\.ts$/, '')
  const forms = [`./${base.split('/').pop()}`, `@/${base}`]
  const out = new Set()
  for (const spec of allSpecs) {
    if (spec === same) { out.add(spec); continue }
    const src = readFileSync(spec, 'utf-8')
    if (forms.some(f => src.includes(`'${f}'`) || src.includes(`"${f}"`))) out.add(spec)
  }
  return [...out]
}

/*
 * 先**全量收集**,再按上限取样。
 *
 * 原先在收集时就 `if (found.length >= LIMIT) break` 一路跳出文件循环 ——
 * 于是默认 limit=40 时只扫到遍历序靠前的少数文件就停了,
 * 而 forge / offline / reincarnation / samsaraService / save / mortalWorldService
 * 分别排在 127 个文件的第 51 / 85 / 102 / 108 / 109 / 82 位,**仍然一个都没进过扫描**。
 * 上一版只去掉了「同名 spec」的前置条件,没解决这个 —— 覆盖率还是假的。
 */
/**
 * 把 `//` 与 `/* *\/` 注释抹成等长空白,保留换行 —— 行号与列偏移都不动。
 *
 * 不能简单删掉:候选的 line 是从这个字符串算的,删了会错位。
 * 也不能只处理行首:行尾注释(`foo() // 原先是 bar()`)同样会把旧代码带进来。
 * 字符串字面量里的 `//`(如 URL)会误伤,但本仓源码里没有这种写法,
 * 真出现了也只会让那一条候选漏扫,不会产生假候选。
 */
function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)))
}

/** 关联 spec 超过这个数的模块不参与变异扫描(见收集循环里的注释) */
const SPEC_FANOUT_CAP = 20
/** 因关联 spec 过多而跳过的模块,收尾时列出来 */
const tooWide = []

const perFile = []
for (const file of files) {
  const src = readFileSync(file, 'utf-8')
  /*
   * 不强求同名 spec。原先这里 `readFileSync(同名 spec) catch continue` —— 于是
   * save / forge / offline / reincarnation / marketService / samsaraService /
   * mortalWorldService / fingerprints 这几个没有同名 spec 的模块**从未被扫过**
   * (实测漏掉 28 个可变异点),而它们都被别的 spec 真实引用着。
   * specsForModule 本来就按引用关系找测试,这才是该用的判据。
   */
  const specs = specsForModule(file)
  if (specs.length === 0) continue
  /*
   * 关联 spec 过多的模块跳过。
   *
   * player / resources 这类核心 store 被上百个 spec 引用,查一个变异点就要起上百次
   * vitest —— 实测第 27 片跑了 10 分钟还没完,直接顶死 job 超时。
   * 这种模块的覆盖率本来就靠全量 test 兜着,不值得拿变异扫描的预算去换。
   */
  if (specs.length > SPEC_FANOUT_CAP) {
    tooWide.push({ file, count: specs.length })
    continue
  }
  /*
   * 只扫**代码**,不扫注释。
   *
   * 原先直接在 src 上 matchAll,于是注释里复述的旧写法(`Math.max(0, Math.floor(raw.finishAt))`
   * 这类「原先是……紧跟着……」的说明)也会被当成候选。市场那处早就修好了,
   * 扫描却仍在报「漏掉的」—— 白花一轮排查,还容易让人误以为那里没测试覆盖。
   *
   * 抹注释时保持换行与长度不变,行号才不会错位。
   */
  const code = stripComments(src)
  const mine = []
  for (const { name, re, rep } of PATTERNS) {
    for (const m of code.matchAll(re)) {
      const line = code.slice(0, m.index).split('\n').length
      mine.push({ file, specs, name, index: m.index, line, text: m[0], mutated: m[0].replace(re, rep) })
    }
  }
  // 钳制下限走括号深度扫描(见 maxZeroSites 的注释:正则只吃得下一层嵌套)
  for (const s of maxZeroSites(code)) {
    const line = code.slice(0, s.index).split('\n').length
    mine.push({ file, specs, name: '钳制下限', index: s.index, line, text: s.text, mutated: s.mutated })
  }
  if (mine.length > 0) perFile.push(mine)
}

/*
 * 取样:跨文件轮流取一,而不是把前面的文件取干净。
 * 这样 limit=40 也会均匀铺到几十个不同模块,而不是挤在前三个文件里。
 */
const all = []
for (let round = 0; ; round += 1) {
  let picked = false
  for (const mine of perFile) {
    const one = mine[round]
    if (!one) continue
    all.push(one)
    picked = true
  }
  if (!picked) break
}

/*
 * 分片轮转:把全部候选点切成长度为 LIMIT 的连续块,按**日期**选一块。
 *
 * 定长取样有个致命问题:每次扫的都是同一批 40 个点,而全库 454 个 ——
 * CI 天天跑,却只覆盖其中 8.8%,剩下的永远轮不到。
 * 按日偏移后,`ceil(454 / 40) = 12` 天覆盖全部;同一天内结果稳定,便于复现。
 *
 * 用 `--limit=N` 显式指定时仍是「从头取 N 个」,不做日期偏移 ——
 * 本地想复现某一段时不该被当天日期干扰。
 */
/*
 * 与上面解析 LIMIT 时认的**同一组**格式对齐:
 * `--limit=N` 或 独立的 `--limit`(后跟值)。
 * 先前用 startsWith('--limit'):`--limits=5` 这种拼错也会被当成显式,
 * 于是 LIMIT 退回默认 40、分片却固定取第 0 片 —— 反复跑都只扫第一批,还不报错。
 */
const explicit = process.argv.some(a => /^--limit(=|$)/.test(a))
const shardCount = Math.max(1, Math.ceil(all.length / LIMIT))
/*
 * 推进分片的依据:优先用 CI 的 run number,退回日历日。
 *
 * 日历日有个洞 —— **CI 不是每天都跑**。周末或无人提 PR 的那几天照样占掉分片位置,
 * 于是一周只跑五次也可能始终落在同一批余数上。run number 是单调递增的,
 * 每次 CI 触发都 +1,与「扫描跑了几次」同义,不需要自己持久化计数器。
 * 本地没有该变量时退回日期:单机开发看的是「今天扫哪片」,这个语义更直观。
 */
const runNumber = Number(process.env.GITHUB_RUN_NUMBER)
const advance = Number.isFinite(runNumber) && runNumber > 0 ? runNumber : Math.floor(Date.now() / 86_400_000)
/*
 * `--shard=N`:本地指定扫哪一片。
 *
 * 按日期取片时,同一天反复跑都落在同一片 —— 想把剩下的分片也过一遍,
 * 只能硬造 GITHUB_RUN_NUMBER 或改系统日期,两种都不好用。
 * 加一个显式入口,便于「今天这一片查完了,接着看下一片」。
 * 与 `--limit` 互斥规则同:显式指定分片时不再做日期偏移。
 */
const shardArg = process.argv.find(a => /^--shard=/.test(a))
const explicitShard = shardArg === undefined ? null : Number(shardArg.slice(8))
if (explicitShard !== null && (!Number.isInteger(explicitShard) || explicitShard < 1 || explicitShard > shardCount)) {
  console.error(`--shard 须是 1~${shardCount} 的整数(共 ${shardCount} 片)`)
  process.exit(1)
}
const shard = explicitShard !== null ? explicitShard - 1 : explicit ? 0 : advance % shardCount
found.push(...all.slice(shard * LIMIT, shard * LIMIT + LIMIT))

if (tooWide.length > 0) {
  console.log(`因关联 spec 过多而跳过 ${tooWide.length} 个模块(阈值 ${SPEC_FANOUT_CAP}):`)
  for (const t of tooWide) console.log(`  ${t.file.slice(ROOT.length + 1)}  关联 ${t.count} 个 spec`)
}

console.log(
  `扫到 ${found.length} 个可变异点(上限 ${LIMIT},来自 ${new Set(found.map(f => f.file)).size} 个模块)` +
    (explicitShard !== null ? `,显式分片 ${shard + 1}/${shardCount}(全库 ${all.length} 个)` : explicit ? `,显式 limit 故取第一段` : `,今日分片 ${shard + 1}/${shardCount}(全库 ${all.length} 个)`)
)

/** 上一次陷入 infra 的读数;`runSpec` 每批开始时清空,批末据此决定「没抓到」还是「设施坏了」 */
let lastInfra = null

/**
 * 跑给定的一批 spec;任一有用例失败即算抓到。
 * 三态里只有 `caught` 能让变异扫描判定「这条守卫有牙」。
 */
async function runSpec(specs) {
  lastInfra = null
  for (const spec of specs) {
    const one = await runOneSpec(spec)
    // 先跑到的失败即可返回;infra 要继续看后面的 spec 是否真能抓到
    if (one.verdict === 'caught') return one
    if (one.verdict === 'survived') continue
    // infra: 记下来,但别因为某个 spec 起不来就下结论
    lastInfra = one
  }
  const res = lastInfra ?? { verdict: 'survived' }
  lastInfra = null
  return res
}

/**
 * 跑一次被变异文件的 spec。
 *
 * **必须异步**:先前用 spawnSync,它有两大害处 ——
 *  1. 一次 spec 跑 3.7 秒,这期间事件循环被完全堵死,信号处理器排在队列里执行不了;
 *     于是 SIGTERM 到达时 restoreInflight 跑不到,源码就留在变异后的状态。
 *     (实测:timeout 掐在两次 spawnSync 之间时能恢复,掐在里头就恢复不了 —— 靠运气。)
 *  2. 子进程自身也可能迟迟不退,同步等待没有超时可言。
 * 改用 spawn + Promise,等 spec 的同时事件循环照常响应信号。
 *
 * 退出码不能直接当「抓到了」用:启动失败、语法错误、setup 崩掉都会非零退出,
 * 把设施故障记成「这条守卫有牙」等于给自己发一张假绿灯。故按 vitest 的 JSON
 * 报告区分三态 —— 只有「跑完了且有用例失败」才算抓到。
 *
 * @returns {'caught' | 'survived' | 'infra'}
 */
function runOneSpec(spec) {
  const out = join(ROOT, '.vitest', 'mutation-scan.json')
  return new Promise(resolveOne => {
    const child = spawn('bunx', ['vitest', 'run', spec, '--reporter=json', `--outputFile=${out}`], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr.on('data', d => {
      stderr += String(d)
    })
    child.on('error', () => resolveOne({ verdict: 'infra', detail: '子进程起不来' }))
    child.on('close', status => {
      let report
      try {
        report = JSON.parse(readFileSync(out, 'utf-8'))
      } catch {
        if (isTransformFailure(stderr)) {
          resolveOne({ verdict: 'caught' })
          return
        }
        // stderr 前几行常是 esbuild/oxc 的固定告警,取最后一行更像真错误
        const tail = stderr.trim().split('\n').filter(Boolean).slice(-1)[0]
        resolveOne({ verdict: 'infra', detail: (tail ?? `退出码 ${status}`).slice(0, 160) })
        return
      }
      resolveOne(verdictOf(report, status))
    })
  })
}

/** 从 vitest 的 json 报告判结论 */
function verdictOf(report, status) {
  const failed = (report.testResults ?? []).filter(r => r.status === 'failed')
  if (failed.length > 0) return { verdict: 'caught' }
  /*
   * 一条用例都没跑、退出码还非零 —— 这不是「设施故障」,而是变异把模块改到编译不过:
   * bundler 建不起 import 图,spec 连用例发现阶段都进不去(报 numTotalTests: 0)。
   * 判 caught 才对:变异确实改变了代码,只是改坏得太狠。
   *
   * 原先一律判 infra,于是 runSpec 接着试下一个 spec、全 infra,最后被兜底成「漏掉」——
   * offline.ts:217 那条已有判据且能抓的真守卫就这样被冤枉过(当前 Math.max 正则在
   * 两层以上嵌套括号处会截断,留下一个多余右括号)。
   */
  if ((report.numTotalTests ?? 0) === 0) {
    return status !== 0 ? { verdict: 'caught' } : { verdict: 'infra', detail: '没有用例被执行' }
  }
  if (status !== 0) return { verdict: 'infra', detail: `退出码 ${status} 但报告里没有失败用例` }
  return { verdict: 'survived' }
}

/**
 * 变异把语法改坏了(当前 `Math.max` 正则遇到两层以上嵌套括号会截断,留下多余右括号)。
 *
 * 这类变异**必须直接判 caught**,不能记成 infra 再让 runSpec 去试下一个 spec ——
 * 语法坏掉的模块,bundler 连它的 import 图都建不起来,**任何一个 spec 都只会 transform failed**。
 * 于是 runSpec 跑完十个 spec 全 infra、一条 survived 都没,最后被兜底成「漏掉」,
 * 报告里那条真守卫(offline.ts:217,已有判据且能抓)就被冤枉成缺口 —— 实测踩过。
 */
function isTransformFailure(stderr) {
  return /Transform failed|Pre-transform error|Expected .* but found/.test(stderr)
}

const missed = []
const infra = []
let checked = 0
const skipped = []
/**
 * 正在被改写的文件与它的原文。
 *
 * `finally` 只在正常/异常退出时跑到;**被 SIGTERM / SIGINT 杀掉时进程直接结束**,
 * 源码就停在变异后的状态 —— 而扫描改的是 src 下的真实文件。
 * 这个坑踩过两次:一次是 job_kill,一次是 `timeout` 到点。
 * 故在信号到达时同步写回,不走任何异步路径。
 */
let inflight = null
function restoreInflight() {
  if (!inflight) return
  try {
    writeFileSync(inflight.file, inflight.orig)
    console.error(`\n中断:已把 ${inflight.file.slice(ROOT.length + 1)} 写回原样`)
  } catch {
    console.error(`\n中断:${inflight.file.slice(ROOT.length + 1)} 写回失败,请手动 git checkout`)
  }
  inflight = null
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restoreInflight()
    process.exit(130)
  })
}
process.on('exit', restoreInflight)

for (const t of found) {
  // 等价变异不必真跑:省下的是一次 spec 启动(实测约 3.7 秒)
  const eq = equivalentOf(t)
  if (eq) {
    skipped.push({ ...t, why: eq.why })
    continue
  }
  const orig = readFileSync(t.file, 'utf-8')
  // 同一段文本可能在文件里出现多次:按记录的下标定位,否则后续几处会重复变异第一处
  if (orig.slice(t.index, t.index + t.text.length) !== t.text || t.mutated === t.text) continue
  inflight = { file: t.file, orig }
  writeFileSync(t.file, orig.slice(0, t.index) + t.mutated + orig.slice(t.index + t.text.length))
  let verdict
  try {
    verdict = await runSpec(t.specs)
  } finally {
    writeFileSync(t.file, orig)
    inflight = null
  }
  checked += 1
  const rel = `${t.file.slice(ROOT.length + 1)}:${t.line ?? t.index}`
  if (verdict.verdict === 'survived') {
    missed.push(t)
    console.log(`  ✗ 漏  ${rel}  [${t.name}]  ${t.text.trim().slice(0, 60)}`)
  } else if (verdict.verdict === 'infra') {
    infra.push({ ...t, detail: verdict.detail })
    console.log(`  ! 故障 ${rel}  [${t.name}]  ${verdict.detail}`)
  }
}

console.log(
  `\n检查 ${checked} 处 | 漏 ${missed.length} 处 | 等价跳过 ${skipped.length} 处 | 设施故障 ${infra.length} 处`
)
/**
 * 摘要里**必须带行号**。
 *
 * 原先只打「文件 + 文本」,同一个模块里两处同形守卫在摘要里长得一模一样 ——
 * bounty.ts 的 `if (!eq) return` 有 claim 与 claimEquip 两处,前者有测试、
 * 后者没有,摘要里分不出来。我按摘要去核实,手动注入的是有测试那处,
 * 于是把真缺口误判成「扫描误报」,差点写进等价名单放过。
 * 逐条日志本来就有行号(`rel`),摘要漏了它。
 */
const where = (m) => `${m.file.slice(ROOT.length + 1)}:${m.line ?? m.index}`
if (missed.length > 0) {
  console.log('\n漏掉的(改坏了不会红):')
  for (const m of missed) console.log(`  ${where(m)}  ${m.text.trim().slice(0, 70)}`)
}
if (infra.length > 0) {
  console.log('\n设施故障(没测成,不算抓到也不算漏):')
  for (const m of infra) console.log(`  ${where(m)}  ${m.detail}`)
}
if (skipped.length > 0) {
  console.log('\n等价变异(改不出可见差别,不算漏 —— 每条附理由):')
  for (const m of skipped) console.log(`  ${where(m)}  ${m.text.trim().slice(0, 70)}\n      理由:${m.why}`)
}
/*
 * 退出码:显式 --limit 时严格(本地复现,漏了就是红),默认分片模式只报告。
 *
 * 分片是**抽样**:每天换一片,每天都会碰到此前没扫过的模块。若一律以退出码阻断,
 * 任何 PR 都可能因为「今天轮到了某片」而被卡住,而它改的代码跟那片毫无关系 ——
 * 那种闸门最后只会被人绕过。
 *
 * 显式 limit 是「我在复现某一批」,那时漏了必须红,否则本地验证没有意义。
 * 设施故障(inferno)一律计入:那是工具自己没跑起来,不能当成「没问题」。
 */
if (infra.length > 0) process.exitCode = 1
else if (explicit && missed.length > 0) process.exitCode = 1
