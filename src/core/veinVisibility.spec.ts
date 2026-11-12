/* eslint-disable no-console -- 打印通道归属 */
/**
 * 灵脉可见性契约:每条灵脉都有可观测通道,且展示层覆盖全部通道。
 * 寒冥灵脉 perPoint 为空,效果走 dongfu.insightDiscount 专用通道,不进 veinMods。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INSIGHT_DISCOUNT_PER_POINT, VEINS, type VeinDef, type VeinId } from '@/data/veins'
import { useDongfuStore } from '@/stores/dongfu'

/** 不走 StatMods 的灵脉:脉 id → 专用通道在 store 上的 getter 名;展示层须逐个接上 */
const DEDICATED_CHANNELS: Readonly<Record<string, string>> = {
  insight: 'insightDiscount'
}

/** 一条脉是否有可观测通道(判据本体,故障注入用) */
function hasObservableChannel(def: VeinDef, channels: Readonly<Record<string, string>>): boolean {
  return Object.keys(def.perPoint).length > 0 || def.id in channels
}

/** 去掉注释:注释里提及不算接上 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

const CARD_SRC = stripComments(
  readFileSync(resolve(__dirname, '../components/dongfu/VeinInvestCard.vue'), 'utf8')
)
/** 效果行唯一出口:perPoint 与专用通道都在 veinEffectText 里并入 */
const VEIN_TEXT_SRC = stripComments(
  readFileSync(resolve(__dirname, '../ui/veinText.ts'), 'utf8')
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
  it('列账覆盖全部通道:遍历全部灵脉,效果行走 veinEffectText(专用通道并入其中)', () => {
    // 两处列账都遍历全部灵脉;形制在 setup 里算一次(VEINS.map → veinRows)
    expect(CARD_SRC, '列账行必须由全部灵脉生成').toContain('VEINS.map(')
    expect(CARD_SRC, '两处遍历都读同一个行数组').toMatch(/v-for="row in veinRows"/g)
    expect(CARD_SRC, '效果行没有走 veinEffectText').toContain('veinEffectText(')
    expect(VEIN_TEXT_SRC, 'veinEffectText 没有并入专用通道').toContain('INSIGHT_EFFECT_NAME')
    expect(VEIN_TEXT_SRC, '效果行措辞没有与词条 caveat 同源').toContain('modsText(')
    console.log('\n列账遍历全部灵脉,效果行原产于 veinEffectText(参悟省耗并入),措辞与 caveat 同源')
  })

  it('每条脉的作用说明必须渲染出来,不能只显示名字和价格', () => {
    expect(CARD_SRC, '卡片没有渲染灵脉的 desc').toMatch(/\.desc/)
    expect(CARD_SRC, '卡片没有渲染灵脉效果行').toContain('veinEffectText(')
    expect(CARD_SRC, '零点时也要能看见每点加成,不能等投了才说').toContain('每点')
  })

  it('专用通道表与 veins.ts 保持同步:表里不能有已不存在的脉', () => {
    const ids = new Set<VeinId>(VEINS.map(v => v.id))
    for (const key of Object.keys(DEDICATED_CHANNELS)) {
      expect(ids.has(key as VeinId), `专用通道表里的 ${key} 已不在 VEINS 中`).toBe(true)
    }
  })

  it('改立主脉的入口、确认钮与服务拒因同读一份石差', () => {
    expect(CARD_SRC, '改立入口没有读 veinSwitchShortfall').toContain('veinSwitchShortfall(')
    expect(
      (CARD_SRC.match(/:disabled="switchShort"/g) ?? []).length,
      '改立入口与确认钮付不起时都应置灰'
    ).toBe(2)
    expect(CARD_SRC, '确认钮付不起时也应置灰').toMatch(/:disabled="switchShort"[\s\S]*?改 立/)
    // 缺料句收成一个 computed(模板四处共用),正文与 title 取同一份
    expect(CARD_SRC, '付不起时应就地写出石差').toContain('switchShortText')
    expect(CARD_SRC, '缺料句只拼一次').toContain("const switchShortText = computed(() => `灵石尚差 ${formatGap(switchGap.value)}`)")
  })
})
