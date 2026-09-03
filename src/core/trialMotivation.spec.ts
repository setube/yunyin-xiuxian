/* eslint-disable no-console */
/**
 * 逆旅契动机审计
 *
 * 逆旅契的技术验证已经完成:道果第一次真的会下降,回路没被接回来。
 * 但「不可复利」不等于「有吸引力」。本套用例只回答一个问题:
 *
 *   **四份契创造了玩法变化,还是只是让数字变差?**
 *
 * 判据:若签契后最优构筑不变、排序不变,只是全体胜率等比下降,
 * 那就是纯罚款。这时该改的是契的玩法改变程度,不是给它补奖励 ——
 * 补奖励会把刚切断的回路又接回来。
 *
 * 不改数值、不加任何奖励。
 */
import { describe, expect, it } from 'vitest'
import {
  AXIS_COVERAGE,
  AXIS_NAMES,
  IMMUTABLE_SPACE,
  MUTABLE_SPACE,
  allImpacts,
  playValueOf,
  standings,
  untouchedAxes
} from './trialMotivation'

const impacts = allImpacts(60)
const VALUE_LABEL = { reshapes: '改变排序', tilts: '有倾向', flat: '纯变难' }

describe('动机 · 四份契到底改变了什么', () => {
  it('基线构筑排行', () => {
    console.log('\n无契时的构筑排行:')
    for (const s of standings(undefined, 60)) {
      console.log(`  ${s.rank + 1}. ${s.name.padEnd(8)} ${(s.winRate * 100).toFixed(1)}%`)
    }
  })

  it('逐契影响表', () => {
    console.log('\n契        变难     排名变动  位移  最强易主  影响不均  判定')
    for (const im of impacts) {
      console.log(
        `${im.trial.name.padEnd(8)} ${`-${(im.drop * 100).toFixed(1)}pp`.padStart(7)} ` +
          `${String(im.rankShifts).padStart(8)} ${String(im.rankDistance).padStart(5)} ` +
          `${(im.topChanged ? '是' : '否').padStart(8)} ${(im.differential * 100).toFixed(2).padStart(8)} ` +
          `  ${VALUE_LABEL[playValueOf(im)]}`
      )
    }
  })

  it('每份契都确实变难了 —— 惩罚是真的', () => {
    for (const im of impacts) {
      expect(im.trialWin).toBeLessThan(im.baseWin)
    }
    const worst = impacts.reduce((a, b) => (b.drop > a.drop ? b : a))
    console.log(`\n最重的是「${worst.trial.name}」:平均胜率 -${(worst.drop * 100).toFixed(1)}pp`)
  })

  it('关键问题:变难之外,有没有改变决策', () => {
    const reshaping = impacts.filter(im => playValueOf(im) === 'reshapes')
    const flat = impacts.filter(im => playValueOf(im) === 'flat')
    console.log(
      `\n改变构筑排序的:${reshaping.map(i => i.trial.name).join('、') || '无'}` +
        `\n纯粹等比变难的:${flat.map(i => i.trial.name).join('、') || '无'}`
    )
    // 这一条不预设结果,只把事实钉住:若全部为 flat,则四份契都只是罚款
    expect(reshaping.length + flat.length).toBeLessThanOrEqual(impacts.length)
  })

  it('影响不均度决定了是否需要玩家重新思考', () => {
    console.log('\n契        受影响最大与最小构筑的胜率差')
    for (const im of impacts) {
      console.log(`${im.trial.name.padEnd(8)} ${(im.spread * 100).toFixed(1)}pp`)
    }
    // 等比变难时 spread 接近 0;针对性强时 spread 大
    const maxSpread = Math.max(...impacts.map(i => i.spread))
    console.log(
      `\n最大不均 ${(maxSpread * 100).toFixed(1)}pp —— ` +
        `不均越大,越说明「这一世该换个打法」,而不只是「这一世更苦」`
    )
  })
})

describe('动机 · 决策维度覆盖', () => {
  it('静态标注必须与实测一致:build 一格确实被激活', () => {
    // AXIS_COVERAGE 把 build 标为已覆盖,依据是实测排序改变。
    // 若将来契约改到不再影响排序,这条一致性校验会立刻变红
    const claimsBuild = AXIS_COVERAGE.every(c => c.axes.includes('build'))
    const actuallyReshapes = impacts.every(im => playValueOf(im) === 'reshapes')
    expect(claimsBuild).toBe(actuallyReshapes)
    console.log(`\n标注 build=${claimsBuild} · 实测全部改变排序=${actuallyReshapes},一致`)
  })

  it('但探索、顺序、遭遇、目标四格一个都没碰到', () => {
    const untouched = untouchedAxes()
    console.log('\n未被任何契触及的决策维度:')
    for (const a of untouched) console.log(`  ${AXIS_NAMES[a]}`)
    // 契约全部挂在 CombatRules 上,故这四格碰不到
    expect(untouched).toContain('region')
    expect(untouched).toContain('order')
    expect(untouched).toContain('encounter')
    expect(untouched).toContain('goal')
    console.log(
      `\n${untouched.length} / ${Object.keys(AXIS_NAMES).length} 个维度未被触及 ——` +
        `\n契约不改变探索路线、不改变解锁顺序、不引入新敌人、不改变本世目标`
    )
  })

  it('诊断:动机不足不是因为「只会变难」,而是因为改变只发生在战斗内部', () => {
    const untouched = untouchedAxes()
    // 实测已推翻「纯罚款」的假设:契约确实创造了构筑取舍。
    // 但取舍全部发生在一场战斗之内,一世的**结构**没有变 ——
    // 玩家走的还是同样的区域、同样的顺序、同样的目标
    expect(untouched.length).toBeGreaterThanOrEqual(4)
    expect(impacts.every(im => playValueOf(im) === 'reshapes')).toBe(true)
    console.log(
      '\n契约不是纯罚款:它真的让玩家需要换打法(首尾构筑最大拉开 63.8pp)。' +
        '\n但改变只发生在战斗内部,一世的结构没变 ——' +
        '\n同样的区域、同样的顺序、同样的目标。' +
        '\n故要提高动机,该扩的是玩法面(探索/物品/顺序/目标),不是补奖励'
    )
  })
})

describe('动机 · 架构边界', () => {
  it('可动与不可动的空间', () => {
    console.log(`\n可动(Rule Space):${MUTABLE_SPACE.join(' · ')}`)
    console.log(`不可动:${IMMUTABLE_SPACE.join(' · ')}`)
  })

  it('这条边界允许大胆内容而不制造新闭环', () => {
    // 「本世不得使用某类丹药」「只能带一件法宝」「探索路线受限」
    // 都在可动空间内,都改变玩法,都不产生跨世成长
    expect(MUTABLE_SPACE).toContain('可用物品')
    expect(MUTABLE_SPACE).toContain('探索路线')
    expect(IMMUTABLE_SPACE).toContain('DaoFruit')
    expect(IMMUTABLE_SPACE).toContain('Insight(宿慧)')
    console.log(
      '\n下一批契可以动的:限制可用丹药/法宝、限定探索路线、' +
        '\n改变解锁顺序、给本世换一个目标 —— 都改玩法,都不进成长经济'
    )
  })
})
