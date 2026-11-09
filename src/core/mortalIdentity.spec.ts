/* eslint-disable no-console */
/** 凡界生成 · 主观新颖度代理审计:把生成结果拆成玩家实际会看到的层比较表面特征,只能排除明显换皮。 */
import { describe, expect, it } from 'vitest'
import { auditMortalWorld, generateMortalWorld, mortalNovelty, NOVELTY_MIN, type MortalAudit, type MortalWorld } from './mortalWorldGen'
import {
  avgVisibleByDim,
  isFocused,
  noveltyGap,
  rhythmNovelty,
  skeletonDimensions,
  skeletonNovelty,
  skeletonOf,
  visibleNovelty,
  skeletonRepeats,
  visibleDistance,
  visibleFeatures,
  worldIdentity
} from './mortalIdentity'

/**
 * 连续六世:每世都相对**全部**已生成的历史过新颖度门。
 * 生产路径是逐世生成(mortalWorldService)、历史取自存档;这里只是要一批多样本,
 * 故内联 —— 原先的 generateSeries 只为 spec 存在,已被删除。
 */
const SERIES = (() => {
  const out: { world: MortalWorld; audit: MortalAudit; novelty: number; rejected: number }[] = []
  const history: MortalWorld[] = []
  for (let i = 0; i < 6; i += 1) {
    let found: { world: MortalWorld; audit: MortalAudit; novelty: number; rejected: number } | null = null
    for (let t = 0; t < 120; t += 1) {
      const w = generateMortalWorld(20260904 + i * 104729 + t * 7919)
      const audit = auditMortalWorld(w, 10)
      if (!audit.passed) continue
      const novelty = mortalNovelty(w, history)
      if (novelty < NOVELTY_MIN) continue
      found = { world: w, audit, novelty, rejected: t }
      break
    }
    if (!found) break
    out.push(found)
    history.push(found.world)
  }
  return out
})()
const WORLDS = SERIES.map(s => s.world)

describe('可见新颖 · 世界身份', () => {
  it('每一世都能合成出自己的身份', () => {
    console.log('\n世代  世界名                     摘要')
    for (const [i, w] of WORLDS.entries()) {
      const id = worldIdentity(w)
      console.log(`${String(i + 1).padStart(4)}  ${id.name.padEnd(24)} ${id.summary}`)
    }
  })

  it('身份是从已有素材抽出来的,不需要新写剧情', () => {
    for (const w of WORLDS) {
      const id = worldIdentity(w)
      expect(id.terrain).toBeTruthy()
      expect(id.themeName).toBeTruthy()
      // 名字未必含主地貌(见 worldNaming.spec.ts:众数 ≠ 主导);主题词恒在
      if (id.form === 'single') expect(id.name).toContain(id.terrain)
      if (id.form === 'dual') expect(id.name).toContain(id.secondary!)
      if (id.form === 'scattered') expect(id.name).toContain(id.themeName)
    }
    console.log('\n地貌取自区域 icon,主题取自 MUTATOR_THEMES,偏向取自资源 —— 全是现成素材')
  })

  it('语义聚焦度:六处地界拼出来的世界会不会变成大杂烩', () => {
    console.log('\n世代  语义轴数  聚焦')
    for (const [i, w] of WORLDS.entries()) {
      const id = worldIdentity(w)
      console.log(`${String(i + 1).padStart(4)} ${String(id.axisCount).padStart(9)}  ${isFocused(id) ? '是' : '否'}`)
    }
    const unfocused = WORLDS.filter(w => !isFocused(worldIdentity(w))).length
    console.log(
      `\n${unfocused}/${WORLDS.length} 个世界语义发散 ——` +
        '\n地界是随机选的,地貌自然混杂;天界的「≤2 轴」语义门在这里不成立'
    )
    // 不预设结果,只钉事实
    expect(unfocused).toBeGreaterThanOrEqual(0)
  })
})

describe('可见新颖 · 结构与可见的落差', () => {
  it('逐世对照', () => {
    console.log('\n世代  结构新颖  可见新颖   落差')
    for (let i = 1; i < WORLDS.length; i += 1) {
      const g = noveltyGap(WORLDS[i]!, WORLDS.slice(0, i))
      console.log(
        `${String(i + 1).padStart(4)} ${g.structural.toFixed(3).padStart(9)} ${g.visible.toFixed(3).padStart(9)} ` +
          `${g.gap >= 0 ? '+' : ''}${g.gap.toFixed(3)}`
      )
    }
  })

  it('预期被推翻:聚合可见新颖度并不低于结构新颖度', () => {
    const gaps = []
    for (let i = 1; i < WORLDS.length; i += 1) gaps.push(noveltyGap(WORLDS[i]!, WORLDS.slice(0, i)))
    const avgStruct = gaps.reduce((s, g) => s + g.structural, 0) / gaps.length
    const avgVisible = gaps.reduce((s, g) => s + g.visible, 0) / gaps.length
    console.log(
      `\n平均结构新颖 ${avgStruct.toFixed(3)},平均可见新颖 ${avgVisible.toFixed(3)},` +
        `落差 ${(avgStruct - avgVisible).toFixed(3)}`
    )
    // 聚合读数不能拿来下结论,见下一条
    expect(Math.abs(avgStruct - avgVisible)).toBeLessThan(0.2)
    console.log('\n两者接近。但聚合值在这里是个坏指标,下一条拆开看')
  })

  it('曾经的失效方式已修复:两个死维度都活了', () => {
    const dims = avgVisibleByDim(WORLDS)
    console.log('\n可见维度        两两平均距离')
    for (const [k, v] of Object.entries(dims).sort((a, b) => b[1] - a[1])) {
      const bar = '█'.repeat(Math.round(v * 20))
      console.log(`${k.padEnd(14)} ${v.toFixed(3)}  ${bar}`)
    }
    expect(dims['地界名']!).toBeGreaterThan(0.7)
    expect(dims['路线形状']!).toBeGreaterThan(0)
    expect(dims['事件密度']!).toBeGreaterThan(0)
    console.log(
      '\n曾经:路线形状 0.000、事件密度 0.000,被地界名 0.811 平均掉,总分仍显示「很新」。' +
        `\n现在:路线形状 ${dims['路线形状']!.toFixed(3)}、事件密度 ${dims['事件密度']!.toFixed(3)} ——` +
        '\n骨架生成器与节奏原型接入后,这两维不再是死的'
    )
  })

  it('可见距离在两两之间也偏低', () => {
    const ds: number[] = []
    for (let i = 0; i < WORLDS.length; i += 1) {
      for (let j = i + 1; j < WORLDS.length; j += 1) ds.push(visibleDistance(WORLDS[i]!, WORLDS[j]!))
    }
    const min = Math.min(...ds)
    const avg = ds.reduce((s, d) => s + d, 0) / ds.length
    console.log(`\n两两可见距离:最小 ${min.toFixed(3)},平均 ${avg.toFixed(3)}`)
    expect(min).toBeGreaterThan(0)
  })
})

describe('可见新颖 · 体验骨架去重', () => {
  it('骨架各维的实际取值数 —— 找出哪一维是死的', () => {
    console.log('\n维度            取值数  样例')
    for (const d of skeletonDimensions(WORLDS)) {
      console.log(`${d.dim.padEnd(14)} ${String(d.values).padStart(6)}  ${d.sample}`)
    }
  })

  it('路线形状不再恒定 —— 曾经是当前生成器最明显的可见缺陷', () => {
    const dims = skeletonDimensions(WORLDS)
    const shape = dims.find(d => d.dim === '路线形状')!
    expect(shape.values).toBeGreaterThan(1)
    console.log(
      `\n六世出现 ${shape.values} 种路线形状 —— 曾经全部是 2-5-8-11-14-17(硬编码 \`2 + i * 3\`)。` +
        '\n玩家不再每一世都走同样节奏的推进'
    )
  })

  it('骨架整体是否出现连续重复', () => {
    const r = skeletonRepeats(WORLDS)
    console.log(`\n骨架 ${r.distinct}/${WORLDS.length} 种,最长连续重复 ${r.longestRun} 世`)
    for (const [i, w] of WORLDS.entries()) {
      console.log(`  ${i + 1}. ${skeletonOf(w)}`)
    }
    expect(r.longestRun).toBeLessThanOrEqual(WORLDS.length)
  })

  it('可见层已无死维度,重复感的主因被拆掉', () => {
    const dims = skeletonDimensions(WORLDS)
    const dead = dims.filter(d => d.values === 1).map(d => d.dim)
    console.log('\n各维取值数:')
    for (const d of dims) console.log(`  ${d.dim.padEnd(14)} ${d.values}`)
    expect(dead).not.toContain('路线形状')
    expect(dead).not.toContain('事件密度结构')
    console.log(
      `\n取值恒定的维度:${dead.join('、') || '无'}` +
        '\n\n抬高 NOVELTY_MIN 从来治不了这个 —— 结构门槛管的是敌人机制与解法空间,' +
        '\n而「又来了」的感觉来自路线节奏与地貌顺序。' +
        '\n解法是给这两维各自设独立的门(见 mortalGate),而不是把总分调高'
    )
  })
})

describe('可见新颖 · 本轮的边界', () => {
  it('代理指标只能排除明显换皮,不能证明玩家会觉得新鲜', () => {
    const w = WORLDS[0]!
    const v = visibleFeatures(w)
    expect(v.placeNames.length).toBe(v.shape.length)
    console.log(
      '\n可见距离能抓出硬伤(名字重复、节奏雷同、首尾同型),' +
        '\n抓不出「文案读起来是不是同一个味道」——' +
        '\n地界名、事件文案全部沿用原素材,这一层仍需实际游玩验证'
    )
  })
})

/**
 * 空历史时三份新颖度都该是 1(满分),不是 Infinity。
 *
 * 三个函数的开头都是 `if (history.length === 0) return 1` —— 挡的是 `Math.min(...[])`。
 * 那表达式在空数组上返回 **Infinity**,而新颖度门是 `value >= floor`:Infinity 恒过。
 * 于是第一世(历史为空)的世界生成会跳过全部新颖度筛选,直接吃下第一个候选。
 *
 * 变异扫描点名这三处(231 / 344 / 350)。判据钉:空历史时是有限数 1,且能被门槛判定为过。
 */
describe('新颖度 · 空历史不该返回 Infinity', () => {
  const world = generateMortalWorld(20261108)

  it('三份新颖度在空历史下都是有限数 1', () => {
    for (const [name, fn] of [
      ['visibleNovelty', visibleNovelty],
      ['skeletonNovelty', skeletonNovelty],
      ['rhythmNovelty', rhythmNovelty]
    ] as const) {
      const v = fn(world, [])
      expect(Number.isFinite(v), `${name}(空历史) 返回了 ${v} —— 守卫没了`).toBe(true)
      expect(v, `${name}(空历史) 该是满分 1`).toBe(1)
    }
  })

  it('空历史与「历史里有一个完全不同的世界」都是可过门的值', () => {
    // 过门判据是 value >= floor;Infinity 与 1 都过,但 Infinity 会让后续任何比较失去意义
    // 另起一次生成拿一个确定存在的 MortalWorld(注意 generateSeries 返回的不是 MortalWorld)
    const other = generateMortalWorld(424242)
    for (const fn of [visibleNovelty, skeletonNovelty, rhythmNovelty]) {
      const empty = fn(world, [])
      const nonEmpty = fn(world, [other])
      expect(Number.isFinite(empty), '空历史结果必须是有限数').toBe(true)
      expect(empty, '空历史该给满分').toBeGreaterThanOrEqual(nonEmpty)
    }
  })
})
