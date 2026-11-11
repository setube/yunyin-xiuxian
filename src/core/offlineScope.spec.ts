/* eslint-disable no-console -- 变更键清单是给人看的 */
/**
 * 离线只动该动的:在途的秘境、远征、道侣关系、器魂、称号原样保留。
 *
 * 判据写闭集:玩家分片只许 {exp, age, bond} 与战后语义几栏(与在线 runBattle 同源)改变,
 * 终局分片一个键都不许动;同时要求该动的真动了。
 *
 * 故障注入:在 settleOffline 里加一行动 player.titleId 或 endgame.daoSource,本文件红。
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
import { useUiStore } from '@/stores/ui'
import { OFFLINE_MODAL_MIN_SECONDS } from '@/data/constants'
import { gnZero, sub, toNum } from '@/utils/gnum'

const HOUR = 3600 * 1000
const GAP_HOURS = 60

/** 在途档:秘境、远征、道侣、器魂、历练、长 buff */
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

  ;(player as unknown as Record<string, unknown>).secretRealm = {
    realmId: 'sr_a',
    layer: 2,
    carriedHpPct: 0.6,
    losses: 1,
    rules: ['r']
  }
  // bond 须给完整状态:缺字段时 sanitize 补默认值本身就让 bond 变化
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
  cultivation.addBuff('bless_daoyun', Date.now() - 10 * HOUR) // 已过期
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

  /** 会话 stoneGain/expGain 是战斗页「本次所得」的数据源 */
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
    // 会话只记战斗那份,离线总结另含际遇与闭关修炼:故为包含关系而非等号
    expect(stoneGained, '会话灵石账不该超过离线总账').toBeLessThanOrEqual(toNum(summary!.stone))
    expect(expGained, '会话修为账不该超过离线总账').toBeLessThan(toNum(summary!.exp))
    expect(stoneGained, '战斗产出应是离线灵石的大头').toBeGreaterThan(toNum(summary!.stone) * 0.5)
  })

  it('玩家分片只许动 {exp, age, bond};终局分片一个键都不许动', () => {
    setupInFlightSave()
    const player = usePlayerStore()
    const endgame = useEndgameStore()
    // JSON 往返取快照:$state 含 Vue 响应式包装,structuredClone 会拒收
    const snap = (s: object): Record<string, unknown> => JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    const beforePlayer = snap(player.$state)
    const beforeEndgame = snap(endgame.$state)

    const summary = settleOffline(Date.now())
    expect(summary, '这一档应当结算出离线收益').not.toBeNull()

    const playerChanged = changedKeys(beforePlayer, snap(player.$state))
    const endgameChanged = changedKeys(beforeEndgame, snap(endgame.$state))
    console.log(`\n60h 离线:player 变了 ${playerChanged.join('、') || '(无)'} · endgame 变了 ${endgameChanged.join('、') || '(无)'}`)

    // 必须动:修为、寿元、道侣机会点
    const required = ['age', 'bond', 'exp']
    /**
     * 可选:战后语义,与在线 runBattle 同一本账(区域统计/兴衰/镇压资格/宿敌/连胜)。
     * suppressFrac:离线结算余下的物产零头留在累积器,与在线逐 tick 同账。
     */
    const optional = [
      'regionStats',
      'regionWins',
      'regionWinsLife',
      'suppressQualified',
      'suppressedRegions',
      'suppressedSince',
      'suppressFrac',
      'nemeses',
      'winStreak'
    ]
    const allowed = new Set([...required, ...optional])
    expect(
      playerChanged.filter(k => !allowed.has(k)),
      `离线多动了玩家状态:${playerChanged.join('、')}`
    ).toEqual([])
    for (const key of required) {
      expect(playerChanged, `离线该动的 ${key} 没动`).toContain(key)
    }
    expect(endgameChanged, `离线动了终局状态(远征/器魂/道源):${endgameChanged.join('、')}`).toEqual([])

    // 逐条列出,失败报文点名哪一样变了
    expect((player as unknown as Record<string, unknown>).secretRealm, '在途秘境被动了').toEqual(
      (beforePlayer as { secretRealm?: unknown }).secretRealm
    )
    expect(player.titleId, '佩戴称号被动了').toEqual(beforePlayer.titleId)
    expect(endgame.worldRun, '在途远征被动了').toEqual((beforeEndgame as { worldRun?: unknown }).worldRun)
    expect(endgame.souls, '器魂被动了').toEqual((beforeEndgame as { souls?: unknown }).souls)
    expect(endgame.equippedSouls, '装配的器魂被动了').toEqual((beforeEndgame as { equippedSouls?: unknown }).equippedSouls)

    // 道侣:离线只攒机会点,不推进信任/契合/缘分
    const bondBefore = beforePlayer.bond as Record<string, unknown>
    const bondAfter = player.bond as unknown as Record<string, unknown>
    expect(bondAfter.daoluId, '道侣换了人').toBe(bondBefore.daoluId)
    expect(bondAfter.metAt, '初遇时刻被改了').toBe(bondBefore.metAt)
    expect(bondAfter.fate, '缘分被离线推进了 —— 关系不该自己长').toBe(bondBefore.fate)
    expect(bondAfter.trust, '信任被离线推进了').toBe(bondBefore.trust)
    expect(bondAfter.accord, '契合被离线推进了').toBe(bondBefore.accord)
    expect(Number(bondAfter.opportunities), '机会点该随历练攒起来(不是只「没变少」)').toBeGreaterThan(
      Number(bondBefore.opportunities)
    )

    // 该动的须真动,否则上面的「没变」只说明代码没跑
    const adventure = useAdventureStore()
    const resources = useResourcesStore()
    expect(adventure.session!.wins, '历练没推进,离线那段等于没跑').toBeGreaterThan(0)
    expect(summary!.exp.m, '修为没涨').toBeGreaterThan(0)
    expect(summary!.ageYears, '寿元没流逝').toBeGreaterThan(50)
    expect(summary!.qi, '灵气没回充').toBeGreaterThan(0)
    expect(resources.herb + resources.ore + resources.wudao, '产线一条没动').toBeGreaterThan(0)

    // 有在途内容时归来卷轴须交代一句
    const notes = summary!.notes.join('\n')
    expect(notes, '在途秘境被冻住了,却没跟玩家说').toContain('身在秘境')
    expect(notes, '在途远征被冻住了,却没跟玩家说').toContain('远征在途')
  })

  it('没有在途内容时,不该凭空说有人等着', () => {
    const player = usePlayerStore()
    const game = useGameStore()
    game.markStarted()
    game.lastActiveAt = Date.now() - 3 * HOUR
    player.major = 3
    const summary = settleOffline(Date.now())!
    const notes = summary.notes.join('\n')
    expect(notes).not.toContain('身在秘境')
    expect(notes).not.toContain('远征在途')
  })
})

/**
 * 离线窗的弹出门槛(300 秒)。
 *
 * 这条是补的:`OFFLINE_MODAL_MIN_SECONDS` 此前**没有任何判据** ——
 * 实测把它从 300 改成 30,全量 6500 用例照样绿。
 * 而它决定的是「玩家回来时要不要看到那份结算窗」:
 * 门槛被调小,随手切个后台再回来也会弹一整屏收益;调大则真挂机了也看不到。
 */
describe('离线结算 · 弹窗门槛', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** 构造一段离线时长,返回 ui.offlineSummary 是否被填 */
  const settleAfter = (seconds: number): boolean => {
    setActivePinia(createPinia())
    const game = useGameStore()
    const player = usePlayerStore()
    const ui = useUiStore()
    const now = Date.now()
    game.markStarted()
    player.initCharacter('门槛探针', { roots: [] } as never)
    game.lastActiveAt = now - seconds * 1000
    ui.offlineSummary = null
    settleOffline(now)
    return ui.offlineSummary !== null
  }

  it('门槛是 300 秒:到 299 不弹,到 300 弹', () => {
    /*
     * 数字写死不取 `OFFLINE_MODAL_MIN_SECONDS - 1` ——
     * 那样门槛被改成 30,这里跟着变 29,判据一起漂,永远绿(实测踩过)。
     * 300 是产品定的:挂机五分钟以上才值得打断玩家看一屏收益。
     */
    expect(OFFLINE_MODAL_MIN_SECONDS, '门槛被改了 —— 要改请连同这条判据一起决定').toBe(300)
    expect(settleAfter(299), '299 秒不该弹').toBe(false)
    expect(settleAfter(300), '300 秒该弹').toBe(true)
  })
})
