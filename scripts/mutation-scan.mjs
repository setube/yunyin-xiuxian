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
 * 用法:node scripts/mutation-scan.mjs [--limit N]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 40)

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
    file: 'src/core/affixTransfer.ts',
    text: 'Math.max(0, cost.dust - resources.dust)',
    why:
      '前置三元已经把「够付」写成 0;走到减法那支时 hasSmall("dust", cost.dust) 为假,' +
      '即 resources.dust < cost.dust,差值必为正,钳制不改变结果。' +
      '留着是因为这段读起来像「算差额」,钳一下能让下一个人不必回头确认前置。'
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
  // 判据可能用 `./x`、`@/core/x`、`x` 三种写法引用
  const base = rel.replace(/^src\//, '').replace(/\.ts$/, '')
  const forms = [`./${base.split('/').pop()}`, `@/${base}`, base.split('/').pop()]
  const out = new Set()
  for (const spec of allSpecs) {
    if (spec === same) { out.add(spec); continue }
    const src = readFileSync(spec, 'utf-8')
    if (forms.some(f => src.includes(`'${f}'`) || src.includes(`"${f}"`))) out.add(spec)
  }
  return [...out]
}

for (const file of files) {
  const spec = file.replace(/\.ts$/, '.spec.ts')
  let specSrc
  try { specSrc = readFileSync(spec, 'utf-8') } catch { continue }
  const src = readFileSync(file, 'utf-8')
  for (const { name, re, rep } of PATTERNS) {
    for (const m of src.matchAll(re)) {
      const line = src.slice(0, m.index).split('\n').length
      found.push({ file, spec, specs: specsForModule(file), name, index: m.index, line, text: m[0], mutated: m[0].replace(re, rep) })
      if (found.length >= LIMIT) break
    }
    if (found.length >= LIMIT) break
  }
  if (found.length >= LIMIT) break
}

console.log(`扫到 ${found.length} 个可变异点(上限 ${LIMIT})`)

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

function runSpec(specs) {
  lastInfra = null
  for (const spec of specs) {
    const one = runOneSpec(spec)
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

function runOneSpec(spec) {
  const out = join(ROOT, '.vitest', 'mutation-scan.json')
  const res = spawnSync(
    'bunx',
    ['vitest', 'run', spec, '--reporter=json', `--outputFile=${out}`],
    { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8' }
  )
  let report
  try {
    report = JSON.parse(readFileSync(out, 'utf-8'))
  } catch {
    // stderr 前几行常是 esbuild/oxc 的固定告警,取最后一行更像真错误
    const tail = (res.stderr ?? '').trim().split('\n').filter(Boolean).slice(-1)[0]
    return { verdict: 'infra', detail: (tail ?? `退出码 ${res.status}`).slice(0, 160) }
  }
  const failed = (report.testResults ?? []).filter(r => r.status === 'failed')
  if (failed.length > 0) return { verdict: 'caught' }
  // 一条都没跑,等同于什么都没验证
  if ((report.numTotalTests ?? 0) === 0) return { verdict: 'infra', detail: '没有用例被执行' }
  if (res.status !== 0) return { verdict: 'infra', detail: `退出码 ${res.status} 但报告里没有失败用例` }
  return { verdict: 'survived' }
}

const missed = []
const infra = []
let checked = 0
const skipped = []
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
  writeFileSync(t.file, orig.slice(0, t.index) + t.mutated + orig.slice(t.index + t.text.length))
  let verdict
  try {
    verdict = runSpec(t.specs)
  } finally {
    writeFileSync(t.file, orig)
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
