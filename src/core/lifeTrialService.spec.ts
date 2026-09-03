/* eslint-disable no-console */
/**
 * 逆旅契 —— 道果第一个非效率出口的四条强制判据
 *
 * 这是第一个真正会让道果**下降**的出口。上一轮把边界划定后,
 * 本轮验证边界是否真的守住了。四条判据缺一不可:
 *
 *   1. 消费后余额真的下降 —— 不是记一笔「已花费」
 *   2. 产物不进 StatMods
 *   3. 产物不经第二/三跳回到 StatMods
 *   4. 不形成自供能循环 —— 出口产物不得最终产生道果本身
 *
 * 判据 3、4 靠类型检查抓不到,故用**源码扫描**强制:
 * 服务层不得出现 addDaoFruit / addInsight / 资源发放 / StatMods 写入。
 * 这样以后任何人给契约「加个甜头」都会立刻变红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LIFE_TRIALS, adverseViolations, isPurelyAdverse, lifeTrialDef } from '@/data/lifeTrials'
import {
  activeLifeTrial,
  archiveLifeTrial,
  canSignLifeTrial,
  lifeTrialRules,
  signLifeTrial
} from './lifeTrialService'
import { usePlayerStore } from '@/stores/player'
import { reachesEfficiency } from './fruitOutlets'
import type { AnyStatKey } from '@/types'

const SERVICE_SRC = readFileSync(resolve(__dirname, 'lifeTrialService.ts'), 'utf-8')
/** 只看代码,不看注释 —— 注释里正大光明地写着这些名字 */
const SERVICE_CODE = SERVICE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('逆旅契 · 判据一:余额真的下降', () => {
  it('签约后道果减少,而不是只记一笔已花费', () => {
    const player = usePlayerStore()
    player.addDaoFruit(100)
    const before = player.reincarnation.daoFruit
    const def = lifeTrialDef('tr_gu')!
    expect(signLifeTrial('tr_gu')).toBe(true)
    const after = player.reincarnation.daoFruit
    expect(after).toBe(before - def.cost)
    console.log(`\n签「${def.name}」:道果 ${before} → ${after}(-${def.cost})`)
  })

  it('余额不足时拒签,且不产生任何扣减', () => {
    const player = usePlayerStore()
    player.addDaoFruit(10)
    expect(canSignLifeTrial('tr_ni')).toBe(false)
    expect(signLifeTrial('tr_ni')).toBe(false)
    expect(player.reincarnation.daoFruit).toBe(10)
    expect(player.reincarnation.trial).toBeNull()
  })

  it('一世只能签一份,签下不可解除', () => {
    const player = usePlayerStore()
    player.addDaoFruit(200)
    expect(signLifeTrial('tr_gu')).toBe(true)
    const after = player.reincarnation.daoFruit
    // 第二份签不了,余额也不再变化
    expect(signLifeTrial('tr_ji')).toBe(false)
    expect(player.reincarnation.daoFruit).toBe(after)
    // 可退款等于没花掉,故服务层不提供任何退款入口
    expect(SERVICE_CODE).not.toMatch(/refund|退款|cancelTrial/i)
    console.log('\n无退款入口 —— 可退的消费等于假消费')
  })
})

describe('逆旅契 · 判据二:产物不进 StatMods', () => {
  it('契约只施加战斗规则,不发放任何属性', () => {
    for (const t of LIFE_TRIALS) {
      // playerExtraMods 若存在,其值必须全为负(减益)
      for (const [k, v] of Object.entries(t.rules.playerExtraMods ?? {})) {
        expect(v).toBeLessThanOrEqual(0)
        expect(reachesEfficiency(k as AnyStatKey)).toBe(true)
      }
    }
    // 服务层不写任何 mods
    expect(SERVICE_CODE).not.toMatch(/StatMods|attackPct|cultivationSpeed/)
  })

  it('每一份契都是纯逆境:只许加难,不许减难', () => {
    console.log('\n契        定价  规则')
    for (const t of LIFE_TRIALS) {
      expect(isPurelyAdverse(t.rules)).toBe(true)
      console.log(`${t.name.padEnd(8)} ${String(t.cost).padStart(4)}  ${t.ruleText}`)
    }
  })

  it('校验器能抓出「减难」的伪装', () => {
    // 故障注入:这些都是把契约悄悄变成增益的写法
    expect(adverseViolations({ enemyAtkMult: 0.8 })).not.toHaveLength(0)
    expect(adverseViolations({ healMult: 1.5 })).not.toHaveLength(0)
    expect(adverseViolations({ playerExtraMods: { attackPct: 0.2 } })).not.toHaveLength(0)
    expect(adverseViolations({ enemyExtraMods: { attackPct: -0.2 } })).not.toHaveLength(0)
    expect(adverseViolations({ perRounds: { interval: 3, playerHealPct: 0.1, playerShieldPct: 0.1, enemyAtkGrowth: 0 } })).not.toHaveLength(0)
    console.log(`\n伪装示例被拒:${adverseViolations({ playerExtraMods: { attackPct: 0.2 } })[0]}`)
  })

  it('非法契约即使被写进数据也签不下去', () => {
    const player = usePlayerStore()
    player.addDaoFruit(500)
    // canSign/sign 都要过 isPurelyAdverse,数据层出错时服务层是第二道闸
    expect(SERVICE_CODE).toMatch(/isPurelyAdverse/)
    const occurrences = SERVICE_CODE.match(/isPurelyAdverse/g)!.length
    expect(occurrences).toBeGreaterThanOrEqual(2)
    console.log(`\nisPurelyAdverse 在服务层被调用 ${occurrences} 次(canSign 与 sign 各一道)`)
  })
})

describe('逆旅契 · 判据三:不经第二三跳回到 StatMods', () => {
  it('服务层不发放任何资源', () => {
    // 灵石/丹药/材料 → 强化 → 战力 → 历练更快,三跳回环
    expect(SERVICE_CODE).not.toMatch(/spiritStone|addHerb|addOre|wudao|pills|useResourcesStore/)
    console.log('\n无资源发放 —— 堵住「道果 → 灵石 → 强化 → 战力」这条三跳路径')
  })

  it('服务层不发放宿慧 —— 这是最隐蔽的一条路径', () => {
    // 宿慧 → aptitudeFloorNow → growthMult → linggenMult → cultivationSpeed
    // 「完成契约给命题进度」看起来很自然,实际是三跳回到修炼速度
    expect(SERVICE_CODE).not.toMatch(/addInsight|setVow|useQuestsStore/)
    console.log(
      '\n无宿慧发放 —— 「契约完成给命题进度」看似自然,' +
        '\n实则 宿慧 → 资质地板 → 成长倍率 → 修炼速度,三跳回环'
    )
  })

  it('唯一的回报是履历,而履历不进任何计算', () => {
    const player = usePlayerStore()
    player.addDaoFruit(100)
    signLifeTrial('tr_gu')
    expect(archiveLifeTrial()).toBe('tr_gu')
    // LifeRecord.trialId 只被展示,不参与任何数值
    console.log('\n回报 = LifeRecord.trialId,纯记录')
  })
})

describe('逆旅契 · 判据四:不形成自供能循环', () => {
  it('服务层不产生道果 —— 道果不得生道果', () => {
    // 「完成契约返还部分道果」「困难契约多给道果」都会造出新的资源机器
    expect(SERVICE_CODE).not.toMatch(/addDaoFruit/)
    console.log('\n无 addDaoFruit —— 堵住「道果 → 契约 → 更多道果 → 再买契约」')
  })

  it('契约也不提高道果产出速率', () => {
    // daoFruitGain 只看终点境界;契约不碰它,故不能间接增产
    expect(SERVICE_CODE).not.toMatch(/daoFruitGain|DAO_FRUIT_/)
    console.log('\n不碰 daoFruitGain —— 契约无法让同一世凝出更多道果')
  })

  it('反而是净支出:签得越多,余额越少', () => {
    const player = usePlayerStore()
    player.addDaoFruit(100)
    const before = player.reincarnation.daoFruit
    signLifeTrial('tr_ji')
    // 本世内不存在任何回流路径
    expect(player.reincarnation.daoFruit).toBeLessThan(before)
    console.log(`\n净支出确认:${before} → ${player.reincarnation.daoFruit}`)
  })
})

describe('逆旅契 · 接入与存档', () => {
  it('未签约时不产生任何规则,不影响原有战斗', () => {
    expect(lifeTrialRules()).toBeUndefined()
    expect(activeLifeTrial()).toBeNull()
  })

  it('签约后规则可注入历练战斗', () => {
    const player = usePlayerStore()
    player.addDaoFruit(100)
    signLifeTrial('tr_ni')
    const rules = lifeTrialRules()!
    expect(rules.enemyAtkMult).toBe(1.3)
    expect(rules.enemyHpMult).toBe(1.2)
    console.log(`\n本世规则:${JSON.stringify(rules)}`)
  })

  it('老存档无 trial 字段时安全降级为未签约', () => {
    const player = usePlayerStore()
    // 模拟老存档:reincarnation 里没有 trial
    const legacy = { count: 3, daoFruit: 50, talents: [], insight: 0, lives: [], vow: null }
    player.$patch({ reincarnation: legacy as never })
    player.sanitize()
    expect(player.reincarnation.trial).toBeNull()
    expect(lifeTrialRules()).toBeUndefined()
    console.log('\n老存档降级正常:trial = null,不影响任何既有行为')
  })
})
