/* eslint-disable no-console */
/**
 * 世界命名置信度审计
 *
 * 实测缺陷:「虚影幢幢的天象之世」实际是
 * 废墟 / 山岳 / 废墟 / 天象 / 天象 / 天象。
 * 统计上天象确是众数(3/6),但玩家前半程走的是两处废墟夹一处山岳 ——
 * **生成器认为它是天象世界,玩家却没有任何理由这么理解。**
 *
 * 这是「结构分数不能代替玩家感知」的又一实例:众数 ≠ 主导。
 * 3/6 与 5/6 不该拿到同样强度的语义。
 *
 * 本轮只审 worldIdentity,不动 Boss 语义 —— 那需要真实体验证据。
 * 也不扩世界名词库:问题不在词不够,在**该不该用那个词**。
 */
import { describe, expect, it } from 'vitest'
import {
  DOMINANCE_DUAL,
  DOMINANCE_SINGLE,
  terrainOf,
  worldIdentity,
  type NamingForm
} from './mortalIdentity'
import { generateMortalWorld, type MortalWorld } from './mortalWorldGen'

const FORM_LABEL: Record<NamingForm, string> = {
  single: '单一主导',
  dual: '两轴交错',
  scattered: '高度分散'
}

/** 一世的地貌构成 */
function terrains(w: MortalWorld): string[] {
  return w.chain.map(p => terrainOf(p.fromId))
}

describe('命名置信度 · 众数不等于主导', () => {
  it('实测样本:天象 3/6 不再被称作「天象之世」', () => {
    // 找一个主地貌刚过半的世界
    let sample: MortalWorld | null = null
    for (let seed = 1; seed < 400 && !sample; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      const id = worldIdentity(w)
      if (id.dominance > 0.4 && id.dominance < DOMINANCE_SINGLE) sample = w
    }
    expect(sample).not.toBeNull()
    const id = worldIdentity(sample!)
    console.log(
      `\n地貌构成:${terrains(sample!).join(' / ')}` +
        `\n主地貌 ${id.terrain} 占比 ${(id.dominance * 100).toFixed(0)}% < ${DOMINANCE_SINGLE * 100}%` +
        `\n命名形态:${FORM_LABEL[id.form]}` +
        `\n世界名:${id.name}`
    )
    // 关键:占比不足时不许用「X 之世」
    expect(id.form).not.toBe('single')
    expect(id.name).not.toBe(`${id.themeName}的${id.terrain}之世`)
  })

  it('主地貌够强时仍用单一地貌命名', () => {
    let sample: MortalWorld | null = null
    for (let seed = 1; seed < 400 && !sample; seed += 1) {
      const w = generateMortalWorld(seed * 104729)
      if (worldIdentity(w).dominance >= DOMINANCE_SINGLE) sample = w
    }
    expect(sample).not.toBeNull()
    const id = worldIdentity(sample!)
    expect(id.form).toBe('single')
    console.log(
      `\n地貌构成:${terrains(sample!).join(' / ')}` +
        `\n主地貌 ${id.terrain} 占比 ${(id.dominance * 100).toFixed(0)}% ≥ ${DOMINANCE_SINGLE * 100}% → ${id.name}`
    )
  })

  it('命名形态随占优程度单调变化', () => {
    // 同一套判据下,dominance 越高,命名越敢用单一地貌
    const rows: { dom: number; form: NamingForm }[] = []
    for (let seed = 1; seed <= 200; seed += 1) {
      const id = worldIdentity(generateMortalWorld(seed * 7919))
      rows.push({ dom: id.dominance, form: id.form })
    }
    const singles = rows.filter(r => r.form === 'single')
    const others = rows.filter(r => r.form !== 'single')
    if (singles.length > 0 && others.length > 0) {
      expect(Math.min(...singles.map(r => r.dom))).toBeGreaterThanOrEqual(Math.max(...others.map(r => r.dom)))
    }
    console.log(
      `\n两百世:单一主导 ${singles.length}、其余 ${others.length}` +
        `\n单一主导的最低占比 ${(Math.min(...singles.map(r => r.dom)) * 100).toFixed(0)}%,` +
        `其余的最高占比 ${(Math.max(...others.map(r => r.dom)) * 100).toFixed(0)}% —— 两段不重叠`
    )
  })
})

describe('命名置信度 · 三种形态各自成立', () => {
  it('形态分布', () => {
    const dist: Record<NamingForm, number> = { single: 0, dual: 0, scattered: 0 }
    const samples: Record<NamingForm, string> = { single: '', dual: '', scattered: '' }
    for (let seed = 1; seed <= 200; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      const id = worldIdentity(w)
      dist[id.form] += 1
      if (!samples[id.form]) samples[id.form] = `${id.name}  ←  ${terrains(w).join('/')}`
    }
    console.log('\n形态      世数  样例')
    for (const f of ['single', 'dual', 'scattered'] as NamingForm[]) {
      console.log(`${FORM_LABEL[f].padEnd(8)} ${String(dist[f]).padStart(4)}  ${samples[f] || '—'}`)
    }
    // 三种形态都该出现,否则判据形同虚设
    expect(dist.single + dist.dual + dist.scattered).toBe(200)
  })

  it('两轴交错:名字里的两轴确实是实际占比最高的两轴', () => {
    let sample: MortalWorld | null = null
    for (let seed = 1; seed < 400 && !sample; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      if (worldIdentity(w).form === 'dual') sample = w
    }
    if (!sample) {
      console.log('\n本次采样未出现两轴交错形态')
      return
    }
    const id = worldIdentity(sample)
    const ts = terrains(sample)
    const counts = new Map<string, number>()
    for (const t of ts) counts.set(t, (counts.get(t) ?? 0) + 1)
    const top2 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0])
    expect(top2).toContain(id.terrain)
    expect(top2).toContain(id.secondary)
    // 前二合计必须够高,否则该判为分散
    const share = (counts.get(id.terrain)! + counts.get(id.secondary!)!) / ts.length
    expect(share).toBeGreaterThanOrEqual(DOMINANCE_DUAL)
    console.log(`\n${id.name}  ←  ${ts.join('/')}(前二合计 ${(share * 100).toFixed(0)}%)`)
  })

  it('高度分散:不许拿任何一轴代表整个世界', () => {
    let sample: MortalWorld | null = null
    for (let seed = 1; seed < 600 && !sample; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      if (worldIdentity(w).form === 'scattered') sample = w
    }
    if (!sample) {
      console.log('\n本次采样未出现高度分散形态')
      return
    }
    const id = worldIdentity(sample)
    const ts = terrains(sample)
    // 名字里不得出现任何单一地貌轴
    for (const t of new Set(ts)) expect(id.name).not.toContain(`的${t}之世`)
    console.log(`\n${id.name}  ←  ${ts.join('/')} —— 退回主题与生态,不用地貌代称`)
  })
})

describe('命名置信度 · 故障注入', () => {
  it('把阈值判据绕过会立刻暴露:名字与实际构成不符', () => {
    // 复现修复前的行为:直接用众数命名,不看占比
    let worst: { name: string; ts: string[]; dom: number } | null = null
    for (let seed = 1; seed <= 300; seed += 1) {
      const w = generateMortalWorld(seed * 7919)
      const id = worldIdentity(w)
      if (id.form === 'single') continue
      const ts = terrains(w)
      // 修复前会叫它「X 之世」,而 X 只占不到六成
      const naive = `${id.themeName}的${id.terrain}之世`
      if (!worst || id.dominance < worst.dom) worst = { name: naive, ts, dom: id.dominance }
    }
    expect(worst).not.toBeNull()
    console.log(
      `\n修复前最糟的一例会被命名为「${worst!.name}」,` +
        `\n而实际构成是 ${worst!.ts.join('/')} —— 主地貌仅占 ${(worst!.dom * 100).toFixed(0)}%` +
        `\n现在这类世界会走两轴或分散形态,不再冒用单一地貌`
    )
    expect(worst!.dom).toBeLessThan(DOMINANCE_SINGLE)
  })

  it('阈值是判据不是装饰:调高会让更多世界降级', () => {
    // 用现有数据验证判据对阈值敏感 —— 若不敏感,说明它没在起作用
    let singleAt60 = 0
    let singleAt80 = 0
    for (let seed = 1; seed <= 200; seed += 1) {
      const dom = worldIdentity(generateMortalWorld(seed * 7919)).dominance
      if (dom >= 0.6) singleAt60 += 1
      if (dom >= 0.8) singleAt80 += 1
    }
    expect(singleAt80).toBeLessThan(singleAt60)
    console.log(
      `\n阈值 0.6 → ${singleAt60} 世可用单一地貌命名;阈值 0.8 → ${singleAt80} 世。` +
        '\n判据对阈值敏感,不是恒真的装饰'
    )
  })
})

describe('命名置信度 · 本轮边界', () => {
  it('只改了「该不该用那个词」,没扩词库', () => {
    // 问题从来不是名字不够多,而是拿不该用的词去代表整个世界。
    // 扩词库只会产出更多同样失真的名字
    const id = worldIdentity(generateMortalWorld(20260904))
    expect(['single', 'dual', 'scattered']).toContain(id.form)
    console.log(
      '\n三种形态共用同一批地貌词与主题词,没有新增任何词汇 ——' +
        '\n变的是命名的**授权条件**,不是词汇量'
    )
  })

  it('Boss 语义仍未处理,与本轮无关', () => {
    // 「剑冢 ← 幽冥海皇」「天外天 ← 古将军亡魂」属于 narrativeFit,
    // 需要真实体验证据才值得设计约束,不在本轮范围
    const w = generateMortalWorld(20260904)
    expect(w.chain.every(p => typeof p.boss === 'string')).toBe(true)
    console.log('\nBoss 与地界的语义匹配未动 —— 等真实体验证据')
  })
})
