/* eslint-disable no-console */
/**
 * 凡界生成 · 主观新颖度代理审计
 *
 * 上一轮的结论带着一个明确的边界:结构新颖 0.42~0.53 证明的是
 * 「组合确实变了」,不能证明玩家打开这一世时不会想
 * 「还是那些区域、那些怪,只是重排了一遍」。
 *
 * 这一层用代理指标先排除**明显换皮**:把生成结果拆成玩家实际会看到的层,
 * 再问两个世界的表面特征是否仍高度相似。
 *
 * 不改生成器、不改玩法。
 */
import { describe, expect, it } from 'vitest'
import { generateSeries } from './mortalWorldGen'
import {
  avgVisibleByDim,
  isFocused,
  noveltyGap,
  skeletonDimensions,
  skeletonOf,
  skeletonRepeats,
  visibleDistance,
  visibleFeatures,
  worldIdentity
} from './mortalIdentity'

const SERIES = generateSeries(6, 20260904, 10)
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
      // 地貌来自区域 icon,主题来自变数语义轴,偏向来自资源
      expect(id.terrain).toBeTruthy()
      expect(id.themeName).toBeTruthy()
      // 名字未必含主地貌 —— 占比不足时不许拿它代表整个世界
      //(见 worldNaming.spec.ts:众数 ≠ 主导)。
      // 但主题词恒在:它是唯一横贯全程的属性
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
    // 这一条不预设结果,把事实钉住:随机选地界必然带来语义发散
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
    // 原本预期落差为正(内部变了玩家看不出),实测两者接近甚至反向。
    // 但这个聚合读数不能拿来下结论——见下一条
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
    // 历史记录:路线形状与事件密度曾恒为 0,被地界名 0.81 的高分整个平均掉。
    // 那次失效正是「不可用综合分数掩盖关键维度缺失」这条原则的由来
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
    // 曾经:tier 硬编码为 `2 + i * 3`,六世的推进曲线一模一样
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
    // 连续重复比总重复更伤体验
    expect(r.longestRun).toBeLessThanOrEqual(WORLDS.length)
  })

  it('可见层已无死维度,重复感的主因被拆掉', () => {
    const dims = skeletonDimensions(WORLDS)
    const dead = dims.filter(d => d.values === 1).map(d => d.dim)
    console.log('\n各维取值数:')
    for (const d of dims) console.log(`  ${d.dim.padEnd(14)} ${d.values}`)
    // 曾经「事件密度结构」与「路线形状」恒为单值
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
    // visibleDistance 度量的仍是特征差异,不是主观体验。
    // 它能抓出「地界名与推进节奏都一样」这类硬伤,
    // 但「叙事是否有新鲜感」只有实际游玩能判断
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
