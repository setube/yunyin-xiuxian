/* eslint-disable no-console -- 三条渠道的对账表是给人看的 */
/**
 * 修为收入结构 —— 守设计不变量,不守当时的快照
 *
 * Phase 39 续的口径(见 core/expIncome 头部与那份设计记录):
 *   修为只有一条基线(挂机 1.0×),另外两条是**有界的**,
 *   且三者恰好闭合:**闭关 ≈ 挂机 + 历练**(2.5× vs 2.51×)。
 *
 * 每个用例对应一个玩家能理解的场景,而不是把常数再抄一遍:
 *   ① 三角场景:21 境里「挂机+历练」与「闭关」都 ≈2.5× 挂机,且彼此相差 <5%
 *   ② 通关场景:界末圆满那道修为墙(×2),单靠战斗也要十天以上
 *   ③ 前期场景:炼气期一场遭遇填不满一层 —— 连首领+涉险+福缘叠满也只给不满一层
 *   ④ 同源场景:离线 N 场 = N 次单场(上限一并放大,不偷跑也不被封顶吃掉)
 *   ⑤ 一把尺子:同一段时长在深境只更不值钱;修速翻倍则收益翻倍
 *   ⑥ 数据侧:每一条际遇/机缘的修为都落在 30~120 秒
 *   ⑦ 接线红线:四条来源都走同一个结算函数(读源码,不在别处另写百分比)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TYPICAL_EVENT_EXP_SECS,
  TYPICAL_WIN_RATE,
  battlesPerHour,
  encountersPerHour,
  eventsPerHour,
  expIncomeAt,
  expIncomeAudit,
  retreatExpSecsPerHour,
  tripExpSecsPerHour,
  winsPerHour
} from './expIncome'
import { BATTLE_EXP_SECS, INSTANT_EXP_LAYER_CAP } from '@/data/constants'
import { MAX_MAJOR, REALMS } from '@/data/realms'
import { EVENTS, FORTUNE_EVENTS } from '@/data/events'
import { CHAIN_EVENTS } from '@/data/chains'
import { expFromSecs, expRequirement } from './formulas'
import { layerSeconds } from './pillValue'
import { toNum } from '@/utils/gnum'

describe('修为收入 · 设计不变量', () => {
  const rows = expIncomeAudit()

  it('对账表:三条渠道都折成「等效闭关秒/小时」', () => {
    console.log(
      `\n—— 修为收入(等效闭关秒/小时;每时 ${encountersPerHour().toFixed(0)} 次遭遇,` +
        `战斗 ${battlesPerHour().toFixed(0)}(胜 ${winsPerHour().toFixed(0)})· 际遇 ${eventsPerHour().toFixed(0)}) ——`
    )
    for (const r of rows) {
      console.log(
        `  ${REALMS[r.major]!.name.padEnd(5)} 挂机 ${r.idlePerHour} · 历练 +${Math.round(r.tripPerHour)}` +
          ` → 合计 ×${r.ratio.toFixed(2)} · 闭关 ×${(r.retreatPerHour / r.idlePerHour).toFixed(2)}`
      )
    }
    expect(rows.length).toBe(MAX_MAJOR + 1)
  })

  it('① 三角闭合:挂机+历练 ≈ 闭关 ≈ 2.5× 挂机,且在 21 境里一模一样', () => {
    for (const r of rows) {
      expect(r.ratio, `${REALMS[r.major]!.name} 的合计倍率落在设计区间之外`).toBeGreaterThan(2.3)
      expect(r.ratio, `${REALMS[r.major]!.name} 的合计倍率落在设计区间之外`).toBeLessThan(2.7)
      // 闭关与「挂机+历练」打平 —— 这个差额就是"要不要掉落"的价码,不该超过 5%
      const gap = Math.abs(r.retreatPerHour - r.totalPerHour) / r.totalPerHour
      expect(gap, `${REALMS[r.major]!.name}:闭关与挂机+历练差 ${(gap * 100).toFixed(1)}%`).toBeLessThan(0.05)
    }
    // 「一模一样」不是修辞:三条线都只跟修速走,故任何两境比值相同
    const first = rows[0]!.ratio
    for (const r of rows) expect(r.ratio).toBeCloseTo(first, 9)
    // 历练那一半单独看也在合理区间(不是装饰,也不喧宾夺主)
    const tripOnly = tripExpSecsPerHour() / 3600
    expect(tripOnly).toBeGreaterThan(1.2)
    expect(tripOnly).toBeLessThan(1.8)
    console.log(`\n  历练单独 ×${tripOnly.toFixed(2)} · 闭关 ×${(retreatExpSecsPerHour() / 3600).toFixed(2)}`)
  })

  it('② 界末圆满那道修为墙,单靠战斗也要十天以上', () => {
    for (const last of [8, 13, 17]) {
      const wallSecs = layerSeconds(last) * 2 // ×2 = WORLD_STEP_EXP_MULT,见 boundaryTribulation.spec
      const hours = wallSecs / BATTLE_EXP_SECS / winsPerHour()
      console.log(`  ${REALMS[last]!.name}圆满的界膜墙:约 ${(hours / 24).toFixed(1)} 天全时战斗(按胜场算)`)
      expect(hours / 24, `${REALMS[last]!.name} 的界膜墙被战斗刷穿得太快`).toBeGreaterThan(10)
    }
  })

  it('③ 前期:炼气期一场遭遇填不满一层 —— 连首领+涉险+福缘叠满也不行', () => {
    const layer0 = layerSeconds(0)
    expect(BATTLE_EXP_SECS / layer0).toBeLessThan(INSTANT_EXP_LAYER_CAP)
    const stackedSecs = BATTLE_EXP_SECS * 4 * 1.9 * 2 // 首领 ×4 · 涉险求机 ×1.9 · 福缘 ×2
    expect(stackedSecs / layer0, '叠满的裸账若不越界,这条判据就没有在守东西').toBeGreaterThan(1)
    const capped = expFromSecs(expRequirement(0, 0), stackedSecs, 1, INSTANT_EXP_LAYER_CAP)
    expect(toNum(capped)).toBeCloseTo(toNum(expRequirement(0, 0)) * INSTANT_EXP_LAYER_CAP, 9)
  })

  it('④ 离线 N 场 = N 次单场(上限一并放大)', () => {
    const req = expRequirement(9, 5)
    const speed = 7
    const one = expFromSecs(req, BATTLE_EXP_SECS, speed, INSTANT_EXP_LAYER_CAP)
    const hundred = expFromSecs(req, BATTLE_EXP_SECS * 100, speed, INSTANT_EXP_LAYER_CAP * 100)
    expect(toNum(hundred)).toBeCloseTo(toNum(one) * 100, 3)
  })

  it('⑤ 一把尺子:同一段时长在深境只更不值钱;修速翻倍则收益翻倍', () => {
    const shareAt = (major: number): number => Math.min(1, TYPICAL_EVENT_EXP_SECS / layerSeconds(major))
    expect(shareAt(MAX_MAJOR)).toBeLessThan(shareAt(5))
    const req = expRequirement(MAX_MAJOR, 5)
    const slow = expFromSecs(req, TYPICAL_EVENT_EXP_SECS, 10, INSTANT_EXP_LAYER_CAP)
    const fast = expFromSecs(req, TYPICAL_EVENT_EXP_SECS, 20, INSTANT_EXP_LAYER_CAP)
    expect(toNum(fast) / toNum(slow)).toBeCloseTo(2, 9)
  })

  it('⑥ 数据侧:每一条际遇/机缘的修为都在 30~120 秒(2.5~10 场遭遇)', () => {
    const effects = [...EVENTS, ...CHAIN_EVENTS, ...FORTUNE_EVENTS].flatMap(ev =>
      ev.choices.flatMap(c => c.outcomes.flatMap(o => o.effects))
    )
    const secs = effects.filter(e => e.type === 'exp').map(e => e.secs)
    expect(secs.length, '一件带修为的事件都没有?那这条判据在守空气').toBeGreaterThan(20)
    for (const s of secs) {
      expect(s, `事件修为 ${s} 秒落在区间之外`).toBeGreaterThanOrEqual(30)
      expect(s, `事件修为 ${s} 秒落在区间之外`).toBeLessThanOrEqual(120)
    }
  })

  it('际遇与战斗的相对量级:一次际遇 = 五场遭遇(典型值)', () => {
    expect(TYPICAL_EVENT_EXP_SECS / BATTLE_EXP_SECS).toBeCloseTo(5, 9)
    expect(battlesPerHour() + eventsPerHour()).toBeCloseTo(encountersPerHour(), 9)
    // 胜率是唯一的"打折":常驻词条与状态不该被绕过
    expect(winsPerHour()).toBeCloseTo(battlesPerHour() * TYPICAL_WIN_RATE, 9)
    expect(expIncomeAt(9).tripPerHour).toBeGreaterThan(0)
  })
})

/**
 * 接线红线 —— 算得对,还得**真的有人在用**。
 *
 * 读源码:五条即时修为来源(丹药 / 一场遭遇 / 离线 N 场 / 际遇 / 洞府巡游)都必须走
 * formulas.expFromSecs。从前它们各写一遍「需求 × 百分比」,于是每一处都随境界
 * 指数膨胀 —— 只要有一处被漏回去,这里就红。
 */
describe('即时修为 · 同源接线', () => {
  const src = (p: string): string => readFileSync(resolve(__dirname, p), 'utf8')

  it('丹药 / 战斗 / 离线 / 际遇 / 巡游五条来源共用同一个结算函数', () => {
    for (const [file, why] of [
      ['./pillService.ts', '丹药'],
      ['./loot.ts', '一场遭遇'],
      ['./offline.ts', '离线 N 场'],
      ['./eventEngine.ts', '际遇与机缘'],
      ['./earlyGameService.ts', '洞府巡游']
    ] as const) {
      const text = src(file)
      expect(text, `${why} 没有走 expFromSecs —— 又在自己算百分比了`).toContain('expFromSecs(')
      expect(text, `${why} 里还留着「需求 × 百分比」的老写法`).not.toMatch(/mulN\(player\.expReq,/)
    }
  })

  it('收入结构只有一份算法 —— 经济审计读的是这里的速率,不许自己再推一遍', () => {
    const sim = src('./economySim.ts')
    expect(sim, '经济审计该读 expIncome 的速率口径').toContain('expIncome')
    expect(sim, '经济审计又自己写了一份遭遇/胜场速率').not.toMatch(/const battlesPerHour = \(3600/)
  })
})
