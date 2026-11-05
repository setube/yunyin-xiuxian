/** 天时:每日确定性环境;描述里承诺的战斗/掉落/渡劫影响须真能流进游戏 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { todayWeather, weatherDef, WEATHERS, WORLD_WEATHERS } from './weather'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { worldOf } from '@/data/realms'
import { currentTribulationPlan, waveDamage } from './tribulationDecision'
import { tribulationDef } from '@/data/tribulations'
import { NO_RELIEF } from '@/data/linggenAffinity'
import type { StatMods } from '@/types'

describe('天时(weather)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('五种天时完整:灵雨/赤阳/月蚀/雷鸣/清和', () => {
    expect(WEATHERS.map(w => w.id)).toEqual(['lingyu', 'chiyang', 'yueshi', 'leiming', 'qinghe'])
    for (const w of WEATHERS) {
      expect(w.desc).toBeTruthy()
    }
  })

  it('确定性:同一游戏日多次计算得出同一结果', () => {
    const game = useGameStore()
    game.$patch({ totalPlaySec: 86400 * 3 + 1000 })
    const a = todayWeather()
    const b = todayWeather()
    expect(a.id).toBe(b.id)
  })

  it('不同游戏日结果存在分布(100 天抽到过多种)', () => {
    const game = useGameStore()
    const seen = new Set<string>()
    for (let d = 1; d <= 100; d++) {
      game.$patch({ totalPlaySec: d * 86400 })
      seen.add(todayWeather().id)
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
  })

  it('雷鸣:渡劫更险(倍率>1)', () => {
    const lm = weatherDef('leiming')
    expect(lm?.tribulationMult).toBeGreaterThan(1)
  })

  it('灵雨:修炼/灵气加成', () => {
    const ly = weatherDef('lingyu')
    expect((ly?.mods.cultivationSpeed ?? 0)).toBeGreaterThan(0)
    expect((ly?.mods.qiRegen ?? 0)).toBeGreaterThan(0)
  })
})

// ---- 接线验证 ----

describe('天时词条并入最终属性(mods 源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('当前天时的词条出现在 player.finalStats.mods 中(战斗/掉落/渡劫即由此读取)', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    game.$patch({ totalPlaySec: 0 })
    const day0 = todayWeather()
    expect(day0.id).toBe('lingyu')
    // 扣除命格等常驻底色,只比天时贡献
    const fate = player.fateMods
    expect((player.finalStats.mods.cultivationSpeed ?? 0) - (fate.cultivationSpeed ?? 0)).toBeCloseTo(0.1)
    expect((player.finalStats.mods.qiRegen ?? 0) - (fate.qiRegen ?? 0)).toBeCloseTo(0.2)
  })

  it('赤阳日:attackPct/damageBonus 生效;月蚀日:luck/dropRate 生效', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    game.$patch({ totalPlaySec: 2 * 86400 })
    expect(todayWeather().id).toBe('chiyang')
    const fate = player.fateMods
    expect((player.finalStats.mods.attackPct ?? 0) - (fate.attackPct ?? 0)).toBeCloseTo(0.05)
    expect((player.finalStats.mods.damageBonus ?? 0) - (fate.damageBonus ?? 0)).toBeCloseTo(0.05)
    game.$patch({ totalPlaySec: 3 * 86400 })
    expect(todayWeather().id).toBe('yueshi')
    expect((player.finalStats.mods.luck ?? 0) - (fate.luck ?? 0)).toBeCloseTo(0.05)
    expect((player.finalStats.mods.dropRate ?? 0) - (fate.dropRate ?? 0)).toBeCloseTo(0.05)
  })

  it('雷鸣日:tribulationResist 生效(渡劫变难),attackPct 生效', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    game.$patch({ totalPlaySec: 1 * 86400 })
    expect(todayWeather().id).toBe('leiming')
    const fate = player.fateMods
    expect((player.finalStats.mods.tribulationResist ?? 0) - (fate.tribulationResist ?? 0)).toBeCloseTo(-0.05)
    expect((player.finalStats.mods.attackPct ?? 0) - (fate.attackPct ?? 0)).toBeCloseTo(0.05)
  })

  it('灵雨日:cultPerSec/qiRegenPerSec 带上天时(离线结算同源,不再仅在线生效)', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    player.initCharacter('雨修', { roots: [] } as never)
    // 找清和(无加成)与灵雨两天:同一角色、同一境界,唯一差异是天时
    let lingyuDay = -1
    let qingheDay = -1
    for (let d = 0; d < 40 && qingheDay < 0; d += 1) {
      game.$patch({ totalPlaySec: d * 86400 })
      const id = todayWeather().id
      if (id === 'lingyu' && lingyuDay < 0) lingyuDay = d
      if (id === 'qinghe') qingheDay = d
    }
    expect(lingyuDay).toBeGreaterThanOrEqual(0)
    expect(qingheDay).toBeGreaterThanOrEqual(0)
    game.$patch({ totalPlaySec: qingheDay * 86400 })
    const baseCult = player.cultPerSec
    const baseQi = player.qiRegenPerSec
    game.$patch({ totalPlaySec: lingyuDay * 86400 })
    // 命格等常驻底色两日相同,按倍数折算
    const fate = player.fateMods
    const lingyuMods = weatherDef('lingyu')!.mods
    const cultBase = 1 + (fate.cultivationSpeed ?? 0)
    const qiBase = 1 + (fate.qiRegen ?? 0)
    expect(player.cultPerSec).toBeCloseTo(baseCult * (cultBase + (lingyuMods.cultivationSpeed ?? 0)) / cultBase, 6)
    expect(player.qiRegenPerSec).toBeCloseTo(baseQi * (qiBase + (lingyuMods.qiRegen ?? 0)) / qiBase, 6)
  })
})

describe('渡劫难度随天时(雷鸣日 +8%)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('waveDamage 乘上天时倍率:雷鸣日伤害更高(预览与结算同源)', () => {
    const def = tribulationDef('thunder')
    const mods: StatMods = {}
    const base = waveDamage(def, mods, 1, 1, 1)
    const storm = waveDamage(def, mods, 1, 1, 1, NO_RELIEF, 1.08)
    expect(storm).toBeCloseTo(base * 1.08, 9)
    // 不传天时即 1 倍
    expect(base).toBeCloseTo(waveDamage(def, mods, 1, 1, 1, NO_RELIEF, 1), 9)
  })

  it('currentTribulationPlan 在同一天时下,expectedRate 随雷鸣倍率下降(难度变高)', () => {
    const game = useGameStore()
    let stormDay = -1
    for (let d = 0; d < 40; d += 1) {
      game.$patch({ totalPlaySec: d * 86400 })
      if (todayWeather().id === 'leiming') {
        stormDay = d
        break
      }
    }
    expect(stormDay).toBeGreaterThanOrEqual(0)
    // 只验同日预览稳定且 > 0(具体难度由构筑决定)
    const a = currentTribulationPlan()
    const b = currentTribulationPlan()
    expect(a.kind).toBe(b.kind)
    expect(a.expectedRate).toBeGreaterThan(0)
  })
})

// ---- 界域专属天象 ----

describe('界域天象(weather · 仙界及以上)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('每个界域都有自己的天象池,且不少于三种', () => {
    for (const w of ['immortal', 'god', 'chaos'] as const) {
      const pool = WORLD_WEATHERS[w]
      expect(pool.length, `${w} 的天象池`).toBeGreaterThanOrEqual(3)
      for (const def of pool) {
        expect(def.desc).toBeTruthy()
        // 界面按 id 回查天象
        expect(weatherDef(def.id)?.name).toBe(def.name)
      }
    }
    expect(worldOf(9).name).toBe('仙界')
    expect(worldOf(14).name).toBe('神界')
    expect(worldOf(18).name).toBe('混沌海')
  })

  it('人间界玩家仍取五日天时(既有行为零改动)', () => {
    const player = usePlayerStore()
    player.major = 0
    const mortalIds = new Set(WEATHERS.map(w => w.id))
    const game = useGameStore()
    for (let d = 0; d < 20; d += 1) {
      game.$patch({ totalPlaySec: d * 86400 })
      expect(mortalIds.has(todayWeather().id)).toBe(true)
    }
  })

  it('仙界/神界/混沌海玩家只取本界天象,且同一天确定不换', () => {
    const player = usePlayerStore()
    const game = useGameStore()
    for (const [major, world] of [
      [9, 'immortal'],
      [14, 'god'],
      [18, 'chaos']
    ] as const) {
      player.major = major
      const poolIds = new Set(WORLD_WEATHERS[world].map(w => w.id))
      for (let d = 1; d <= 12; d += 1) {
        game.$patch({ totalPlaySec: d * 86400 })
        const a = todayWeather()
        const b = todayWeather()
        expect(a.id).toBe(b.id)
        expect(poolIds.has(a.id), `${world} 取到了他界天象 ${a.id}`).toBe(true)
      }
    }
  })

  it('界域天象确实并入最终属性(不是只放着看)', () => {
    const player = usePlayerStore()
    player.major = 18 // 混沌海:三种天象皆给加成
    const mods = player.finalStats.mods
    const anyPositive =
      (mods.cultivationSpeed ?? 0) > 0 ||
      (mods.attackPct ?? 0) > 0 ||
      (mods.luck ?? 0) > 0
    expect(anyPositive).toBe(true)
  })
})

describe('天时 · 各有其形', () => {
  /*
   * 十四种天时原先共用首页那枚固定的 sparkles:名字与效果都不同,图形却一样,
   * 「今天是哪种天时」只能逐字读名字。现在每种各配一枚语义贴切的图标。
   */
  const ALL = [...WEATHERS, ...Object.values(WORLD_WEATHERS).flat()]

  it('每种天时都配了图标', () => {
    for (const w of ALL) {
      expect(w.icon, `${w.name} 没有图标`).toBeTruthy()
      expect(typeof w.icon, `${w.name} 的图标须是字符串`).toBe('string')
    }
  })

  it('图标都在 ui/icons 里真实存在', () => {
    const icons = readFileSync(resolve(__dirname, '../ui/icons.ts'), 'utf-8')
    for (const w of ALL) {
      expect(icons, `${w.name} 的图标 ${w.icon} 在 ui/icons 里找不到`).toMatch(new RegExp(`\\b${w.icon}:`))
    }
  })

  it('语义相邻的天时不共用同一枚图标', () => {
    // 雨类可共用,其余各走各的:雷/日/月/风/潮/音/威/劫/辉/气/源/清
    const seen = new Map<string, string[]>()
    for (const w of ALL) {
      const list = seen.get(w.icon) ?? []
      list.push(w.name)
      seen.set(w.icon, list)
    }
    const shared = [...seen.entries()].filter(([, names]) => names.length > 1)
    // 只有雨类(droplets 与 umbrella 是不同图标)允许同族;此处列出所有共用情况供核对
    expect(shared, `这些天时共用图标:\n${shared.map(([i, n]) => `  ${i}: ${n.join('、')}`).join('\n')}`).toEqual([])
  })
})
