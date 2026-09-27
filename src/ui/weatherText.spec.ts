import { describe, expect, it } from 'vitest'
import { WEATHERS, WORLD_WEATHERS, type WeatherDef } from '@/core/weather'
import { formatPercent } from '@/utils/format'
import { STAT_NAMES } from './statNames'
import { weatherEffectText, weatherTribulationLine } from './weatherText'
import { modsText } from './statNames'
import type { AnyStatKey } from '@/types'

const ALL: WeatherDef[] = [...WEATHERS, ...Object.values(WORLD_WEATHERS).flat()]

describe('天时效果行与定义同源', () => {
  it('每一条词条的百分比都出现在效果行里,符号方向正确', () => {
    for (const w of ALL) {
      const line = weatherEffectText(w)
      for (const [k, v] of Object.entries(w.mods)) {
        if (typeof v !== 'number' || v === 0) continue
        const name = STAT_NAMES[k as AnyStatKey] ?? k
        const signed = `${name} ${v > 0 ? '+' : '-'}${formatPercent(Math.abs(v))}`
        expect(line, `${w.name} 漏了 ${signed}`).toContain(signed)
      }
      if (w.tribulationMult !== 1) {
        const delta = w.tribulationMult - 1
        expect(line).toContain(`渡劫难度 ${delta > 0 ? '+' : '-'}${formatPercent(Math.abs(delta))}`)
      }
    }
  })

  it('负词条写成减号,而不是 +- ', () => {
    expect(modsText({ cultivationSpeed: -0.5, attackPct: 0.2 })).toBe('修炼速度 -50% · 攻击 +20%')
  })

  it('进阶成功率那天时写明大关天劫不吃', () => {
    const daoyin = WORLD_WEATHERS.chaos.find(w => w.id === 'daoyin')!
    expect(daoyin.mods.breakthroughRate).toBeGreaterThan(0)
    expect(weatherEffectText(daoyin)).toContain('大关天劫不与')
    expect(weatherEffectText(daoyin)).toContain('进阶成功率')
    expect(weatherEffectText(daoyin)).toContain('小进阶')
  })

  it('清和明示无加减,不把空白留给玩家猜', () => {
    const qinghe = WEATHERS.find(w => w.id === 'qinghe')!
    expect(weatherEffectText(qinghe)).toBe('今日无加减')
  })

  it('渡劫栏天时句:倍率从定义现算,清和不出句', () => {
    const qinghe = WEATHERS.find(w => w.id === 'qinghe')!
    expect(weatherTribulationLine(qinghe)).toBeNull()
    const leiming = WEATHERS.find(w => w.id === 'leiming')!
    const line = weatherTribulationLine(leiming)!
    expect(line).toContain('雷鸣')
    expect(line).toContain(formatPercent(leiming.tribulationMult - 1))
    expect(line).toContain('同涨共落')
    const xianjie = WORLD_WEATHERS.immortal.find(w => w.id === 'xianjie')!
    expect(weatherTribulationLine(xianjie)).toContain(formatPercent(xianjie.tribulationMult - 1))
  })

  it('风味句不再承诺数据里没有的属系', () => {
    const byId = Object.fromEntries(WEATHERS.map(w => [w.id, w.desc]))
    expect(byId.chiyang).not.toContain('火')
    expect(byId.yueshi).not.toContain('幽冥')
    expect(byId.leiming).not.toContain('雷属')
    expect(byId.leiming, '渡劫与小进阶不是同一件事').not.toContain('突破')
    expect(byId.leiming).toContain('渡劫')
    expect(byId.yueshi, '月蚀不抬灵石草矿丹药,不能说所得皆旺').not.toContain('所得')
    const ziqi = WORLD_WEATHERS.immortal.find(w => w.id === 'ziqi')!
    expect(ziqi.desc, '紫气没有际遇词条,不能说机缘').not.toContain('机缘')
    expect(weatherEffectText(WEATHERS.find(w => w.id === 'yueshi')!)).toContain('装备掉落率')
  })
})
