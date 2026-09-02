/* eslint-disable no-console */
/**
 * Phase 31.2:修行身份 — 历史行为的归纳,非职业标签
 * 审计:无数值加成/无新资源/描述随历史变化
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildIdentity } from './identityService'
import { DAO_PATHS } from '@/data/endgame'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useEndgameStore } from '@/stores/endgame'
import { useCultivationStore } from '@/stores/cultivation'

describe('修行身份(identityService)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新人:无常识,默认为云隐散人', () => {
    const id = buildIdentity()
    expect(id.epithet).toBe('云隐散人')
    expect(id.roots.fortunes.length).toBe(0)
    expect(id.traits.riskBias).toBeNull()
  })

  it('机缘取过 → 根因记录', () => {
    const player = usePlayerStore()
    player.setFortuneChoices({ ft_sword_remnant: 'take', ft_beast_pledge: 'take' })
    const id = buildIdentity()
    expect(id.roots.fortunes.map(f => f.title)).toContain('剑痕悟道')
  })

  it('师承+道途 → 称谓由两者合成(剑道+剑修 → 问剑剑心)', () => {
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    player.adoptMentor('swordsman')
    endgame.chooseDao('sword')
    const id = buildIdentity()
    expect(id.epithet).toBe('问剑剑心')
  })

  it('功法分支计入根因', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    for (let i = 0; i < 9; i++) cul.upgrade('m_taixuan')
    cul.chooseBranch('m_taixuan', 'b_taixuan_sha')
    const id = buildIdentity()
    expect(id.roots.branches).toContain('杀伐')
  })

  it('身份是描述,不含任何数值加成字段', () => {
    const id = buildIdentity()
    // 无 mods / 无 buffs / 无战力字段
    expect('mods' in id).toBe(false)
    expect('bonus' in id).toBe(false)
    expect('power' in id).toBe(false)
  })

  it('叙事随行为变化(击杀多 → 偏好以险求胜)', () => {
    const quests = useQuestsStore()
    quests.inc('kills', 500)
    quests.inc('explores', 50)
    const id = buildIdentity()
    expect(id.traits.riskBias).toBe('gamble')
    expect(id.narrative).toContain('以险求胜')
  })
})

/**
 * 玩家看到的每个字都必须是文案,不能漏出内部 id
 *
 * 修复的 bug:buildIdentity 把 endgame.daoPath 的原始 id 传给了 buildNarrative,
 * 于是画像里写着「行slaughter」。中文名的转换只发生在返回的 roots 里,晚了一步。
 * 这一类 bug 的共性是「同一份数据,一处转了一处没转」,所以下面同时钉住两处口径。
 */
describe('修行画像文案', () => {
  it('叙事里出现的是道途中文名,绝不漏出内部 id(「行slaughter」回归)', () => {
    const lines: string[] = []
    for (const def of DAO_PATHS) {
      // 道途一旦立下便不可改,四条道途各起一世
      setActivePinia(createPinia())
      useEndgameStore().chooseDao(def.id)
      const id = buildIdentity()
      lines.push(`  ${def.id.padEnd(10)} → 「${id.epithet}」 ${id.narrative}`)

      expect(id.narrative, `${def.name}:叙事里漏出了内部 id`).not.toContain(def.id)
      expect(id.narrative, `${def.name}:叙事里没提到道途`).toContain(`行${def.name}`)
      // 画像面板与叙事必须同源,否则又会一处转了一处没转
      expect(id.roots.daoPath, `${def.name}:面板道途与叙事不同源`).toBe(def.name)
    }
    console.log(`\n  四条道途的画像:\n${lines.join('\n')}`)
  })

  it('每条道途都有专属称谓,没有一条掉进 fallback「问道」', () => {
    const epithets = new Set<string>()
    for (const def of DAO_PATHS) {
      setActivePinia(createPinia())
      useEndgameStore().chooseDao(def.id)
      const epithet = buildIdentity().epithet
      expect(epithet, `${def.name}:称谓表缺 key「${def.id}」,掉回了 fallback`).not.toContain('问道')
      epithets.add(epithet)
    }
    expect(epithets.size, '不同道途给出了相同称谓').toBe(DAO_PATHS.length)
  })

  it('未立道途时不写道途句', () => {
    setActivePinia(createPinia())
    const id = buildIdentity()
    expect(id.roots.daoPath).toBeNull()
    expect(id.narrative).not.toContain('行')
  })
})
