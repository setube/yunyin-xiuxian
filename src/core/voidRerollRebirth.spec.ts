/**
 * 窥探虚界 · 与转世的时序。
 *
 * `rerollVoidWorld` 的顺序是:扣费 → `voidRerolling = true` → `await 生成` → 写 `voidWorld`。
 * 前半段全在 await **之前**,所以这段窗口里玩家可以转世(`endgame.onRebirth()` 把道途归还)。
 *
 * 修复前没有复验:生成照样完成、照样写进去 —— 转世后凭空多出一座上一世的虚界,
 * 而道途已经没了(那页要 `daoPath` 才给入口),再也进不去。
 * 实测(把生成层 mock 成必成功):
 *   窥探返回 true / 转世后 voidWorld 有「假虚界」/ daoPath 为 null
 *
 * 两道防线都要有:
 *   一 `rerollVoidWorld` 回来时复验 `endgame.daoPath`,不在就退款(这一世的窥探随道途作废);
 *   二 `onRebirth` 自己清掉 `voidWorld` —— 防止别的路径再把它写回来。
 *
 * 只测第一道不够:`onRebirth` 漏清时,任何「先窥探、后转世」的次序都会留残。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEndgameStore } from '@/stores/endgame'
import { usePlayerStore } from '@/stores/player'
import { rerollVoidWorld } from './expedition'
import * as worldGen from './worldGen'

/** 让生成必然成功,从而一定走到「写 voidWorld」那一行 */
function pinSuccessfulGeneration(): void {
  vi.spyOn(worldGen, 'generateApprovedWorldAsync').mockResolvedValue({
    world: { id: 'void', name: '假虚界', rewardDaoSource: 60 },
    audit: { best: 0.5 },
    novelty: 1,
    rejected: 0
  } as never)
}

function unlockedEndgame(): ReturnType<typeof useEndgameStore> {
  const player = usePlayerStore()
  const endgame = useEndgameStore()
  player.major = 20
  endgame.daoPath = 'sword'
  endgame.addDaoSource(5000)
  endgame.voidWorld = null
  return endgame
}

describe('窥探虚界 · 与转世的时序', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pinSuccessfulGeneration()
  })

  it('窥探途中转世:不写虚界,道源全额退回', async () => {
    const endgame = unlockedEndgame()
    const before = endgame.daoSource
    const promise = rerollVoidWorld()
    // 让出到 await 窗口内,再转世
    await Promise.resolve()
    endgame.onRebirth()
    const ok = await promise
    expect(ok, '道途已经归还,这一趟不该算成功').toBe(false)
    expect(endgame.voidWorld, '上一世窥探出来的虚界被写进了转世后的存档').toBeNull()
    expect(endgame.daoSource, '这一世的窥探随道途作废,那 10 道源该退回来').toBe(before)
    vi.restoreAllMocks()
  })

  it('onRebirth 自己就清 voidWorld —— 不依赖窥探那一道', () => {
    /*
     * 判据只调 onRebirth,不跑 rerollVoidWorld:钉住的是「转世这个动作本身」。
     * 故障注入:删掉 onRebirth 里那行 `voidWorld.value = null` → 本条红。
     */
    const endgame = unlockedEndgame()
    endgame.voidWorld = { id: 'void', name: '上一世的虚界', rewardDaoSource: 60 } as never
    endgame.onRebirth()
    expect(endgame.voidWorld, '转世后还留着上一世的虚界').toBeNull()
    expect(endgame.daoPath).toBeNull()
    expect(endgame.worldRun).toBeNull()
    vi.restoreAllMocks()
  })

  it('道途还在时,窥探照常成功 —— 别把正路一起锁死', async () => {
    const endgame = unlockedEndgame()
    const ok = await rerollVoidWorld()
    expect(ok, '正常窥探不该被这场时序修补误伤').toBe(true)
    expect(endgame.voidWorld?.name).toBe('假虚界')
    vi.restoreAllMocks()
  })
})
