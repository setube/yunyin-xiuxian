/* eslint-disable no-console */
/**
 * 道果消费的动机类型审计
 *
 * 逆旅契已证明规则型消费能改变构筑。但要问的下一个问题不是
 * 「还能设计什么限制」,而是:
 *
 *   **什么样的道果消费,会让玩家产生「我想看看这一世会发生什么」的欲望?**
 *
 * 挑战型(我想挑战自己)与探索型(我想看看会怎样)看着只差一点,
 * 动机却完全不同。区别可以量化 —— 核心是「第二次买还有没有未知」。
 */
import { describe, expect, it } from 'vitest'
import {
  CONDITIONS,
  NOVELTY_MIN,
  PLAIN_LIFE,
  classify,
  conditionsMetBy,
  hostReadyCount,
  poolExhaustion,
  ruleDistance,
  trialPairDistances,
  trialProfiles,
  voidWorldProfile
} from './motivationType'
import { LIFE_TRIALS } from '@/data/lifeTrials'

const TYPE_LABEL = { challenge: '挑战型', discovery: '探索型' }

describe('动机类型 · 逆旅契属于哪一种', () => {
  it('动机画像', () => {
    console.log('\n项目        可预知  偏离度  重玩增量  改变层  类型')
    for (const p of [...trialProfiles(), voidWorldProfile()]) {
      console.log(
        `${p.name.padEnd(12)} ${p.determinism.toFixed(2).padStart(6)} ` +
          `${p.deviation.toFixed(3).padStart(7)} ${p.replayDelta.toFixed(2).padStart(9)} ` +
          `${(p.surface === 'numbers' ? '数值' : '内容').padStart(6)}  ${TYPE_LABEL[p.type]}`
      )
    }
  })

  it('四份契的规则确实偏离了平常的一世 —— 它不是换皮', () => {
    for (const p of trialProfiles()) {
      expect(p.deviation).toBeGreaterThan(0)
    }
    const worst = trialProfiles().reduce((a, b) => (b.deviation > a.deviation ? b : a))
    console.log(
      `\n偏离最大的是「${worst.name}」(${worst.deviation.toFixed(3)}) ——` +
        `\n配合上一轮实测(四契皆改构筑排序),规则型消费的有效性已经坐实`
    )
  })

  it('但四份契全部是挑战型:签之前就知道会发生什么', () => {
    const ps = trialProfiles()
    for (const p of ps) {
      expect(p.determinism).toBe(1)
      expect(p.replayDelta).toBe(0)
      expect(p.type).toBe('challenge')
    }
    console.log(
      '\n规则是 LIFE_TRIALS 里的常量:签之前完全可预知,签第二次一模一样。' +
        '\n故动机只能是「我想做到」,不可能是「我想看看」'
    )
  })

  it('挑战型天然是一次性的:契约池会见底', () => {
    const { total, livesToExhaust } = poolExhaustion()
    expect(livesToExhaust).toBe(total)
    console.log('\n契约两两之间的规则距离:')
    for (const d of trialPairDistances()) {
      console.log(`  ${d.a} ↔ ${d.b}  ${d.d.toFixed(3)}`)
    }
    console.log(
      `\n枚举式内容的信息量有上限:${total} 份契签完就见底。` +
        `\n之后再签只是重复执行已知的东西 —— 这正是挑战型的边界`
    )
  })
})

describe('动机类型 · 探索型长什么样', () => {
  it('虚界是现成的对照:同一个入口,每次不同的世界', () => {
    const v = voidWorldProfile()
    expect(v.type).toBe('discovery')
    expect(v.replayDelta).toBeGreaterThan(0)
    expect(v.determinism).toBeLessThan(1)
    console.log(`\n虚界:${v.evidence}`)
  })

  it('关键不在「随机」,而在新颖度有下限保证', () => {
    // 随机换皮也能做到「每次不同」,但玩家很快会发现是同一批东西重排。
    // worldGen 的做法是设硬门槛:不够新就换种子重来
    expect(NOVELTY_MIN).toBeGreaterThan(0)
    expect(classify(0, NOVELTY_MIN)).toBe('discovery')
    // 而随机但无门槛的情形仍可能退化 —— 判据要求 replayDelta > 0 是**保证**
    expect(classify(0, 0)).toBe('challenge')
    console.log(
      `\n「每次不同」不等于探索型。若不同只是概率,玩家迟早看穿是同一批素材重排。` +
        `\nworldGen 的 NOVELTY_MIN=${NOVELTY_MIN} 是结构性保证:规则向量、敌人机制、` +
        `\n可行流派三维加权后不够新,直接弃用重生成`
    )
  })
})

describe('动机类型 · 探索型消费的三个结构条件', () => {
  it('条件表', () => {
    console.log('\n条件                  逆旅契  虚界  凡界有现成能力')
    for (const c of CONDITIONS) {
      console.log(
        `${c.name.padEnd(20)} ${(c.trialMeets ? '✓' : '✗').padStart(5)} ` +
          `${(c.voidMeets ? '✓' : '✗').padStart(5)} ${(c.hostReady ? '有' : '无').padStart(10)}`
      )
      console.log(`    ${c.desc}`)
      console.log(`    ${c.note}`)
    }
  })

  it('三条虚界全满足,逆旅契一条都不满足', () => {
    expect(conditionsMetBy('void')).toHaveLength(CONDITIONS.length)
    expect(conditionsMetBy('trial')).toHaveLength(0)
    console.log(
      `\n虚界 ${CONDITIONS.length}/${CONDITIONS.length},逆旅契 0/${CONDITIONS.length} ——` +
        `\n差距不在契约设计得好不好,在于它是枚举式的`
    )
  })

  it('最要紧的发现:这三条项目里已经实现过一遍了', () => {
    // worldGen 完整实现了生成式 + 新颖度门 + 内容级改变,
    // 但它只服务天界(真仙之后),凡界轮回一条都用不上
    const ready = hostReadyCount()
    expect(ready).toBeGreaterThan(0)
    expect(ready).toBeLessThan(CONDITIONS.length)
    console.log(
      `\n凡界现成可用的只有 ${ready}/${CONDITIONS.length} 条(新颖度判据本身是通用的)。` +
        `\n另两条卡在同一处:凡界的区域/敌人/事件都是静态定义,` +
        `\n没有可重组的内容层 —— 这才是「买到不同的世界」的真实成本`
    )
  })

  it('结论:动机类型的转换需要内容生成能力,不是再设计几份契', () => {
    // 沿着「还能设计什么限制」走下去,得到的仍然是挑战型:
    // 禁丹、独器、异途都是已知的限制,签之前就知道会发生什么
    const trials = trialProfiles()
    expect(trials.every(t => t.type === 'challenge')).toBe(true)
    expect(voidWorldProfile().type).toBe('discovery')
    console.log(
      '\n禁丹 / 独器 / 异途沿的仍是同一条路:限制是已知的,' +
        '\n签之前就知道会发生什么 —— 扩的是范围,不是动机类型。' +
        '\n\n要让道果买到「不同的一世」而非「更难的同一世」,' +
        '\n凡界需要一个可重组的内容层,再套上已有的新颖度判据。' +
        '\n在那之前,逆旅契作为挑战型内容是成立的,不该被硬塞奖励去充当长期动力'
    )
  })
})

describe('动机类型 · 判据自身的可靠性', () => {
  it('规则距离对「无变化」给零,对「有变化」给正值', () => {
    expect(ruleDistance(PLAIN_LIFE, PLAIN_LIFE)).toBe(0)
    for (const t of LIFE_TRIALS) {
      expect(ruleDistance(t.rules, PLAIN_LIFE)).toBeGreaterThan(0)
      // 自己与自己距离为零 —— 这正是 replayDelta = 0 的算式依据
      expect(ruleDistance(t.rules, t.rules)).toBe(0)
    }
    console.log('\n同一份契签两次,规则距离为 0 —— 重玩增量为零由此得出,不是主观判断')
  })

  it('分类函数在边界上表现正确', () => {
    expect(classify(1, 0)).toBe('challenge')
    expect(classify(1, 0.5)).toBe('challenge')
    expect(classify(0, 0)).toBe('challenge')
    expect(classify(0.5, 0.3)).toBe('discovery')
    console.log('\n两个条件缺一不可:可预知或无重玩增量,都归入挑战型')
  })
})
