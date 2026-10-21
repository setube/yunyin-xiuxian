/* eslint-disable no-console -- 破界三境的读数是要给人看的 */
/**
 * 界膜之劫(Phase 39)—— 跨界那一步的加难规则
 *
 * 这一版的加难落在两个地方,彼此必须对得上:
 *   ① 界末圆满的修为墙(WORLD_STEP_EXP_MULT,算在 expRequirement 里)
 *   ② 界膜那一关不认三维折算(TRIB_WORLD_STEP_STAT_FOLD,走 statFoldAt)
 * 两条若各说各的,玩家就会看到"需求很重,打起来却还是老样子"(或反之)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isWorldEntry, MAX_MAJOR, REALMS, WORLD_BREAK_MAJOR } from '@/data/realms'
import { TRIB_WORLD_STEP_STAT_FOLD, WORLD_STEP_EXP_MULT } from '@/data/constants'
import { expRequirement } from './formulas'
import { statFoldAt } from './tribulationDecision'
import { toNum } from '@/utils/gnum'

/** 三个跨界入口:飞升 / 破界 / 归返 */
const BOUNDARIES = [9, 14, 18]

describe('界膜之劫 · 规则', () => {
  it('界膜就是三个界域入口 —— 判据与 isWorldEntry 同源,不在别处另写一份', () => {
    for (let m = 1; m <= MAX_MAJOR; m += 1) {
      expect(statFoldAt(m) < 1, `${REALMS[m]!.name} 的折算口径与 isWorldEntry 对不上`).toBe(isWorldEntry(m))
    }
    for (const m of BOUNDARIES) expect(isWorldEntry(m), `${REALMS[m]!.name} 该是跨界那一境`).toBe(true)
  })

  it('界内的关照常认血肉,界膜那一关一概不认', () => {
    expect(TRIB_WORLD_STEP_STAT_FOLD, '规则 0 = 三维折算作废;改成别的值要连文案一起改').toBe(0)
    expect(statFoldAt(WORLD_BREAK_MAJOR - 1)).toBe(1) // 渡劫(界内)
    expect(statFoldAt(WORLD_BREAK_MAJOR)).toBe(TRIB_WORLD_STEP_STAT_FOLD) // 真仙(跨出去的那一境)
  })

  it('修为墙只压在界末的圆满那一层 —— 前面九层仍按正常曲线走', () => {
    for (const last of [8, 13, 17]) {
      const stepped = toNum(expRequirement(last, 9))
      const normal = toNum(expRequirement(last, 8))
      const ratio = stepped / (normal * 1.32) // 圆满相对前一层的自然倍率是 EXP_SUB_GROWTH
      console.log(
        `  ${REALMS[last]!.name}圆满:前一层 ${normal.toExponential(2)} → 圆满 ${stepped.toExponential(2)}(墙 ×${ratio.toFixed(2)})`
      )
      expect(ratio).toBeCloseTo(WORLD_STEP_EXP_MULT, 1)
    }
    // 界内非圆满的层没有这道墙
    expect(statFoldAt(5)).toBe(1)
    expect(toNum(expRequirement(5, 5))).toBeLessThan(toNum(expRequirement(8, 9)))
  })
})

describe('界膜之劫 · 玩家看得见', () => {
  /**
   * 加难必须**在决意之前**说清楚:上一版玩家吃过"护持明明写着有、过劫时却像没有"的亏,
   * 这种误会不该靠一次失败去发现。故劫势面板要明写这条规则(读源码,不跑界面)。
   */
  it('劫势面板把「界膜不认血肉」写在按钮之前', () => {
    const src = (p: string): string => readFileSync(resolve(__dirname, p), 'utf8')
    // 劫势面板拆出后判据随本体走:判定在 composable,规则文案在详情面板 —— 三处合扫
    const cultivation =
      src('../views/CultivationView.vue') +
      src('../composables/useTribulation.ts') +
      src('../components/cultivation/TribulationDetail.vue')
    expect(cultivation, '劫势面板该用 statFoldAt 判断这一步是不是界膜').toContain('statFoldAt(')
    expect(cultivation, '界膜之劫的规则必须摊在面板上').toContain('界膜之劫')
    expect(cultivation, '规则文案要与判据同源,不能另写一份境界清单').not.toContain('needTribulation && player.major + 1 === 9')
  })
})
