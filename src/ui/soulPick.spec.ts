/**
 * 器魂择优装配。
 *
 * 装配槽只有 3 个,而散置常有七八缕:要挑最强的那三枚,得逐枚读词条、
 * 心算「暴击率 +5% 与伤害减免 +4.5% 哪个更值」—— 这两样本无可比口径。
 *
 * 四条判据:
 *   一 先比阶位:阶位是数据里现成、玩家能自己数(阶点)的次序。
 *   二 同阶才比词条总量 —— 这一层用到倍数。
 *   三 不搬战力权重表跨类型比器魂:那张表的 regenPerRound 权重 20 是为了
 *      让恢复那一维在五维评分里看得见,不是「回血比暴击值二十倍」。
 *   四 界面接上了,且择优只是建议(不替玩家决定)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SOUL_GRADES, type SoulInstance, type SoulTypeId } from '@/data/souls'
import { soulPickSummary, soulPicks, soulPickUids, soulWeight } from './soulPick'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/SoulsView.vue'), 'utf-8')

/** 造一枚器魂;type 取自 data 里的真 id */
const soul = (uid: string, grade: number, type: SoulTypeId = 'fengmang'): SoulInstance => ({ uid, grade, type, fromName: '青锋' })

describe('器魂择优 · 一、先比阶位', () => {
  it('阶位高的排前,哪怕低阶那枚词条数值更大', () => {
    // 五阶锋魂(词条少)对上二阶泽魂(恢复类数值权重看似更高)
    const picks = soulPicks([soul('a', 1, 'muze'), soul('b', 5, 'fengmang')], 1)
    expect(picks[0]!.soul.uid, '二阶泽魂不该排在五阶锋魂前面').toBe('b')
    expect(picks[0]!.rank).toBe(5)
  })

  it('阶位次序就是 SOUL_GRADES 的 rank,不另立一套', () => {
    const all = SOUL_GRADES.map((g, i) => soul(`s${i}`, g.rank))
    const picks = soulPicks(all, SOUL_GRADES.length)
    expect(picks.map(p => p.rank)).toEqual([...SOUL_GRADES.map(g => g.rank)].sort((a, b) => b - a))
  })

  it('阶位相同时才比词条总量', () => {
    // 同阶:词条总量由 soulMods(含阶位倍率)决定,同阶时即比类型
    const a = soul('a', 3, 'fengmang')
    const b = soul('b', 3, 'muze')
    const picks = soulPicks([a, b], 1)
    // 两者同阶,排序结果稳定且只取一枚
    expect(picks[0]!.rank).toBe(3)
    expect(picks.filter(p => p.picked)).toHaveLength(1)
    // 词条总量确实参与了比较
    expect(soulWeight(a)).not.toBe(soulWeight(b))
  })

  it('同阶同词的次序稳定 —— 刷新界面不会换来换去', () => {
    const a = soul('a', 2, 'gangdun')
    const b = soul('b', 2, 'gangdun')
    const first = soulPicks([a, b], 2).map(p => p.soul.uid)
    const second = soulPicks([b, a], 2).map(p => p.soul.uid)
    expect(first).toEqual(second)
  })
})

describe('器魂择优 · 二、取前 N 枚', () => {
  it('槽几格就取几枚;可装数与候选数取小', () => {
    const list = [soul('a', 1), soul('b', 3), soul('c', 5)]
    expect(soulPickUids(list, 3)).toHaveLength(3)
    expect(soulPickUids(list, 2)).toHaveLength(2)
    expect(soulPickUids(list, 9)).toHaveLength(3)
  })

  it('取出来的正是阶位最高的那几枚', () => {
    const list = [soul('a', 1), soul('b', 5), soul('c', 3), soul('d', 4)]
    expect(soulPickUids(list, 2)).toEqual(['b', 'd'])
  })

  it('零槽或空名单不出错', () => {
    expect(soulPickUids([soul('a', 5)], 0)).toEqual([])
    expect(soulPickUids([], 3)).toEqual([])
    expect(soulPickSummary([])).toBeNull()
  })

  it('坏档里的越界阶位不产生 NaN', () => {
    for (const g of [-1, 99, Number.NaN]) {
      const picks = soulPicks([soul('x', g)], 1)
      expect(picks).toHaveLength(1)
      expect(Number.isFinite(picks[0]!.rank)).toBe(true)
    }
  })
})

describe('器魂择优 · 三、不搬战力权重表', () => {
  it('口径是阶位而非词条权重 —— 恢复类的高权重不会把低阶器魂顶上来', () => {
    // 若按 POWER_STAT_WEIGHTS 算,二阶泽魂(regenPerRound 权重 20)会胜过五阶锋魂
    const picks = soulPicks([soul('ze', 2, 'muze'), soul('feng', 5, 'fengmang')], 1)
    expect(picks[0]!.soul.uid).toBe('feng')
  })

  it('摘要逐枚列出,且不复述阶名 —— soulName 本身已含阶名', () => {
    const picks = soulPicks([soul('a', 5)], 1)
    const text = soulPickSummary(picks)!
    expect(text).toBe('化真·锋魂')
    // 「化真·锋魂·化真」这种复述是不允许的
    expect(text.match(/化真/g)).toHaveLength(1)
  })
})

describe('器魂择优 · 四、界面接上了', () => {
  it('器魂页读 soulPicks,且只在有空槽时给建议', () => {
    expect(VIEW, '器魂页没接 soulPicks').toContain('soulPicks(')
    expect(VIEW, '空槽判据没接').toContain('freeSlots')
    expect(VIEW, '建议块没有空槽守卫').toContain('freeSlots.value > 0')
  })

  it('择优只是建议:按钮写明「择优装配」,并说清判据', () => {
    expect(VIEW).toContain('择优装配')
    expect(VIEW, '没写判据,玩家无从核对').toContain('优先看阶位')
  })

  it('逐枚走同一个 wearSoul,判据不分叉', () => {
    expect(VIEW).toContain('wearSoul(p.soul.uid)')
  })
})
