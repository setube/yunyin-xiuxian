/**
 * 半损坏档导入端到端:导入 → 落盘 → 重新水合 → sanitize(store 层 sanitize 见 storeResilience)。
 * 判据:要么明确拒绝,要么接受且水合不抛、字段类型可用;拒绝时本机现有存档原样留着。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { PERSISTED_STORES, buildExportPayload, clearAllSave, clearCorrupted, collectCorrupted, dropPendingWrites, flushSaveWrites, preflightScan, storageKey } from '@/utils/storage'
import { importSaveText } from './save'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { MAX_MAJOR } from '@/data/realms'
import { encryptSave } from '@/utils/crypto'

function installStorage(): void {
  const disk = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
    clear: () => disk.clear(),
    key: () => null,
    length: 0
  })
}

/** 真 pinia + 真持久化插件,跑通落盘 → 水合 */
function bootStores(): void {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  createApp({ render: () => null }).use(pinia)
  setActivePinia(pinia)
}

/** 一份包着坏数据的合法信封 */
function envelope(data: Record<string, unknown>): string {
  return JSON.stringify({ game: 'yunyin-xiuxian', version: 2, exportedAt: Date.now(), data })
}

const NASTY: { name: string; data: Record<string, unknown> }[] = [
  { name: 'player 是 null', data: { game: { started: true }, player: null } },
  { name: 'player 是数组', data: { game: { started: true }, player: [] } },
  { name: 'player 是空对象', data: { game: {}, player: {} } },
  {
    name: '字段全是垃圾',
    data: { game: { started: 'yes', lastActiveAt: 'x' }, player: { major: '3', exp: 'x', linggen: 5, reincarnation: 'no' } }
  },
  {
    name: '背包分片形状不对',
    data: {
      game: { started: true },
      player: { major: 3 },
      inventory: { items: 'x', equipped: 5, artifacts: null, equippedArtifacts: {} },
      cultivation: { learned: 'no', subGongfa: 7 }
    }
  }
]

const REJECTED: { name: string; data: Record<string, unknown> }[] = [
  { name: 'player 是字符串', data: { game: { started: true }, player: 'x' } },
  { name: 'player 是数字', data: { game: { started: true }, player: 42 } },
  { name: 'game 缺失', data: { player: { major: 3 } } }
]

describe('半损坏档 · 进得了游戏,或者被明确拒绝', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
    dropPendingWrites()
    clearAllSave()
  })

  for (const variant of NASTY) {
    it(`${variant.name}:导入通过,且水合后可读、字段是能用的类型`, () => {
      expect(importSaveText(envelope(variant.data)), '这类坏法应当被修成形,而不是拒绝').toBeNull()
      let playerMajor: number | null = null
      expect(() => {
        bootStores()
        const game = useGameStore()
        const player = usePlayerStore()
        const inventory = useInventoryStore()
        const cultivation = useCultivationStore()
        game.sanitize()
        player.sanitize()
        inventory.sanitize()
        cultivation.sanitize()
        playerMajor = player.major
        if (variant.name === '字段全是垃圾') {
          expect(game.started, '字符串 started 不得被当成已开局').toBe(false)
        }
        // 读一遍计算属性:白屏多发生在渲染期
        void player.finalStats
        void player.expReq
        expect(Array.isArray(inventory.items), '背包该被修成数组').toBe(true)
        expect(typeof player.expReq, '修为需求该是能算的数').not.toBe('string')
      }, '水合/修形不该抛').not.toThrow()
      // 整数且落在境界表范围内(字符串 '3' 该被修掉)
      expect(Number.isInteger(playerMajor), `境界被修成了 ${String(playerMajor)},不是整数`).toBe(true)
      expect(playerMajor!, '境界越界').toBeGreaterThanOrEqual(0)
      expect(playerMajor!, '境界越界').toBeLessThanOrEqual(MAX_MAJOR)
      expect(() => preflightScan()).not.toThrow()
    })
  }

  for (const variant of REJECTED) {
    it(`${variant.name}:明确拒绝,且本机现有存档原样留着`, () => {
      bootStores()
      useGameStore().markStarted()
      const before = localStorage.getItem(storageKey('game'))
      const err = importSaveText(envelope(variant.data))
      expect(err, '这类坏法应当在导入前就被挡下').not.toBeNull()
      expect(localStorage.getItem(storageKey('game')), '被拒绝的导入不该动现有存档').toBe(before)
    })
  }

  /**
   * 「原档留在本机」若只在 localStorage 里躺着,玩家没有任何办法把它交出来。
   * 导出须随包带走隔离出来的坏档;导入则故意不消费它(坏档不该回到存档位)。
   * 故障注入:把 buildExportPayload 里的 corrupted 段删掉 → 本条红。
   */
  it('隔离出来的坏档随导出带走,导入时不回写存档位', () => {
    bootStores()
    const key = storageKey('player')
    localStorage.setItem(key, '这不是存档')
    const corrupted = preflightScan()
    expect(corrupted, '坏分片应被隔离').toContain('player')
    expect(collectCorrupted().player, '隔离后应留一份原密文').toBe('这不是存档')

    const payload = buildExportPayload()
    expect(payload.corrupted?.player, '导出没带上被隔离的原档 —— 玩家拿不到它').toBe('这不是存档')

    // 导入这份导出:坏档段不该被回写到存档位
    const err = importSaveText(encryptSave(JSON.stringify({ ...payload, data: { ...payload.data, player: { major: 1, sub: 0, name: 'x' }, game: { started: true, saveVersion: 2, createdAt: 1, lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null } } })))
    expect(err, '带坏档段的导出应能正常导入').toBeNull()
    expect(localStorage.getItem(storageKey('player')), '坏档段被写回了存档位').not.toBe('这不是存档')
    // 本机原有的隔离备份不受影响
    expect(collectCorrupted().player).toBe('这不是存档')
  })

  /**
   * 「清空存档」与「导入存档」对坏档的态度必须分开,两条语义不能合并。
   *
   * `corrupt.*` 不在 `PERSISTED_STORES` 里(preflightScan 把它们移出存档位),
   * 于是 clearAllSave 逐个 removeItem 时整个漏掉它:实测清档后 localStorage 里
   * 只剩 `corrupt.yunyin.player`,而 buildExportPayload 见 corruptedCount() > 0
   * 就把这一段带进导出 —— 玩家清空存档、重开一局后,导出的文件里仍带着上一位的坏档。
   *
   * 但导入那条路**不能**跟着清:玩家是在换一份存档,本机原档隔离出来的坏档仍要留着
   * (上一条用例钉着)。故 clearCorrupted 单开一支,只由清空存档调用。
   * 故障注入:把 clearCorrupted 里的 removeItem 删掉,或让 clearAllSave 顺手清掉它,本条红。
   */
  it('清空存档清掉隔离出来的坏档;导入存档则保留本机的坏档', () => {
    bootStores()
    const key = storageKey('player')
    localStorage.setItem(key, '这不是存档')
    expect(preflightScan(), '前置:坏分片先被隔离').toContain('player')
    expect(collectCorrupted().player, '前置:隔离备份已生成').toBe('这不是存档')

    // 导入:本机坏档不动
    importSaveText(
      encryptSave(
        JSON.stringify({
          game: 'yunyin-xiuxian',
          version: 2,
          exportedAt: Date.now(),
          data: {
            player: { major: 1, sub: 0, name: 'x' },
            game: { started: true, saveVersion: 2, createdAt: 1, lastActiveAt: Date.now(), totalPlaySec: 0, createRerolls: 8, createProfile: null }
          }
        })
      )
    )
    expect(collectCorrupted().player, '导入不该替玩家删掉本机隔离出来的坏档').toBe('这不是存档')

    // 清空:坏档一并清掉,新一局的导出不再带上一位的坏档
    clearCorrupted()
    expect(collectCorrupted(), '清档后不该还留着上一位的坏档').toEqual({})
    expect(buildExportPayload().corrupted, '清档后的导出不该带 corrupted 段').toBeUndefined()
  })

  it('整段不是存档(纯文本/空串)也只报错不炸', () => {
    for (const text of ['这不是存档', '', '{}', '[]']) {
      const err = importSaveText(text)
      expect(err, `「${text}」应当被拒绝`).not.toBeNull()
      expect(PERSISTED_STORES.length).toBeGreaterThan(0)
    }
  })

  it('导入旧备份:lastActiveAt 重戳为现在,归来不因快照里的旧时间戳老化到死', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    try {
      const writes = new Map<string, string>()
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => writes.get(k) ?? null,
        setItem: (k: string, v: string) => void writes.set(k, v),
        removeItem: (k: string) => void writes.delete(k),
        clear: () => writes.clear(),
        key: () => null,
        length: 0
      })
      // 30 天前导出的旧备份
      const err = importSaveText(
        envelope({
          game: { started: true, lastActiveAt: 1_000_000 - 2_592_000_000, totalPlaySec: 0 },
          player: { major: 0, age: 146, lifespanBonusYears: 0 }
        })
      )
      expect(err).toBeNull()
      bootStores()
      expect(useGameStore().lastActiveAt).toBe(1_000_000)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('导入写盘中途失败:回滚,旧档原样保留(不清成半档)', () => {
    // 配额不足:resources 分片写不进,其余照常
    const writes = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => writes.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k === storageKey('resources')) throw new DOMException('quota', 'QuotaExceededError')
        writes.set(k, v)
      },
      removeItem: (k: string) => void writes.delete(k),
      clear: () => writes.clear(),
      key: () => null,
      length: 0
    })
    writes.set(storageKey('game'), 'OLD_GAME')
    writes.set(storageKey('player'), 'OLD_PLAYER')
    const err = importSaveText(
      envelope({ game: { started: true }, player: { major: 3 }, resources: { spiritStone: { m: 1, e: 4 } } })
    )
    expect(err, '写盘失败应当报错').not.toBeNull()
    expect(writes.get(storageKey('game')), '回滚后旧 game 分片原样保留').toBe('OLD_GAME')
    expect(writes.get(storageKey('player')), '回滚后旧 player 分片原样保留').toBe('OLD_PLAYER')
  })

  /**
   * 回滚快照要连待落盘队列一起取。
   *
   * 存档写入是 5 秒节流合并的:玩家刚打完一仗、进度还在 pending 里,磁盘上停着最多 5 秒前那份。
   * 原先 applyImportPayload 只读 localStorage 就快照,于是导入失败回滚到的是那份旧档 ——
   * 刚打的那一仗连同中间所有变更一起没了,而玩家只看到一句「原档已保留」。
   * 故障注入:去掉快照前那次 flushSaveWrites,本条红。
   */
  it('导入失败时回滚到最新进度,不是 5 秒前那份磁盘旧档', async () => {
    bootStores()
    dropPendingWrites()
    // 先落一份「旧档」到磁盘(pinia 持久化要过一轮微任务才入队)
    const player = usePlayerStore()
    player.major = 2
    await nextTick()
    flushSaveWrites()
    const stale = localStorage.getItem(storageKey('player'))
    expect(stale, '前置:旧档已落盘').not.toBeNull()
    // 再改内存到「新档」但不落盘:此时最新态只在 pending 队列里
    player.major = 9
    await nextTick()

    // 让写入必失败(配额不足),触发回滚
    const realSet = localStorage.setItem.bind(localStorage)
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === storageKey('resources')) throw new DOMException('quota', 'QuotaExceededError')
      realSet(k, v)
    })
    try {
      const err = importSaveText(envelope({ game: { started: true }, player: { major: 3 }, resources: { spiritStone: { m: 1, e: 4 } } }))
      expect(err, '写盘失败应当报错').not.toBeNull()
    } finally {
      spy.mockRestore()
    }
    // 回滚后磁盘里应是「刚改到的 9」,而不是 flush 前那份 stale
    const after = localStorage.getItem(storageKey('player'))
    expect(after, '回滚到的是旧快照 —— 刚打的那一仗没了').not.toBe(stale)
  })
})
