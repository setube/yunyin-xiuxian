/* eslint-disable no-console -- 变更键清单是给人看的 */
/**
 * 离线只动该动的 —— 在途的东西必须原样等着玩家回来
 *
 * settleOffline 是一段「趁玩家不在偷偷推进」的代码,它最容易犯的错不是少算,
 * 而是**多动**:秘境还在境中、远征还在途、道侣关系、器魂、称号这些都属于
 * 「玩家亲手摆在那儿的局面」,缺席几个小时回来发现它们变了,比少拿点收益难受得多。
 *
 * 判据不写「哪些能动」的长清单(那会随内容增长而漏),而是写**闭集**:
 * 玩家分片里只许 {exp, age, bond} 以及「战后语义」那几栏改变
 * (regionStats / regionWins / 镇压资格,与在线 runBattle 同源),
 * 终局分片一个键都不许动。多动一个键,报文直接点名。
 * 同时反过来要求「该动的真动了」,否则这段代码没跑,判据也全绿。
 *
 * 实测(60 小时离线,带在途秘境/远征/道侣/器魂/历练):
 *   player 变了 exp、age;endgame 一个键没变;历练战斗与际遇、灵草玄铁悟道、灵气、寿元照常推进。
 *
 * 故障注入:在 settleOffline 里加一行动 player.titleId 或 endgame.daoSource,本文件立刻红。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { settleOffline } from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'
import { useAdventureStore } from '@/stores/adventure'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { useDongfuStore } from '@/stores/dongfu'
import { gnZero, sub, toNum } from '@/utils/gnum'

const HOUR = 3600 * 1000
const GAP_HOURS = 60

/** 攒一份「什么都在途」的档:秘境、远征、道侣、器魂、历练、长 buff */
function setupInFlightSave(): void {
  const game = useGameStore()
  const player = usePlayerStore()
  const endgame = useEndgameStore()
  const adventure = useAdventureStore()
  const resources = useResourcesStore()
  const cultivation = useCultivationStore()
  const dongfu = useDongfuStore()

  game.markStarted()
  game.lastActiveAt = Date.now() - GAP_HOURS * HOUR
  player.major = 10
  player.titleId = 'ti_yuanying'
  resources.setQi(0, player.qiCapValue)
  player.suppressedRegions = ['qingyun']
  dongfu.setLevel('mansion', 4)
  dongfu.setLevel('field', 10)

  // 在途:秘境一层、远征一程
  ;(player as unknown as Record<string, unknown>).secretRealm = {
    realmId: 'sr_a',
    layer: 2,
    carriedHpPct: 0.6,
    losses: 1,
    rules: ['r']
  }
  // 道侣给一份**完整**状态:缺字段的话,sanitize 补默认值本身就会让 bond「变化」,
  // 那样比出来的就不是「离线动了它」,而是「我没写全」
  player.setBond({
    daoluId: 'dl_qingli',
    stage: 'companion',
    fate: 70,
    trust: 60,
    accord: 50,
    shared: 4,
    metAt: Date.now() - 100 * HOUR,
    fallen: false,
    departed: false,
    doneEvents: [],
    opportunities: 1,
    nextEventAt: 0,
    pendingEventId: null,
    intentPending: false,
    intent: null
  } as unknown as Parameters<typeof player.setBond>[0])
  endgame.worldRun = {
    worldId: 'w_a',
    pactId: null,
    layer: 1,
    rows: [{ foeName: 'x', win: true, rounds: 3, hpLeftPct: 0.5 }],
    bonus: 12,
    carriedHpPct: 0.5,
    winStacks: 2,
    startHpPct: 1
  } as unknown as typeof endgame.worldRun
  endgame.souls = [
    { uid: 's1', templateId: 'w_zhuqing', mods: {}, quality: 'heaven', sourceName: '青竹剑' }
  ] as unknown as typeof endgame.souls
  endgame.equippedSouls = ['s1']
  adventure.session = {
    regionId: 'qingyun',
    mode: 'normal',
    startedAt: Date.now() - GAP_HOURS * HOUR,
    endsAt: Date.now() + 5 * HOUR,
    nextBattleAt: 0,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: { m: 0, e: 0 },
    expGain: { m: 0, e: 0 },
    itemGain: 0
  } as unknown as typeof adventure.session
  cultivation.addBuff('bless_daoyun', Date.now() - 10 * HOUR) // 早就该过期
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys]
    .filter(k => typeof (before[k] ?? after[k]) !== 'function')
    .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .sort()
}

describe('离线的作用域 · 在途的东西一律不动', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /**
   * 挂机所得的归宿:折进这趟历练的总账。
   *
   * 会话里的 stoneGain/expGain 是战斗页「本次所得」的数据源 —— 离线推进了这趟历练,
   * 却只更新 wins/events 而不记收益的话,玩家挂了一夜回来接着打,面板上的数会比实际少一截。
   */
  it('挂机期间这趟历练的所得折进会话总账,与离线报的数同源', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    const now = Date.now()
    game.markStarted()
    player.initCharacter('挂机记账', { roots: [] } as never)
    game.lastActiveAt = now - 4 * HOUR
    adventure.session = {
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: now - 4 * HOUR,
      endsAt: now + 6 * HOUR,
      nextBattleAt: 0,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: gnZero(),
      expGain: gnZero(),
      itemGain: 0
    }
    const stoneBefore = { ...adventure.session.stoneGain }
    const expBefore = { ...adventure.session.expGain }

    const summary = settleOffline(now)
    expect(summary, '这档应当结算出离线收益').not.toBeNull()

    const s = adventure.session!
    const stoneGained = toNum(sub(s.stoneGain, stoneBefore))
    const expGained = toNum(sub(s.expGain, expBefore))
    expect(s.wins, '历练该推进').toBeGreaterThan(0)
    expect(stoneGained, '与会话面板同源的这份账必须记上').toBeGreaterThan(0)
    expect(expGained).toBeGreaterThan(0)
    /**
     * 会话记的是**战斗**那一份,离线总结还含自动结算的际遇与闭关修炼 ——
     * 故这里是包含关系而不是等号:份量要占大头,但不会被别的来源算进来。
     * 回归红线是上面的 > 0:旧实现压根不往会话里写收益(挂一夜回来面板还停在 0)。
     */
    expect(stoneGained, '会话灵石账不该超过离线总账').toBeLessThanOrEqual(toNum(summary!.stone))
    expect(expGained, '会话修为账不该超过离线总账').toBeLessThan(toNum(summary!.exp))
    expect(stoneGained, '战斗产出应是离线灵石的大头').toBeGreaterThan(toNum(summary!.stone) * 0.5)
  })

  it('玩家分片只许动 {exp, age, bond};终局分片一个键都不许动', () => {
    setupInFlightSave()
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    // 用 JSON 往返取快照:$state 里混着 Vue 的响应式包装,structuredClone 会拒收
    const snap = (s: object): Record<string, unknown> => JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    const beforePlayer = snap(player.$state)
    const beforeEndgame = snap(endgame.$state)

    const summary = settleOffline(Date.now())
    expect(summary, '这一档应当结算出离线收益').not.toBeNull()

    const playerChanged = changedKeys(beforePlayer, snap(player.$state))
    const endgameChanged = changedKeys(beforeEndgame, snap(endgame.$state))
    console.log(`\n60h 离线:player 变了 ${playerChanged.join('、') || '(无)'} · endgame 变了 ${endgameChanged.join('、') || '(无)'}`)

    // 必须动:修为、寿元、道侣的**机会点**(历练照跑,机会照攒)
    const required = ['age', 'bond', 'exp']
    // 可选:战后语义,在线 runBattle 也写同一本账(区域统计/兴衰/镇压)
    const optional = ['regionStats', 'regionWins', 'suppressQualified', 'suppressedRegions', 'suppressedSince']
    const allowed = new Set([...required, ...optional])
    expect(
      playerChanged.filter(k => !allowed.has(k)),
      `离线多动了玩家状态:${playerChanged.join('、')}`
    ).toEqual([])
    for (const key of required) {
      expect(playerChanged, `离线该动的 ${key} 没动`).toContain(key)
    }
    expect(endgameChanged, `离线动了终局状态(远征/器魂/道源):${endgameChanged.join('、')}`).toEqual([])

    // 在途的局面逐项原样(逐条列出,失败时报文能说清是哪一样变了)
    expect((player as unknown as Record<string, unknown>).secretRealm, '在途秘境被动了').toEqual(
      (beforePlayer as { secretRealm?: unknown }).secretRealm
    )
    expect(player.titleId, '佩戴称号被动了').toEqual(beforePlayer.titleId)
    expect(endgame.worldRun, '在途远征被动了').toEqual((beforeEndgame as { worldRun?: unknown }).worldRun)
    expect(endgame.souls, '器魂被动了').toEqual((beforeEndgame as { souls?: unknown }).souls)
    expect(endgame.equippedSouls, '装配的器魂被动了').toEqual((beforeEndgame as { equippedSouls?: unknown }).equippedSouls)

    /**
     * 道侣:离线只**攒机会点**,不替玩家推进关系。
     *
     * 历练照跑,机会照攒 —— 但信任/契合/缘分这些是玩家自己选出来的,
     * 不该在缺席期间自己长上去(否则回来发现关系变了,却不知道自己做过什么)。
     */
    const bondBefore = beforePlayer.bond as Record<string, unknown>
    const bondAfter = player.bond as unknown as Record<string, unknown>
    expect(bondAfter.daoluId, '道侣换了人').toBe(bondBefore.daoluId)
    expect(bondAfter.metAt, '初遇时刻被改了').toBe(bondBefore.metAt)
    expect(bondAfter.fate, '缘分被离线推进了 —— 关系不该自己长').toBe(bondBefore.fate)
    expect(bondAfter.trust, '信任被离线推进了').toBe(bondBefore.trust)
    expect(bondAfter.accord, '契合被离线推进了').toBe(bondBefore.accord)
    expect(Number(bondAfter.opportunities), '机会点该随历练攒起来').toBeGreaterThanOrEqual(
      Number(bondBefore.opportunities)
    )

    // 反过来:该动的必须真动,否则上面这些「没变」只说明这段代码没跑
    const adventure = useAdventureStore()
    const resources = useResourcesStore()
    expect(adventure.session!.wins, '历练没推进,离线那段等于没跑').toBeGreaterThan(0)
    expect(summary!.exp.m, '修为没涨').toBeGreaterThan(0)
    expect(summary!.ageYears, '寿元没流逝').toBeGreaterThan(50)
    expect(summary!.qi, '灵气没回充').toBeGreaterThan(0)
    expect(resources.herb + resources.ore + resources.wudao, '产线一条没动').toBeGreaterThan(0)

    /**
     * 冻结要**说出来**,不能只做不说。
     *
     * 玩家回来只看到一屏资源,很容易以为「我不在的时候那趟远征是不是黄了」。
     * 故凡有在途内容,归来卷轴就得有一句交代 —— 这也让「冻结」从实现细节
     * 变成玩家看得见的承诺。
     */
    const notes = summary!.notes.join('\n')
    expect(notes, '在途秘境被冻住了,却没跟玩家说').toContain('秘境之行原样留着')
    expect(notes, '在途远征被冻住了,却没跟玩家说').toContain('那趟远征仍在途')
  })

  it('没有在途内容时,不该凭空说有人等着', () => {
    const player = usePlayerStore()
    const game = useGameStore()
    game.markStarted()
    game.lastActiveAt = Date.now() - 3 * HOUR
    player.major = 3
    const summary = settleOffline(Date.now())!
    const notes = summary.notes.join('\n')
    expect(notes).not.toContain('秘境之行原样留着')
    expect(notes).not.toContain('那趟远征仍在途')
  })
})
