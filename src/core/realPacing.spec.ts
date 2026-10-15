/* eslint-disable no-console -- 真实档对账表是给人看的 */
/**
 * 真实档节奏对账 —— 解析模型算的那条曲线,真存档走得到吗
 *
 * 节奏设计一直挂在 progressionSim 上,而它是一支**解析笔**:假设一套 kit,
 * 直接套公式算耗时。这类模型的危险不在算错,而在**算的是玩家凑不出的东西** ——
 * 上一轮刚修掉一例(它以为洞府能给 120%,而建筑表满级只有 76%)。
 *
 * 故这里拿真存档对一遍,判据是个**包夹**:
 *
 *   满配真实档 ≤ 模型 ≤ 裸档真实档
 *
 * 左边说模型没有乐观到「连满配都达不到」;右边说它没有悲观到「比裸档还慢」。
 * 两边都用真实 store 通路量(装备/功法/建筑/灵脉/灵根/灵气充盈/天时/命格全走一遍),
 * 而不是照着公式再抄一遍。
 *
 * 实测(境界 9→20):满配约为模型的 0.73~0.86;裸档约为模型的 3.0~4.5。
 * 文件里那句「真实约为估算的 1.5~3 倍」说的正是**带了一部分 kit 的真实玩家**,
 * 它落在裸档与满配之间 —— 与这里的读数一致。
 *
 * 故障注入:把模型的 kit 假设抬到满配之上(如功法给 5.0)→ 左侧红;
 * 把 kit 假设清空(只剩裸档)→ 右侧红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MAX_MAJOR, WORLD_BREAK_MAJOR } from '@/data/realms'
import { SUB_LEVELS } from '@/data/constants'
import { toNum } from '@/utils/gnum'
import { expRequirement } from './formulas'
import { secondsForMajor } from './progressionSim'
import { usePlayerStore } from '@/stores/player'
import { useCultivationStore } from '@/stores/cultivation'
import { useDongfuStore } from '@/stores/dongfu'
import { useResourcesStore } from '@/stores/resources'
import { GONGFA } from '@/data/gongfa'
import { GONGFA_BRANCHES } from '@/data/gongfaBranches'
import { BUILDINGS } from '@/data/buildings'

/** 修满一个大境界要多久 —— 走真实 store 的 cultPerSec,不另算公式 */
function realSecondsForMajor(major: number, kind: 'bare' | 'max'): number {
  setActivePinia(createPinia())
  const player = usePlayerStore()
  const cul = useCultivationStore()
  const dongfu = useDongfuStore()
  const res = useResourcesStore()

  if (kind === 'max') {
    // 典型灵根 1.6(不是顶配)+ 该境可用的最优功法 + 辅修栏占满(槽位预算)+ 建筑满级 + 灵脉主脉吃满
    player.linggen = { roots: [{ element: 'wood', aptitude: 96 }], gradeName: '单灵根', growthMult: 1.6 }
    // 先定下洞府满级后的辅修槽位预算,再选「占满槽位」的功法 —— 超槽的伴生功法不生效,
    // 满配建模不该把它们算进去(否则跟 gongfaMods 的真实截断打架)
    for (const b of BUILDINGS) dongfu.setLevel(b.id, b.maxLevel)
    dongfu.veinPoints = { gather: 70, craft: 0, alchemy: 0, insight: 0 }
    dongfu.veinMain = 'gather'
    const subCap = dongfu.subGongfaSlots
    const usable = GONGFA.filter(g => g.minRealm <= major)
    const cultOf = (id: string): number => {
      const def = GONGFA.find(g => g.id === id)!
      const base = (def.baseMods.cultivationSpeed ?? 0) + (def.perLevelMods.cultivationSpeed ?? 0) * (def.maxLevel - 1)
      const branches = GONGFA_BRANCHES.filter(b => b.gongfaId === id).map(b => b.mods.cultivationSpeed ?? 0)
      return base + Math.max(0, ...branches)
    }
    const mains = usable.filter(g => g.type === 'main').sort((a, b) => cultOf(b.id) - cultOf(a.id))
    const subs = usable.filter(g => g.type !== 'main').sort((a, b) => cultOf(b.id) - cultOf(a.id))
    const mainId = mains[0]!.id
    const subIds = subs.slice(0, subCap).map(g => g.id)
    for (const id of [mainId, ...subIds]) {
      const def = GONGFA.find(g => g.id === id)!
      cul.learn(id)
      while ((cul.learned[id] ?? 0) < def.maxLevel) cul.upgrade(id)
      const branch = GONGFA_BRANCHES.filter(b => b.gongfaId === id).sort(
        (a, b) => (b.mods.cultivationSpeed ?? 0) - (a.mods.cultivationSpeed ?? 0)
      )[0]
      if (branch) cul.chooseBranch(id, branch.id)
    }
    cul.equipMain(mainId)
    for (const id of subIds) cul.toggleSub(id, subCap)
  } else {
    // 裸档:无 kit、无灵根加成
    player.linggen = { roots: [{ element: 'wood', aptitude: 60 }], gradeName: '单灵根', growthMult: 1 }
  }

  player.major = major
  let total = 0
  for (let s = 0; s < SUB_LEVELS; s++) {
    player.sub = s
    res.qi = player.qiCapValue // 灵气充盈(两档都算,免得比出来的是这一项的差)
    total += toNum(expRequirement(major, s)) / player.cultPerSec
  }
  return total
}

describe('真实档节奏对账 · 模型必须落在裸档与满配之间', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('界外每一境:满配不慢于模型,裸档明显慢于模型', () => {
    console.log('\n界\t模型(天)\t满配(天)\t裸档(天)\t满/模型\t裸/模型')
    const failures: string[] = []
    for (let m = WORLD_BREAK_MAJOR; m <= MAX_MAJOR; m++) {
      const model = secondsForMajor(m, 0)
      const max = realSecondsForMajor(m, 'max')
      const bare = realSecondsForMajor(m, 'bare')
      console.log(
        `${m}\t${(model / 86400).toFixed(0)}\t${(max / 86400).toFixed(0)}\t${(bare / 86400).toFixed(0)}` +
          `\t${(max / model).toFixed(2)}\t${(bare / model).toFixed(2)}`
      )
      // 左端:模型不能乐观到满配也追不上
      if (max > model * 1.02) failures.push(`境界 ${m}:满配真实档比模型还慢(${(max / model).toFixed(2)}×)`)
      // 右端:模型也不能悲观到比裸档还慢(留 1.5× 余量,天气与命格带来的浮动远小于它)
      if (bare < model * 1.5) failures.push(`境界 ${m}:裸档只比模型慢 ${(bare / model).toFixed(2)}× —— 模型过于悲观`)
      // 满配档至少要真的比裸档快(否则「凑 kit」这件事在这条轴上没有意义)
      if (max >= bare) failures.push(`境界 ${m}:满配档不比裸档快 —— 这条对账量错了东西`)
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})
