/* eslint-disable no-console -- 往返报告是给人看的 */
/**
 * 存档往返:导出 → 清档 → 导入。
 *   一 PERSISTED_STORES 决定导出/导入/清档范围,须与 store 源码里的 persistConfig('x') 双向一致
 *      (漏登记:导出少一块、清档不净,且无提示)
 *   二 往返一致:每个分片对得上,重建 store 后关键状态仍在
 * 故障注入:删掉 PERSISTED_STORES 任一项(清单那条红),或让 applyImportPayload 跳过一个分片(往返那条红)。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import {
  PERSISTED_STORES,
  SAVE_VERSION,
  STORE_NAMES,
  clearAllSave,
  dropPendingWrites,
  flushSaveWrites,
  storageKey,
  validateImportPayload
} from '@/utils/storage'
import { readSaveText } from '@/utils/crypto'
import { exportSaveText, importSaveText, inspectImportText } from './save'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useCultivationStore } from '@/stores/cultivation'
import { useResourcesStore } from '@/stores/resources'
import { useSettingsStore } from '@/stores/settings'
import { useGameStore } from '@/stores/game'
import { useAdventureStore } from '@/stores/adventure'
import { makeEnemySnap, resolveCombat } from './combat'
import { RandomService, mulberry32 } from '@/utils/random'
import { gn } from '@/utils/gnum'
import { MAX_MAJOR } from '@/data/realms'
import { analyzeBattle } from './battleAnalysis'
import type { EnemyDef } from '@/types'

const STORES_DIR = resolve(__dirname, '../stores')

/** store 源码里调了 persistConfig 的 id;清单的真来源 */
function persistedIdsFromSource(): string[] {
  const ids = new Set<string>()
  for (const file of readdirSync(STORES_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue
    const src = readFileSync(resolve(STORES_DIR, file), 'utf8')
    for (const m of src.matchAll(/persistConfig\(\s*'([a-zA-Z]+)'\s*\)/g)) ids.add(m[1]!)
  }
  return [...ids].sort()
}

function installStorage(): Map<string, string> {
  const disk = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
    clear: () => disk.clear(),
    key: () => null,
    length: 0
  })
  return disk
}

/** 真 pinia + 真持久化插件 */
function bootStores(): void {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  // pinia 须先装进 app,插件才从待安装队列生效
  createApp({ render: () => null }).use(pinia)
  setActivePinia(pinia)
}

describe('存档往返 · 分片清单从源码倒推', () => {
  it('凡持久化的 store 都在导出清单里,清单里也不许有已不存在的 store', () => {
    const fromSource = persistedIdsFromSource()
    const listed: string[] = [...PERSISTED_STORES].sort()
    expect(fromSource.length, '一个 persistConfig 都没扫到,断言形同虚设').toBeGreaterThan(5)
    expect(
      fromSource.filter(id => !listed.includes(id)),
      '这些 store 在持久化,却没进 PERSISTED_STORES —— 导出会漏、清档会剩'
    ).toEqual([])
    expect(
      listed.filter(id => !fromSource.includes(id)),
      'PERSISTED_STORES 里列着并不持久化的 id —— 清单已经与代码脱节'
    ).toEqual([])
  })

  it('清档真的清干净:清单里的每个键都从 localStorage 消失', () => {
    installStorage()
    for (const id of PERSISTED_STORES) localStorage.setItem(storageKey(id), 'x')
    clearAllSave()
    const leftover = PERSISTED_STORES.filter(id => localStorage.getItem(storageKey(id)) !== null)
    expect(leftover, `清档后仍有残留:${leftover.join('、')}`).toEqual([])
  })

  /**
   * STORE_NAMES 须与 PERSISTED_STORES 同步:损坏提示走 `STORE_NAMES[id] ?? id`,缺名即把原始分片键给玩家。
   * 故障注入:从 STORE_NAMES 删掉任一键 → 第一条红;加一个清单外的键 → 第二条红。
   */
  it('每个持久化分片都有中文显示名,清单外不得有多余名字', () => {
    const missing = PERSISTED_STORES.filter(id => !(STORE_NAMES[id] ?? '').trim())
    expect(missing, `这些分片没有中文名,损坏提示会把原始 id 甩给玩家:${missing.join('、')}`).toEqual([])
    const known = new Set<string>(PERSISTED_STORES)
    const extra = Object.keys(STORE_NAMES).filter(id => !known.has(id))
    expect(extra, `STORE_NAMES 里列着并不持久化的分片,清单已经与代码脱节:${extra.join('、')}`).toEqual([])
  })
})

describe('存档往返 · 导出再导入一模一样', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
    dropPendingWrites()
    clearAllSave()
    bootStores()
  })

  it('导出 → 清档 → 导入:每个分片都回来,关键状态还在', async () => {
    const player = usePlayerStore()
    const inventory = useInventoryStore()
    const lore = useLoreStore()
    const cultivation = useCultivationStore()
    const resources = useResourcesStore()
    const settings = useSettingsStore()
    const game = useGameStore()
    // 导入校验要求 player/game 俱在
    game.markStarted()
    player.major = 7
    player.reincarnation.daoFruit = 9
    inventory.addArtifact('af_youming')
    lore.addRecipeMastery('p_huichun', 3)
    cultivation.learn('m_taixuan')
    resources.addSmall('herb', 42)
    settings.sfxOn = !settings.sfxOn
    // 持久化订阅走 Vue 调度器(微任务),须等一拍才进待写队列
    await nextTick()
    flushSaveWrites()

    const text = exportSaveText()
    const payload = JSON.parse(readSaveText(text)) as { version: number; data: Record<string, unknown> }
    expect(payload.version, '导出应写明存档版本').toBe(SAVE_VERSION)
    const exportedIds = Object.keys(payload.data).sort()
    console.log(`\n导出分片 ${exportedIds.length} 片:${exportedIds.join('、')}`)
    expect(exportedIds.length, '导出内容为空,这条用例没测到东西').toBeGreaterThanOrEqual(5)

    clearAllSave()
    expect(
      PERSISTED_STORES.filter(id => localStorage.getItem(storageKey(id)) !== null),
      '清档没清干净,后面的导入就分不清是导入的还是残留的'
    ).toEqual([])

    const err = importSaveText(text)
    expect(err, `导入失败:${err}`).toBeNull()

    for (const id of exportedIds) {
      const raw = localStorage.getItem(storageKey(id))
      expect(raw, `导入后 ${id} 分片不见了`).not.toBeNull()
      expect(raw!, `${id} 分片内容与导出的不一致`).not.toContain('云隐')
      const stored = JSON.parse(readSaveText(raw!)) as Record<string, unknown>
      if (id === 'game') {
        // 唯一例外:导入把 lastActiveAt 重戳为现在(save.ts migrate),免得旧备份被算成缺勤数月
        const expGame = payload.data.game as Record<string, unknown>
        expect(stored.lastActiveAt, '导入后游戏时钟应为现在附近').toBeGreaterThan(Date.now() - 60_000)
        for (const k of Object.keys(stored)) {
          if (k === 'lastActiveAt') continue
          expect(stored[k], `game.${k} 应与导出一致`).toEqual(expGame[k])
        }
        for (const k of Object.keys(expGame)) {
          if (k !== 'lastActiveAt') expect(k in stored, `导入后 game 少了一键 ${k}`).toBe(true)
        }
      } else {
        expect(stored, `${id} 分片内容与导出的不一致`).toEqual(payload.data[id])
      }
    }

    // 新 pinia 从存档水合
    bootStores()
    const player2 = usePlayerStore()
    const inventory2 = useInventoryStore()
    const cultivation2 = useCultivationStore()
    const game2 = useGameStore()
    expect(game2.started, '导入后「已开局」这个事实没回来').toBe(true)
    expect(player2.major, '导入后境界没回来').toBe(7)
    expect(player2.reincarnation.daoFruit, '导入后道果没回来').toBe(9)
    expect(inventory2.artifacts.map(a => a.defId), '导入后法宝没回来').toEqual(['af_youming'])
    expect(Object.keys(cultivation2.learned), '导入后功法没回来').toContain('m_taixuan')
  })

  /** 战后分析读 lastBattle.result 的遥测、先手判定与敌人加成来源;往返丢字段不报错 */
  it('战报读数原样回来(遥测 / 先手 / 敌之加成 / 拾获)', async () => {
    const player = usePlayerStore()
    useGameStore().markStarted()
    player.major = 3
    const adventure = useAdventureStore()
    const def: EnemyDef = {
      id: 'saved_foe',
      name: '石傀',
      family: 'construct',
      tier: 9,
      hpMult: 1,
      atkMult: 1,
      defMult: 1,
      speed: 1,
      skills: []
    }
    const foe = makeEnemySnap(def, 9, 2.1)
    const result = resolveCombat(
      {
        name: '你',
        icon: 'x',
        isPlayer: true,
        attack: gn(1e7),
        defense: gn(1e6),
        maxHp: gn(1e8),
        speed: 1.1,
        mods: {},
        skills: [{ name: '一记攻势', mult: 1, rate: 1 }]
      },
      foe,
      new RandomService(mulberry32(11))
    )
    adventure.recordBattle({
      enemyName: foe.name,
      enemyIcon: 'x',
      enemyId: def.id,
      isBoss: false,
      result,
      at: Date.now(),
      loot: ['灵石 ×12']
    })
    await nextTick()
    flushSaveWrites()

    const text = exportSaveText()
    dropPendingWrites()
    clearAllSave()
    const err = importSaveText(text)
    expect(err, `导入失败:${err}`).toBeNull()
    bootStores()

    const back = useAdventureStore().lastBattle
    expect(back, '导入后战报整个不见了').not.toBeNull()
    expect(back!.result.stats, '遥测没了,战斗分析就成了空壳').toBeDefined()
    expect(back!.result.firstMove, '先手读数没了,战后分析就说不出差多少').toBeDefined()
    expect(back!.result.foeOrigin, '敌之加成没了,归因又断了').toBeDefined()
    expect(back!.result.foeOrigin!.ratio, '加成倍率在往返里被改动').toBeCloseTo(foe.origin!.ratio, 9)
    expect(back!.loot).toEqual(['灵石 ×12'])
    const analysis = analyzeBattle(back!.result, null)
    expect(analysis, '导入后分析面板说不出话了').not.toBeNull()
    expect(analysis!.dataRows.length).toBeGreaterThan(5)
  })

  it('导入的坏文本不许污染现有存档 —— 失败要原样留着', () => {
    const player = usePlayerStore()
    player.major = 5
    flushSaveWrites()
    const before = localStorage.getItem(storageKey('player'))

    const err = importSaveText('这不是存档')
    expect(err, '坏文本应报错').not.toBeNull()
    expect(localStorage.getItem(storageKey('player')), '导入失败却动了现有存档').toBe(before)
  })

  it('检视导入能看到备份的身份与版本(确认前摊开,不改存档)', async () => {
    const player = usePlayerStore()
    useGameStore().markStarted()
    player.name = '青崖子'
    player.major = 7
    player.sub = 3
    await nextTick()
    flushSaveWrites()
    const text = exportSaveText()

    const info = inspectImportText(text)
    expect(info, '自己导的档应当检视得出身份').not.toBeNull()
    expect(info!.name, '应读出存档里的玩家名').toBe('青崖子')
    expect(info!.version, '检视版本应与当前一致').toBe(SAVE_VERSION)
    expect(info!.tooNew, '同版本的档不该误报高于当前').toBe(false)
    expect(info!.exportedAt, '应如实报导出时间').toBeGreaterThan(0)
    expect(info!.realmLabel).not.toBe('')

    const tooNew = inspectImportText(
      `{"game":"yunyin-xiuxian","version":${SAVE_VERSION + 1},"exportedAt":1,"data":{"player":{"name":"未来客","major":1},"game":{}}}`
    )
    expect(tooNew?.tooNew, '更高版本应在确认前标出').toBe(true)

    // 无名/缺字段时不抛错
    expect(
      inspectImportText(`{"game":"yunyin-xiuxian","version":1,"exportedAt":2,"data":{"player":{},"game":{}}}`)?.name
    ).toBe('无名散修')
    expect(inspectImportText('完全不是存档')).toBeNull()
  })

  /**
   * 检视不能因为一个展示字段就整份放弃。
   *
   * 原先 `inspectImportText` 要求 `version` 与 `exportedAt` **都**是 number,
   * 而 `validateImportPayload` 从不要求 `exportedAt` —— 于是「合法但没写导出时刻」的档
   * 检视返回 null,确认框摊不开身份、摊不开版本,`tooNew` 的置灰也一并失效:
   * 未来版本的存档要等玩家点下「确认导入」才被告知「存档版本过高」。
   *
   * 故障注入:把 exportedAt 的判定改回「必须是 number」,第一条红。
   */
  it('缺导出时刻仍是合法档:身份与版本照摊,置灰照生效', () => {
    const noStamp = `{"game":"yunyin-xiuxian","version":${SAVE_VERSION},"data":{"player":{"name":"青崖子","major":5},"game":{}}}`
    expect(validateImportPayload(JSON.parse(noStamp)), '前置:这类档本就该放行').toBeNull()
    const info = inspectImportText(noStamp)
    expect(info, '缺 exportedAt 不该让整份检视作废').not.toBeNull()
    expect(info!.name, '身份仍要摊得开').toBe('青崖子')
    expect(info!.version).toBe(SAVE_VERSION)
    expect(info!.exportedAt, '没有导出时刻时给 null,不编一个数').toBeNull()

    // 未来版本 + 缺导出时刻:置灰的那条判据必须仍然成立
    const futureNoStamp = `{"game":"yunyin-xiuxian","version":${SAVE_VERSION + 1},"data":{"player":{"name":"未来客","major":1},"game":{}}}`
    const future = inspectImportText(futureNoStamp)
    expect(future, '未来版本更要摊得开 —— 否则拒因拖到点确认才出现').not.toBeNull()
    expect(future!.tooNew, '缺 exportedAt 不该把 tooNew 的置灰挡掉').toBe(true)
  })

  /** 导出时刻是别人文件里自带的数,可能被写成 1e999 / 字符串 / 负数 —— 一律按「没有」处理 */
  it('导出时刻的坏值一律归 null,不印 NaN', () => {
    const base = (exportedAt: string): string =>
      `{"game":"yunyin-xiuxian","version":2,"exportedAt":${exportedAt},"data":{"player":{"name":"青崖子","major":5},"game":{}}}`
    for (const bad of ['"2026-11-01"', '1e999', '-1', '0', 'null']) {
      expect(inspectImportText(base(bad))?.exportedAt, `exportedAt=${bad} 应归 null`).toBeNull()
    }
    expect(inspectImportText(base('1700000000000'))?.exportedAt, '正常时间戳照常透传').toBe(1700000000000)
  })


/**
 * 极端数值的往返。
 *
 * 现有往返用例用的是普通量级(major=7、herb=42)。真正会把存档写坏的是
 * 混沌道祖那一档的超大 GNum,以及坏档里可能混进来的非有限值。
 * 这类值若在「序列化 → 反序列化 → shape 守卫」的链条上被悄悄改写,
 * 玩家读档后境界或余额会跳变,而普通用例看不出来。
 */
describe('存档往返 · 极端数值', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
    dropPendingWrites()
    clearAllSave()
    bootStores()
  })

  it('超大 GNum(混沌道祖档)原样回来,指数不丢', async () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const game = useGameStore()
    game.markStarted()
    player.major = MAX_MAJOR
    resources.spiritStone = { m: 9.99, e: 52 }
    await nextTick()
    flushSaveWrites()

    const text = exportSaveText()
    clearAllSave()
    bootStores()
    const err = await importSaveText(text)
    expect(err, '导入不该报错').toBeNull()

    const back = useResourcesStore()
    expect(back.spiritStone.e, '指数丢了,余额量级会整体错位').toBe(52)
    expect(back.spiritStone.m).toBeCloseTo(9.99, 6)
  })

  it('刚好跨过溢出线的值不会被静默夹掉', async () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const game = useGameStore()
    game.markStarted()
    // 触碰 player 才会产生 player 分片;导入校验要求 data.player 是对象
    player.major = 3
    // e=308 且 m>1.79 时 toNum 会溢出,但存档本身仍应保住这两个字段
    resources.spiritStone = { m: 1.9, e: 308 }
    await nextTick()
    flushSaveWrites()

    const text = exportSaveText()
    clearAllSave()
    bootStores()
    const err = await importSaveText(text)
    expect(err, '导入不该报错').toBeNull()

    const back = useResourcesStore()
    expect(back.spiritStone.e, 'e=308 不该被当成坏档丢掉').toBe(308)
    expect(back.spiritStone.m).toBeCloseTo(1.9, 6)
  })

  it('零值不会被当成缺字段补默认', async () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const game = useGameStore()
    game.markStarted()
    player.major = 3
    resources.spiritStone = gn(0)
    resources.qi = 0
    await nextTick()
    flushSaveWrites()

    const text = exportSaveText()
    clearAllSave()
    bootStores()
    await importSaveText(text)

    const back = useResourcesStore()
    expect(back.spiritStone.m, '零应保持零').toBe(0)
    expect(back.qi).toBe(0)
  })
})
})
