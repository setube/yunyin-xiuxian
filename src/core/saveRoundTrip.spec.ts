/* eslint-disable no-console -- 往返报告是给人看的 */
/**
 * 存档往返 —— 导出再导入,必须一模一样
 *
 * 玩家换设备、清浏览器数据之前,靠的就是「导出存档 / 导入存档」这条路。
 * 而它此前没有任何端到端验证:各分片各写各的 sanitize,没人核对过
 * **导出 → 清档 → 导入**之后还剩什么。
 *
 * 这里守两件事:
 *
 *   一 分片清单不能是手写清单。PERSISTED_STORES 决定导出/导入/清档的范围,
 *      而它是一张人手维护的数组 —— 新加一个持久化 store 却忘了登记,后果是
 *      「导出悄悄少一块进度、清档清不干净」,没有任何提示。故这里从**源码倒推**:
 *      凡 store 源码里调了 persistConfig('x') 的,就必须在清单里;反之亦然。
 *
 *   二 往返一致:真数据 → 导出 → 清档(确认真清干净)→ 导入 → 每个分片
 *      逐字节对得上,且重建 store 之后关键状态仍在。
 *
 * 故障注入:把 PERSISTED_STORES 里任一项删掉(清单那条红),或让 applyImportPayload
 * 跳过一个分片(往返那条红)。
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
  clearAllSave,
  dropPendingWrites,
  flushSaveWrites,
  storageKey
} from '@/utils/storage'
import { readSaveText } from '@/utils/crypto'
import { exportSaveText, importSaveText } from './save'
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
import { analyzeBattle } from './battleAnalysis'
import type { EnemyDef } from '@/types'

const STORES_DIR = resolve(__dirname, '../stores')

/** store 源码里真正调用了 persistConfig 的那些 id —— 清单的真来源 */
function persistedIdsFromSource(): string[] {
  const ids = new Set<string>()
  for (const file of readdirSync(STORES_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue
    const src = readFileSync(resolve(STORES_DIR, file), 'utf8')
    for (const m of src.matchAll(/persistConfig\(\s*'([a-zA-Z]+)'\s*\)/g)) ids.add(m[1]!)
  }
  return [...ids].sort()
}

/** 一份能进存档的内存 localStorage */
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

/** 真 pinia + 真持久化插件:让 store 与存档之间那条路完整跑起来 */
function bootStores(): void {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  // pinia 得先装进一个 app,插件才会从「待安装」队列真正生效
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
    // 攒一份「看得出内容」的存档:境界/道果/背包/图鉴/功法
    const player = usePlayerStore()
    const inventory = useInventoryStore()
    const lore = useLoreStore()
    const cultivation = useCultivationStore()
    const resources = useResourcesStore()
    const settings = useSettingsStore()
    const game = useGameStore()
    // 真存档必带 game 分片(建号那刻起);导入校验也要求 player/game 俱在
    game.markStarted()
    player.major = 7
    player.reincarnation.daoFruit = 9
    inventory.addArtifact('af_youming')
    lore.addRecipeMastery('p_huichun', 3)
    cultivation.learn('m_taixuan')
    resources.addSmall('herb', 42)
    settings.sfxOn = !settings.sfxOn
    // 持久化插件的订阅走 Vue 调度器(微任务),得等一拍才落进待写队列
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

    // 逐片对账:导入写进去的,就是导出时拿出来的那一份
    for (const id of exportedIds) {
      const raw = localStorage.getItem(storageKey(id))
      expect(raw, `导入后 ${id} 分片不见了`).not.toBeNull()
      expect(raw!, `${id} 分片内容与导出的不一致`).not.toContain('云隐')
      const stored = JSON.parse(readSaveText(raw!)) as Record<string, unknown>
      if (id === 'game') {
        // 唯一刻意例外:导入把 lastActiveAt 重戳为「现在」(save.ts migrate),
        // 免得快照里的旧时间戳把「导入旧备份」误算成「缺勤数月」——时钟
        // 字段以外,其余键仍须与导出逐一对账
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

    // 再开一次游戏(新 pinia + 插件从存档水合):玩家的东西得还在
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

  /**
   * 战报里那些「读数」也要活着回来。
   *
   * 战后分析读的是 lastBattle.result 上的遥测、先手判定与敌人加成来源 ——
   * 它们若在往返里掉了一栏,玩家下次打开只会看到分析面板空了一角,
   * 而且悄无声息:字段丢了并不报错,只是解释不见了。
   */
  it('战报读数原样回来(遥测 / 先手 / 敌之加成 / 拾获)', async () => {
    // 导入的门槛是「player 与 game 俱在」(建号那刻起就该有),先备齐
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
    // 判据落在玩家真正读的那一屏:导入之后,分析面板仍拿得出结论
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
})
