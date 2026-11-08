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
  const eq = process.argv.find(a => a.startsWith('--limit='))
  if (eq) return Number(eq.split('=')[1] ?? 40)
  const i = process.argv.indexOf('--limit')
  if (i >= 0) return Number(process.argv[i + 1] ?? 40)
  return 40
})()

const PATTERNS = [
  { name: '守卫恒假', re: /if \((![A-Za-z_$][\w$.]*(?:\([^)]*\))?)\) return/g, rep: 'if (false) return' },
  { name: '钳制下限', re: /Math\.max\(0(?:\.\d+)?,\s*([^;()]+(?:\([^)]*\))?[^;()]*)\)/g, rep: '$1' },
  { name: '空判取反', re: /\.length === 0\)/g, rep: '.length < 0)' }
]

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
    text: 'Math.max(0, Math.min(1, ratio(part, whole))',
    why:
      'share 的上下钳。三处调用里只有 bigShare(biggestHitTaken / maxHpProxy)可能越 1,' +
      '而它的消费点是 `if (bigShare >= BIG_HIT_WARN)` —— 1.2 与 1.0 都过阈值,判定结果相同。' +
      '若要写判据只能钉「文案里显示 100% 而不是 120%」,那是显示口径的选择,' +
      '不是行为差异;现有 11 条用例不碰这条边界。'
  },
  {
    file: 'src/core/battleAnalysis.ts',
    text: 'Math.max(0, Math.round((enemySpeed - playerSpeed) * 100)',
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
    text: 'Math.max(0, Math.min(1, ratio(f.hp, f.snap.maxHp))',
    why:
      'hpPct 的夹逼。两条边界在写入侧已经封死:' +
      'applyDamage 末行是 `target.hp = subClamp(target.hp, remain)`(不会为负);' +
      'healSelf 是 `missing = subClamp(maxHp, hp)`、`applied = gnMin(missing, amount)`(不会超过 maxHp)。' +
      '所以 ratio 恒在 [0,1],钳制永不触发。留着是因为 hpPct 还兼作「进战报的 php/ehp 读数」,' +
      '那条路直方图化,一个越界的 1.02 会让进度条画到框外。'
  },
  {
    file: 'src/core/audio.ts',
    text: 'Math.max(0, Math.min(1, p.musicVol))',
    why:
      '音量夹逼。取值路径是 App.vue 传 musicVol/100,正常档位本就在 [0,1];' +
      '平时观察不到,只有存档被外部改成 200 或 -5 才起作用。' +
      '判据不可达的原因是那两条钳制写在 prefs 模块私域里:不导出读不到,导出又会被' +
      'deadExportAudit 判为「骨架空转」;而要让 applyPrefs 真正跑一次还得完整模拟 Tone.js。' +
      '现有用例只钉「畸形输入不抛错」,是这条边界上能验到的最远处。'
  },
  {
    file: 'src/core/audio.ts',
    text: 'Math.max(0, Math.min(1, p.sfxVol))',
    why: '同 musicVol:音效音量夹逼,理由一致。'
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
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) targets(p, out)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p)
  }
  return out
}

const files = targets(join(ROOT, 'src/core')).concat(targets(join(ROOT, 'src/stores'))).concat(targets(join(ROOT, 'src/utils')))
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
  const mine = []
  for (const { name, re, rep } of PATTERNS) {
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split('\n').length
      mine.push({ file, specs, name, index: m.index, line, text: m[0], mutated: m[0].replace(re, rep) })
    }
  }
  if (mine.length > 0) perFile.push(mine)
}

/*
 * 取样:跨文件轮流取一,而不是把前面的文件取干净。
 * 这样 limit=40 也会均匀铺到几十个不同模块,而不是挤在前三个文件里。
 */
for (let round = 0; found.length < LIMIT; round += 1) {
  let picked = false
  for (const mine of perFile) {
    if (found.length >= LIMIT) break
    const one = mine[round]
    if (!one) continue
    found.push(one)
    picked = true
  }
  if (!picked) break
}

console.log(`扫到 ${found.length} 个可变异点(上限 ${LIMIT},来自 ${new Set(found.map(f => f.file)).size} 个模块)`)

/**
 * 跑一次被变异文件的 spec。
 *
 * 退出码不能直接当「抓到了」用:启动失败、语法错误、setup 崩掉都会非零退出,
 * 把设施故障记成「这条守卫有牙」等于给自己发一张假绿灯。故按 vitest 的 JSON
 * 报告区分三态 —— 只有「跑完了且有用例失败」才算抓到。
 *
 * @returns {'caught' | 'survived' | 'infra'}
 */
/** 跑给定的一批 spec;任一有用例失败即算抓到 */
let lastInfra = null

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
 * 跑一个 spec。**必须异步**:先前用 spawnSync,它有两大害处 ——
 *  1. 一次 spec 跑 3.7 秒,这期间事件循环被完全堵死,信号处理器排在队列里执行不了;
 *     于是 SIGTERM 到达时 restoreInflight 跑不到,源码就留在变异后的状态。
 *     (实测:timeout 掐在两次 spawnSync 之间时能恢复,掐在里头就恢复不了 —— 靠运气。)
 *  2. 子进程自身也可能迟迟不退,同步等待没有超时可言。
 * 改用 spawn + Promise,等 spec 的同时事件循环照常响应信号。
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
  // 一条都没跑,等同于什么都没验证
  if ((report.numTotalTests ?? 0) === 0) return { verdict: 'infra', detail: '没有用例被执行' }
  if (status !== 0) return { verdict: 'infra', detail: `退出码 ${status} 但报告里没有失败用例` }
  return { verdict: 'survived' }
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
if (missed.length > 0) {
  console.log('\n漏掉的(改坏了不会红):')
  for (const m of missed) console.log(`  ${m.file.slice(ROOT.length + 1)}  ${m.text.trim().slice(0, 70)}`)
}
if (infra.length > 0) {
  console.log('\n设施故障(没测成,不算抓到也不算漏):')
  for (const m of infra) console.log(`  ${m.file.slice(ROOT.length + 1)}  ${m.detail}`)
}
if (skipped.length > 0) {
  console.log('\n等价变异(改不出可见差别,不算漏 —— 每条附理由):')
  for (const m of skipped) console.log(`  ${m.file.slice(ROOT.length + 1)}  ${m.text.trim().slice(0, 70)}\n      理由:${m.why}`)
}
// 等价变异不计入退出码:它不是缺陷。但**没写理由的等价**进不了这份名单,会照常算漏。
if (missed.length > 0 || infra.length > 0) process.exitCode = 1
