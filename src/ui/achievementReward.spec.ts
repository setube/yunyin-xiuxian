import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ACHIEVEMENTS } from '@/data/achievements'
import { stoneByTier } from '@/core/formulas'
import { playerTier, rewardPreview } from '@/core/progress'
import { maxTierForMajor } from '@/data/regions'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { TITLES } from '@/data/titles'
import { formatGN } from '@/utils/format'

describe('已达成成就展示实发奖励', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    usePlayerStore().initCharacter('成就', { roots: [] } as never)
  })

  it('境界成就的灵石行跟当前层级折算走,并带上称号', () => {
    const a = ACHIEVEMENTS.find(x => x.id === 'a_r1')!
    const text = rewardPreview(a.reward!)
    expect(text).toContain(`灵石 +${formatGN(stoneByTier(playerTier(), a.reward!.stoneTier!))}`)
    expect(text).toContain('称号')
  })

  it('奖励折算骑真实区域层级(playerTier=maxTierForMajor),不退回境界大阶封顶', () => {
    const player = usePlayerStore()
    player.major = 12 // 金仙:真实阶梯 24
    const t = playerTier()
    expect(t, '应等于真实层级').toBe(maxTierForMajor(12))
    expect(t, '旧公式在 12 大阶被封 20 —— 退回旧的 min(20, 2m+…) 这里会红').toBeGreaterThan(20)
  })

  it('成就页只在达成后接入 rewardPreview', () => {
    const src = readFileSync(resolve(__dirname, '../views/CollectionView.vue'), 'utf8')
    expect(src).toContain('rewardPreview(a.reward)')
    expect(src).toContain('done && a.reward')
  })

  /** 页级条与组内细条读同一份计数。故障注入:把组头数字改成另算一遍,或删掉细条,本条红 */
  it('成就页与名号/灵兽册的收集进度都接了同一枚 ProgressBar', () => {
    const ach = readFileSync(resolve(__dirname, '../views/CollectionView.vue'), 'utf8')
    expect(ach, '页级总条').toContain(':value="ACHIEVEMENTS.length > 0 ? quests.achieved.length / ACHIEVEMENTS.length : 0"')
    expect(ach, '组头数字与细条同读 grp.done').toContain('{{ grp.done }}/{{ grp.items.length }}')
    expect(ach, '组内细条比页级条细一档').toContain(':height="2"')

    const titles = readFileSync(resolve(__dirname, '../views/TitlesView.vue'), 'utf8')
    expect(titles, '名号册进度条').toContain(':value="TITLES.length > 0 ? ownedCount / TITLES.length : 0"')
    expect(titles, '灵兽册进度条').toContain(':value="PETS.length > 0 ? petRows.length / PETS.length : 0"')
  })
})

/**
 * 称号已拥有时,预览与发赏两边都不列它。
 *
 * `grantReward` 先过 `quests.ownTitle()`(已拥有返回 false 且不重复入账),
 * 而 `rewardPreview` 从前只看 `titleDef` 存在与否 —— 于是同一件奖励在成就页写着
 * 「称号 X」、领完的 toast 里却没有它。预览承诺了不会发生的事。
 *
 * 故障注入:把 rewardPreview 的 `alreadyOwned` 判断去掉,本条红。
 */
describe('称号预览 · 已拥有时不再许诺', () => {
  it('未拥有时列出,已拥有时省去,其余奖励照旧', () => {
    const quests = useQuestsStore()
    const title = TITLES[0]!
    expect(rewardPreview({ titleId: title.id }), '未拥有时该列出称号').toBe(`称号「${title.name}」`)
    quests.ownTitle(title.id)
    expect(rewardPreview({ titleId: title.id }), '已拥有时不该再列出').toBe('')
    expect(rewardPreview({ titleId: title.id, wudao: 100 }), '别的奖励不受影响').toBe('悟道点 +100')
  })
})
