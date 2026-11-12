/* eslint-disable no-console */
/** 修行身份:历史行为的归纳,非职业标签。审计:无数值加成 / 无新资源 / 描述随历史变化 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { buildIdentity, IDENTITY_DEFAULT_EPITHET, IDENTITY_EMPTY } from './identityService'
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
    // 空态只给状态词,不拼句号
    expect(id.narrative).toBe('暂无记录')
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

/** 画像文案不得漏出内部 id(「行slaughter」回归);叙事与 roots 两处口径同时钉住 */
describe('修行画像文案', () => {
  it('叙事里出现的是道途中文名,绝不漏出内部 id(「行slaughter」回归)', () => {
    const lines: string[] = []
    for (const def of DAO_PATHS) {
      // 道途立下不可改,四条道途各起一世
      setActivePinia(createPinia())
      useEndgameStore().chooseDao(def.id)
      const id = buildIdentity()
      lines.push(`  ${def.id.padEnd(10)} → 「${id.epithet}」 ${id.narrative}`)

      expect(id.narrative, `${def.name}:叙事里漏出了内部 id`).not.toContain(def.id)
      expect(id.narrative, `${def.name}:叙事里没提到道途`).toContain(`行${def.name}`)
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

/**
 * 空态词只有一份出处。
 *
 * `buildNarrative` 在没任何来由时返回「暂无记录」,而画像面板在同一位置
 * 还有一处兜底三元 `identity?.narrative ?? '暂无记录'` —— 两处各写一遍时,
 * 「身份还没算出来」与「身份算出来了但没来由」会显示成两个词。
 *
 * 判据:常量值钉住 + 两处调用点都读它 + 面板里不再有字面量。
 */
describe('身份画像 · 空态词一份出处', () => {
  const read = (p: string): string => readFileSync(resolve(__dirname, p), 'utf-8')
  const strip = (src: string): string =>
    src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
      .join('\n')

  it('空来由时返回那个常量', () => {
    setActivePinia(createPinia())
    const id = buildIdentity()
    expect(id.narrative).toBe(IDENTITY_EMPTY)
    expect(IDENTITY_EMPTY, '空态词被改过?').toBe('暂无记录')
  })

  it('画像面板读常量,不再自己写一份', () => {
    const view = strip(read('../views/CharacterView.vue'))
    expect(view, '面板该读 IDENTITY_EMPTY').toContain('identity?.narrative ?? IDENTITY_EMPTY')
    expect(view, '面板又手写了「暂无记录」').not.toContain("'暂无记录'")
  })
})

/**
 * 兜底词各只写一份:称号「云隐散人」与空态「暂无记录」。
 *
 * 这两个词原先都散在多个文件里各写一遍 —— `IDENTITY_EMPTY` 早先已收口,
 * 而称号那处一直没收,三处各写(`buildIdentity` 兜底、画像面板那行、画像弹窗标题)。
 * 改一处另两处不跟,玩家会在同一件事上看到两个称号。
 *
 * 故障注入:把任一处改回字面量,本条红。
 */
describe('画像兜底词 · 单一来源', () => {
  const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8')

  it('两个兜底词都只在 identityService 里定义一次', () => {
    expect(IDENTITY_DEFAULT_EPITHET).toBe('云隐散人')
    expect(IDENTITY_EMPTY).toBe('暂无记录')
    for (const rel of ['views/CharacterView.vue', 'components/character/IdentityDialog.vue']) {
      const src = read(rel)
      expect(src, `${rel} 又手写了一份称号兜底`).not.toContain("'云隐散人'")
      expect(src, `${rel} 又手写了一份空态词`).not.toContain("'暂无记录'")
      expect(src, `${rel} 该引用 IDENTITY_DEFAULT_EPITHET`).toContain('IDENTITY_DEFAULT_EPITHET')
    }
  })
})
