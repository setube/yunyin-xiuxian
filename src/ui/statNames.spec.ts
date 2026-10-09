/**
 * 属性面板「展示诚实」契约 —— 补齐 signedPercent.spec 只测单条措辞、不锁「完整性」的缺口。
 *
 * 风险:战斗/事件里用掷骰判定的成功率、或靠阈值/门槛判定的词条,若面板只裸报一个加号数
 * (如「会心 +10%」却不讲它叠在固有 5% 之上、或「速度 +10%」却不讲它只是条抢先阈值),
 * 玩家看到的数和实际结算就是对不上的「说谎的数」,而 CI 毫无反应。
 *
 * 这里的合同:凡是要么叠在固有基数上、要么靠阈值/门槛才生效的「掷点/闸门」类词条,
 * 一律必须在 STAT_CAVEATS 里有说明(statValueText 会把它拼成「+N%(说明)」);只有纯乘性
 * 加成(攻/防/血、伤害倍率之类)才允许裸报成「+N%」。
 *
 * 名单取自真实掷点/闸门处(combat.ts 的 rng.chance、threshold 先手、破甲减防、各类门槛),
 * 逐键在下面用 statCaveat 断言 —— 未来新增一个掷点/闸门词条若不配说明,这里即红。
 */
import { describe, expect, it } from 'vitest'
import { statCaveat, statValueText } from './statNames'
import { CRIT_BASE, CRIT_DMG_BASE } from '@/data/constants'
import { formatPercent } from '@/utils/format'

/**
 * 掷点/闸门类词条:在真实机制里决定一次判定(成功率叠基 / 阈值 / 门槛),展示必须带说明。
 * 来源一一对应:
 *  - combat.ts:360  critRate  = CRIT_BASE + mod(rng.chance)
 *  - combat.ts        critDamage  命中会心时按此放大(叠 CRIT_DMG_BASE)
 *  - combat.ts:343    闪避/命中 相减后掷点
 *  - combat.ts:407/427/435  counter/combo/stun 各掷一次
 *  - combat.ts:534    先手 = 1+speed ≥ 敌速(阈值开关)
 *  - combat.ts:351/533 firstStrike 只改第一回合
 *  - combat.ts:144    armorPen 削防后入减免(非真伤)
 *  - 各类门槛词条: lowHpDamage/lowHpReduction/fullHpDamage/executeDamage/shieldOnStart
 *  - loot/事件: doubleDropRate / eventLuck / explorationSpeed / tribulationResist /
 *               breakthroughRate / breakRefund
 */
const ROLL_OR_GATE: readonly string[] = [
  'critRate',
  'critDamage',
  'dodgeRate',
  'accuracy',
  'counterRate',
  'comboRate',
  'stunRate',
  'speed',
  'firstStrike',
  'armorPen',
  'lowHpDamage',
  'lowHpReduction',
  'fullHpDamage',
  'executeDamage',
  'doubleDropRate',
  'eventLuck',
  'explorationSpeed',
  'tribulationResist',
  'breakthroughRate',
  'breakRefund',
  'shieldOnStart',
  'lifesteal',
  'regenPerRound'
]

describe('属性面板展示诚实契约', () => {
  it('掷点/闸门类词条一律带说明,不得裸报成加号数(叠基/阈值/门槛必须讲清)', () => {
    for (const key of ROLL_OR_GATE) {
      const caveat = statCaveat(key)
      expect(caveat, `${key} 是掷点/闸门词条,必须配 STAT_CAVEATS 说明`).toBeTruthy()
      // statValueText 会把说明拼成「+N%(说明)」——带括号即说明真的露出来了
      expect(statValueText(key as never, 0.1), `${key} 应渲染成 带说明 形式`).toContain('(')
    }
  })

  it('带说明的掷点词条:叠基的实实在在地报出固有基数(会心/会心之伤)', () => {
    // 会心叠在固有 5% 之上 —— 界面给的是说明里的基数,不是把 5% 藏起来谎称全是词条给
    expect(statValueText('critRate' as never, 0.1)).toBe(`+10%(叠于固有会心 ${formatPercent(CRIT_BASE)} 之上)`)
    expect(statValueText('critDamage' as never, 0.1)).toBe(
      `+10%(叠于固有会心之伤 ${formatPercent(CRIT_DMG_BASE)} 之上)`
    )
  })

  it('纯乘性加成(攻/防/血/伤害倍率)才允许裸报成加号数', () => {
    // 攻击加成倍率整条攻击,没有暗中叠在某个未告知的基数上 → 裸报 +N% 是诚实的
    for (const key of ['attackPct', 'defensePct', 'maxHpPct', 'damageBonus']) {
      expect(statCaveat(key), `${key} 是纯乘性加成,不应配说明(裸报`).toBeFalsy()
      expect(statValueText(key as never, 0.2), `${key} 应裸报 +%`).toBe('+20%')
    }
  })
})
