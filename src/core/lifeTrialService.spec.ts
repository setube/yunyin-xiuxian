/* eslint-disable no-console */
/**
 * 逆旅契(道果非效率出口)的四条判据:
 *   1. 消费后余额真的下降,不是记一笔「已花费」
 *   2. 产物不进 StatMods
 *   3. 产物不经第二/三跳回到 StatMods
 *   4. 不形成自供能循环:出口产物不得最终产生道果
 * 3、4 用源码扫描强制:服务层不得出现 addDaoFruit / addInsight / 资源发放 / StatMods 写入。
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
  lifeTrialShortfall,
  signLifeTrial
} from './lifeTrialService'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { reachesEfficiency } from './fruitOutlets'
import type { AnyStatKey } from '@/types'

const SERVICE_SRC = readFileSync(resolve(__dirname, 'lifeTrialService.ts'), 'utf-8')
/** 去掉注释再扫:服务层注释里写着这些名字 */
const SERVICE_CODE = SERVICE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('逆旅契 · 坏 id 的守卫', () => {
  /**
   * `if (!def) return false` 不能省:去掉后 `def.cost` 会直接抛 TypeError。
   *
   * 这条路径真实存在 —— 契约 id 来自存档(旧版本写过、或手改档),
   * 而 lifeTrialDef 对未知 id 返回 undefined。
   */
  it('未知契约 id:返回 false,不抛错、不扣道果、不刷拒因', () => {
    const player = usePlayerStore()
    player.addDaoFruit(100)
    const before = player.reincarnation.daoFruit
    const toastsBefore = useUiStore().toasts.length

    expect(() => signLifeTrial('tr_不存在的契约')).not.toThrow()
    expect(signLifeTrial('tr_不存在的契约')).toBe(false)
    expect(player.reincarnation.daoFruit, '未签约不该扣道果').toBe(before)
    expect(useUiStore().toasts.length, '查无此契不是玩家操作失误,不该弹拒因').toBe(toastsBefore)
  })
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

  it('余额不足:缺口只报尚差多少,卡面与服务拒因同源', () => {
    const player = usePlayerStore()
    const def = lifeTrialDef('tr_ni')!
    player.addDaoFruit(10)
    const short = lifeTrialShortfall('tr_ni')
    expect(short).toBe(def.cost - 10)

    expect(signLifeTrial('tr_ni')).toBe(false)
    expect(useUiStore().toasts.at(-1)?.text).toBe(`道果尚差 ${def.cost - 10}`)
    expect(player.reincarnation.daoFruit).toBe(10)
    expect(player.reincarnation.trial).toBeNull()
  })

  it('付得起后缺口归空;已立契时也不再报缺', () => {
    const player = usePlayerStore()
    player.addDaoFruit(lifeTrialDef('tr_ni')!.cost)
    expect(lifeTrialShortfall('tr_ni')).toBeNull()
    expect(signLifeTrial('tr_ni')).toBe(true)
    expect(lifeTrialShortfall('tr_gu')).toBeNull()
  })

  it('逆旅契卡付不起即禁用并就地列差,不再只降透明度', () => {
    const card = readFileSync(resolve(__dirname, '../components/character/RebirthDialog.vue'), 'utf8')
    // 落点从「模板里逐张现算」搬到 setup 的 trialRows(一次算齐),判据跟着钉新落点
    expect(card, '付不起的契必须真的禁用').toContain(':disabled="t.blocked"')
    expect(card, '卡面缺口读同一份服务判据').toContain('lifeTrialShortfall(def.id)')
    expect(card, '禁用判据仍走服务,不自己比道果').toContain('canSignLifeTrial(def.id)')
    expect(card, '付不起时就地列差').toContain('道果尚差 {{ t.short }}')
    expect(card, '不许退回笼统道果不足').not.toContain("ui.toast('道果不足'")
  })

  it('一世只能签一份,签下不可解除', () => {
    const player = usePlayerStore()
    player.addDaoFruit(200)
    expect(signLifeTrial('tr_gu')).toBe(true)
    const after = player.reincarnation.daoFruit
    expect(signLifeTrial('tr_ji')).toBe(false)
    expect(player.reincarnation.daoFruit).toBe(after)
    expect(SERVICE_CODE).not.toMatch(/refund|退款|cancelTrial/i)
    console.log('\n无退款入口 —— 可退的消费等于假消费')
  })
})

describe('逆旅契 · 判据二:产物不进 StatMods', () => {
  it('契约只施加战斗规则,不发放任何属性', () => {
    for (const t of LIFE_TRIALS) {
      for (const [k, v] of Object.entries(t.rules.playerExtraMods ?? {})) {
        expect(v).toBeLessThanOrEqual(0)
        expect(reachesEfficiency(k as AnyStatKey)).toBe(true)
      }
    }
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
    // 回合上限界须与战斗真实默认(MAX_COMBAT_ROUNDS=50)一致:≤50 合法,51+ 才是减难
    expect(adverseViolations({ maxRounds: 45 })).toHaveLength(0)
    expect(adverseViolations({ maxRounds: 51 })).not.toHaveLength(0)
    console.log(`\n伪装示例被拒:${adverseViolations({ playerExtraMods: { attackPct: 0.2 } })[0]}`)
  })

  /**
   * 第二道闸的**行为**判据:往数据里塞一份非法契约,真的签不下去。
   *
   * 上面那条只查源码里出现过 `isPurelyAdverse` 这个名字 —— 把三处守卫都改成
   * `if (false) return` 而留着函数名,它照样绿。变异扫描正是这么点名这三处的。
   * 这里改成往 `LIFE_TRIALS` 里 push 一份减难契约(数据层校验是第一道闸,
   * 第一道闸失守时才轮到服务层),再实打实地调 canSign / shortfall / sign。
   *
   * 故障注入:把 lifeTrialService 任一处 `if (!isPurelyAdverse(...)) return` 删掉,本条红。
   */
  it('数据层失守时,服务层第二道闸仍然拦住减难契约', () => {
    const EVIL = {
      id: 'tr_evil_probe',
      name: '伪契',
      seal: '伪',
      desc: '玩家攻击力翻倍',
      cost: 10,
      ruleText: '玩家攻击 +100%',
      // 减难:直接给玩家加攻击,是 isPurelyAdverse 要拒的形状
      rules: { playerExtraMods: { attackPct: 1 } }
    } as (typeof LIFE_TRIALS)[number]
    LIFE_TRIALS.push(EVIL)
    try {
      const player = usePlayerStore()
      player.addDaoFruit(500)
      expect(isPurelyAdverse(EVIL.rules), '探针契约本身该被校验器判为非法').toBe(false)
      expect(canSignLifeTrial(EVIL.id), '非法契约不该被判成可签').toBe(false)
      expect(lifeTrialShortfall(EVIL.id), '非法契约不该给出差额提示').toBeNull()
      expect(signLifeTrial(EVIL.id), '非法契约不该签得下去').toBe(false)
      expect(activeLifeTrial(), '签失败后本世不该有契约').toBeNull()
    } finally {
      const i = LIFE_TRIALS.indexOf(EVIL)
      if (i >= 0) LIFE_TRIALS.splice(i, 1)
    }
  })

  it('非法契约即使被写进数据也签不下去', () => {
    const player = usePlayerStore()
    player.addDaoFruit(500)
    // canSign/sign 都要过 isPurelyAdverse:数据层之后的第二道闸
    expect(SERVICE_CODE).toMatch(/isPurelyAdverse/)
    const occurrences = SERVICE_CODE.match(/isPurelyAdverse/g)!.length
    expect(occurrences).toBeGreaterThanOrEqual(2)
    console.log(`\nisPurelyAdverse 在服务层被调用 ${occurrences} 次(canSign 与 sign 各一道)`)
  })
})

describe('逆旅契 · 判据三:不经第二三跳回到 StatMods', () => {
  it('服务层不发放任何资源', () => {
    expect(SERVICE_CODE).not.toMatch(/spiritStone|addHerb|addOre|wudao|pills|useResourcesStore/)
    console.log('\n无资源发放 —— 堵住「道果 → 灵石 → 强化 → 战力」这条三跳路径')
  })

  it('服务层不发放宿慧 —— 这是最隐蔽的一条路径', () => {
    // 宿慧 → aptitudeFloorNow → growthMult → linggenMult → cultivationSpeed
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
    console.log('\n回报 = LifeRecord.trialId,纯记录')
  })
})

describe('逆旅契 · 判据四:不形成自供能循环', () => {
  it('服务层不产生道果 —— 道果不得生道果', () => {
    expect(SERVICE_CODE).not.toMatch(/addDaoFruit/)
    console.log('\n无 addDaoFruit —— 堵住「道果 → 契约 → 更多道果 → 再买契约」')
  })

  it('契约也不提高道果产出速率', () => {
    // daoFruitGain 只看终点境界
    expect(SERVICE_CODE).not.toMatch(/daoFruitGain|DAO_FRUIT_/)
    console.log('\n不碰 daoFruitGain —— 契约无法让同一世凝出更多道果')
  })

  it('反而是净支出:签得越多,余额越少', () => {
    const player = usePlayerStore()
    player.addDaoFruit(100)
    const before = player.reincarnation.daoFruit
    signLifeTrial('tr_ji')
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
    const legacy = { count: 3, daoFruit: 50, talents: [], insight: 0, lives: [], vow: null }
    player.$patch({ reincarnation: legacy as never })
    player.sanitize()
    expect(player.reincarnation.trial).toBeNull()
    expect(lifeTrialRules()).toBeUndefined()
    console.log('\n老存档降级正常:trial = null,不影响任何既有行为')
  })

  it('坏档带未知契 id 或缺字段的 trial 会被 sanitize 清成未签约,不锁死本世', () => {
    const player = usePlayerStore()
    player.addDaoFruit(200)
    // 坏档:未知契 id 不清理,canSign 会因「已立契」永远置灰
    player.$patch({
      reincarnation: {
        count: 3,
        daoFruit: 200,
        talents: [],
        insight: 0,
        lives: [],
        vow: null,
        trial: { trialId: 'tr_not_real', at: 1, paid: 30 }
      } as never
    })
    player.sanitize()
    expect(player.reincarnation.trial).toBeNull()
    expect(canSignLifeTrial('tr_gu')).toBe(true)

    // 坏档:契缺 paid 字段
    player.$patch({
      reincarnation: {
        count: 3,
        daoFruit: 200,
        talents: [],
        insight: 0,
        lives: [],
        vow: null,
        trial: { trialId: 'tr_gu', at: 1 }
      } as never
    })
    player.sanitize()
    expect(player.reincarnation.trial).toBeNull()
  })

  it('sanitize 不清掉真实已签的合法契', () => {
    const player = usePlayerStore()
    player.addDaoFruit(200)
    signLifeTrial('tr_gu')
    player.sanitize()
    expect(player.reincarnation.trial?.trialId).toBe('tr_gu')
    expect(activeLifeTrial()?.id).toBe('tr_gu')
  })
})
