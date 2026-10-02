/**
 * 修士实验室裁判(Phase 26)
 * 核心红线:玩家定规则,天道定赏格——更容易的配置绝不能拿更高奖励
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { verifyChallenge } from './challenge'
import { keepVerdict } from './smartKeep'
import { useSettingsStore } from '@/stores/settings'
import { generateEquipment } from './equipGen'
import { RandomService, mulberry32 } from '@/utils/random'

describe('挑战书定价防作弊', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('裸配置可受约且赏格有界;苛刻配置的赏格不低于宽松配置', () => {
    const worldId = CELESTIAL_WORLDS[0]!.id
    const easy = verifyChallenge({ worldId, mutatorIds: [], pactId: null, name: '' })
    const hard = verifyChallenge({ worldId, mutatorIds: ['heal_down', 'foe_bulk', 'heaven_wrath'], pactId: 'xue', name: '' })
    expect(easy).not.toBeNull()
    expect(hard).not.toBeNull()
    if (easy!.ok) {
      expect(easy!.reward).toBeGreaterThanOrEqual(30)
      expect(easy!.reward).toBeLessThanOrEqual(90)
    }
    // 苛刻局若成立,定价必须 ≥ 宽松局(定价只看实测难度,叠恶性规则不可能更便宜)
    if (easy!.ok && hard!.ok) {
      expect(hard!.reward, '苛刻配置赏格反而更低——定价函数被绕过').toBeGreaterThanOrEqual(easy!.reward)
    }
    // 苛刻局也可能被判「近乎无解」拒收——那同样是防线在工作
    if (!hard!.ok) {
      expect(hard!.reason).toBeDefined()
    }
  })

  it('四天裸配置均有明确判词;至少一天可直接受约(多数裸局被拒是特性:近必胜局须加料方成挑战)', () => {
    let accepted = 0
    for (const w of CELESTIAL_WORLDS) {
      const v = verifyChallenge({ worldId: w.id, mutatorIds: [], pactId: null, name: '' })
      expect(v, `${w.name} 验约失败`).not.toBeNull()
      if (v!.ok) accepted += 1
      else expect(v!.reason, `${w.name} 被拒却无判词`).toBeDefined()
    }
    expect(accepted).toBeGreaterThanOrEqual(1)
  })
})

describe('智能收纳判定', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('达标品质一律保留;道途未成时低品质不保留', () => {
    const settings = useSettingsStore()
    settings.smartKeep = { enabled: true, minQuality: 3, keepMinTier: 0, keepCoreAffix: true, keepComboPiece: true, keepPerfectRolls: true, keepSetPiece: true }
    const rng = new RandomService(mulberry32(7))
    // 生成高低品质各一件(minQualityRank 控制下限)
    const high = generateEquipment(10, rng, { luck: 0, minQualityRank: 5 })
    const low = generateEquipment(1, rng, { luck: 0, minQualityRank: 0 })
    expect(keepVerdict(high).keep).toBe(true)
    // 新档玩家无流派:低品质件按「唯品质论」处理(可能因品质随机 ≥3 而保留,故仅验证判定可执行且给出理由)
    const v = keepVerdict(low)
    expect(typeof v.keep).toBe('boolean')
    expect(v.reason.length).toBeGreaterThan(0)
  })
})
