/* eslint-disable no-console -- 灵脉可见性契约,需要打印通道归属 */
/**
 * 灵脉可见性契约
 *
 * 玩家反馈:「不知道寒冥灵脉的作用,当前加成里也没有寒冥灵脉的加成」。
 *
 * 查下来效果本身是真的 —— gongfaService 确实在扣悟道点。
 * 假的是**展示**:寒冥灵脉的 perPoint 是空对象,它的效果走
 * dongfu.insightDiscount 这条专用通道,而卡片的「当前加成」只读 veinMods。
 * 于是这条脉投到满级,界面上依然一个字都不出现。
 *
 * 这类缺陷的共性是:**加成有两条通道,展示只接了一条**。
 * 所以本文件钉的不是「insightDiscount 要显示出来」这个具体形态,
 * 而是不变量:
 *
 *   每条灵脉都必须有可观测通道,且展示层必须覆盖全部通道。
 *
 * 将来若新增第五条脉、或把某条脉挪去别的通道,这里会先红。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INSIGHT_DISCOUNT_PER_POINT, VEINS, type VeinDef, type VeinId } from '@/data/veins'
import { useDongfuStore } from '@/stores/dongfu'

/**
 * 不走 StatMods、另有专用通道的灵脉。
 * 键是脉 id,值是该通道在 store 上的 getter 名 —— 展示层必须逐个接上
 */
const DEDICATED_CHANNELS: Readonly<Record<string, string>> = {
  insight: 'insightDiscount'
}

/** 一条脉是否有任何可观测通道(判据本体,便于故障注入) */
function hasObservableChannel(def: VeinDef, channels: Readonly<Record<string, string>>): boolean {
  return Object.keys(def.perPoint).length > 0 || def.id in channels
}

/** 去掉注释,免得注释里提一嘴就算「接上了」 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

const CARD_SRC = stripComments(
  readFileSync(resolve(__dirname, '../components/dongfu/VeinInvestCard.vue'), 'utf8')
)

describe('灵脉可见性 · 通道归属', () => {
  it('每条脉都有可观测通道,不存在「投了点什么都不变」的脉', () => {
    console.log('\n灵脉        通道')
    for (const def of VEINS) {
      const via = Object.keys(def.perPoint).length > 0 ? `veinMods(${Object.keys(def.perPoint).join(',')})` : `专用 ${DEDICATED_CHANNELS[def.id]}`
      console.log(`${def.name.padEnd(10)} ${via}`)
      expect(hasObservableChannel(def, DEDICATED_CHANNELS), `${def.name} 没有任何可观测通道`).toBe(true)
    }
  })

  it('故障注入:抽掉专用通道声明后,寒冥灵脉立刻判为不可观测', () => {
    // 若不做这一步,上一条断言可能只是「恰好都为真」而非在起作用
    const insight = VEINS.find(v => v.id === 'insight')!
    expect(Object.keys(insight.perPoint).length).toBe(0)
    expect(hasObservableChannel(insight, {})).toBe(false)
    console.log('\n把 insight 从专用通道表里删掉 → 判为不可观测,判据确实是活的')
  })
})

describe('灵脉可见性 · 通道本身是活的', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('投悟道脉会推动 insightDiscount,且不进 veinMods', () => {
    const dongfu = useDongfuStore()
    expect(dongfu.insightDiscount).toBe(0)

    dongfu.veinPoints.insight = 30
    expect(dongfu.insightDiscount).toBeCloseTo(30 * INSIGHT_DISCOUNT_PER_POINT, 10)
    // 这正是问题的根源:它确实没有、也不该出现在 veinMods 里
    expect(Object.keys(dongfu.veinMods)).toHaveLength(0)
    console.log(`\n悟道脉 30 点 → insightDiscount ${(dongfu.insightDiscount * 100).toFixed(1)}%,veinMods 仍为空`)
  })

  it('走 veinMods 的脉照旧进 veinMods', () => {
    const dongfu = useDongfuStore()
    dongfu.veinPoints.gather = 30
    expect(dongfu.veinMods.cultivationSpeed).toBeGreaterThan(0)
  })
})

describe('灵脉可见性 · 展示层覆盖全部通道', () => {
  it('卡片的加成展示同时读取 veinMods 与每一条专用通道', () => {
    expect(CARD_SRC).toContain('veinMods')
    for (const [veinId, getter] of Object.entries(DEDICATED_CHANNELS)) {
      expect(CARD_SRC, `${veinId} 的通道 ${getter} 没有出现在卡片代码里`).toContain(getter)
    }
    console.log(`\n卡片已接入 veinMods + ${Object.values(DEDICATED_CHANNELS).join('、')}`)
  })

  it('每条脉的作用说明必须渲染出来,不能只显示名字和价格', () => {
    // 玩家反馈的另一半:「不知道寒冥灵脉的作用」。
    // veins.ts 里 desc 与 effectText 都写好了,但此前只有审计测试在读,页面从未渲染
    expect(CARD_SRC, '卡片没有渲染灵脉的 desc').toMatch(/\.desc/)
    expect(CARD_SRC, '卡片没有渲染灵脉的 effectText').toMatch(/effectText\(/)
  })

  it('专用通道表与 veins.ts 保持同步:表里不能有已不存在的脉', () => {
    const ids = new Set<VeinId>(VEINS.map(v => v.id))
    for (const key of Object.keys(DEDICATED_CHANNELS)) {
      expect(ids.has(key as VeinId), `专用通道表里的 ${key} 已不在 VEINS 中`).toBe(true)
    }
  })
})
