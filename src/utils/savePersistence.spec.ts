/* eslint-disable no-console -- 写盘频次审计需要打印读数 */
/**
 * 存档写盘频次与完整性。
 * pinia-plugin-persistedstate 默认每次 store 变更同步落盘(序列化 + AES + 主线程同步写),
 * Android WebView 上持续发热;须定期批量刷盘。
 * 两条不变量须同测:写盘频次有上界;落盘内容正确、不丢、不被回写。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SAVE_FLUSH_MS,
  clearAllSave,
  dropPendingWrites,
  flushSaveWrites,
  persistConfig,
  buildExportPayload,
  saveWriteFailure,
  storageKey,
  subscribeSaveWriteFailure
} from './storage'
import { encryptSave, readSaveText } from './crypto'

interface Probe {
  disk: Map<string, string>
  writes: number
  /** 每次写盘记一条调用栈;偶发红时报文点名写入方 */
  stacks: string[]
}

let probe: Probe

function installFakeStorage(): Probe {
  const disk = new Map<string, string>()
  const p: Probe = { disk, writes: 0, stacks: [] }
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => {
      disk.set(k, v)
      p.writes += 1
      p.stacks.push((new Error('write').stack ?? '').split('\n').slice(1, 3).join(' | '))
    },
    removeItem: (k: string) => disk.delete(k),
    clear: () => disk.clear(),
    key: () => null,
    length: 0
  })
  return p
}

beforeEach(() => {
  vi.useFakeTimers()
  dropPendingWrites()
  probe = installFakeStorage()
  // 写盘失败状态是模块级的,每个用例须清零
  clearAllSave()
})

afterEach(() => {
  dropPendingWrites()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('存档写盘 · 频次有上界', () => {
  it('一个刷盘周期内的连续变更只落盘一次', () => {
    const { storage, serializer, key } = persistConfig('player')
    const TICKS = 60
    for (let i = 0; i < TICKS; i += 1) storage.setItem(key, serializer.serialize({ exp: i }))
    expect(probe.writes).toBe(0)
    vi.advanceTimersByTime(SAVE_FLUSH_MS)
    expect(probe.writes).toBe(1)
    console.log(`\n${TICKS} 次变更 → 落盘 ${probe.writes} 次(旧实现为 ${TICKS} 次)`)
  })

  it('多个分片共用一次刷盘,每片各写一次', () => {
    const ids = ['player', 'resources', 'dongfu', 'game']
    for (let i = 0; i < 30; i += 1) {
      for (const id of ids) {
        const { storage, serializer, key } = persistConfig(id)
        storage.setItem(key, serializer.serialize({ n: i }))
      }
    }
    expect(probe.writes).toBe(0)
    vi.advanceTimersByTime(SAVE_FLUSH_MS)
    expect(probe.writes).toBe(ids.length)
    console.log(`\n${ids.length} 片 × 30 次变更 = 120 次改动 → 落盘 ${probe.writes} 次`)
  })

  it('故障注入:绕过节流直连 localStorage,次数立刻回到每次一写', () => {
    // 不做这一步,上面两条可能只是计数器没在数
    for (let i = 0; i < 60; i += 1) localStorage.setItem(storageKey('player'), String(i))
    expect(probe.writes).toBe(60)
    console.log(`\n绕过节流直写 60 次 → 落盘 ${probe.writes} 次,计数器确实在数`)
  })
})

describe('存档写盘 · 省下的电不能拿存档换', () => {
  it('落盘内容是最后一次变更,且能被反序列化读回', () => {
    const { storage, serializer, key } = persistConfig('player')
    for (let i = 0; i < 10; i += 1) storage.setItem(key, serializer.serialize({ exp: i, name: '云隐' }))
    vi.advanceTimersByTime(SAVE_FLUSH_MS)
    const raw = probe.disk.get(key)
    expect(raw).toBeDefined()
    // 磁盘上须是密文
    expect(raw).not.toContain('云隐')
    expect(serializer.deserialize(raw!)).toEqual({ exp: 9, name: '云隐' })
  })

  it('读己所写:尚未落盘也能立刻读回最新值', () => {
    const { storage, serializer, key } = persistConfig('player')
    storage.setItem(key, serializer.serialize({ exp: 42 }))
    // 偶发红时报文带调用栈(见 Probe.stacks)
    expect(probe.writes, `还没到刷盘点就写了盘。调用栈:${probe.stacks.join(' // ')}`).toBe(0)
    expect(serializer.deserialize(storage.getItem(key)!)).toEqual({ exp: 42 })
  })

  it('刷盘后队列清空,不会重复写', () => {
    const { storage, serializer, key } = persistConfig('player')
    storage.setItem(key, serializer.serialize({ exp: 1 }))
    flushSaveWrites()
    expect(probe.writes).toBe(1)
    vi.advanceTimersByTime(SAVE_FLUSH_MS * 3)
    expect(probe.writes).toBe(1)
  })

  it('清档会丢弃待刷队列 —— 否则清完之后那次刷盘把旧档写回来', () => {
    const { storage, serializer, key } = persistConfig('player')
    storage.setItem(key, serializer.serialize({ exp: 999 }))
    clearAllSave()
    vi.advanceTimersByTime(SAVE_FLUSH_MS * 3)
    expect(probe.disk.has(key)).toBe(false)
    console.log('\n清档后即使刷盘定时器到点,也不会把旧分片写回')
  })

  it('removeItem 同时清掉队列里的同键,不会被延迟写复活', () => {
    const { storage, serializer, key } = persistConfig('player')
    storage.setItem(key, serializer.serialize({ exp: 1 }))
    storage.removeItem(key)
    vi.advanceTimersByTime(SAVE_FLUSH_MS * 3)
    expect(probe.disk.has(key)).toBe(false)
    expect(storage.getItem(key)).toBeNull()
  })
})

/**
 * 写盘失败不许静默(存储占满 / WebView 拒绝):
 *   一 失败浮出来(订阅方收得到,状态读得到);
 *   二 失败的分片留在队列里,下次刷盘重试;
 *   三 恢复后报一声并清掉警告。
 */
/**
 * 启动期只解一次:`preflightScan` 为了判坏档必须把每一片解密,而紧跟其后的 Pinia 水合
 * 要用同一份东西 —— 不接上的话每片解密两遍。满包档(108 件装备)单片约 3ms、17 片,
 * 两遍叠在同一个启动长任务里。
 *
 * 判据看的是**可观测的行为差异**,不数函数调用(ESM 的模块内绑定 spyOn 改不动):
 * 缓存命中时 `storage.getItem` 返回的已是明文,水合读到它就不再进 AES;
 * 未命中时返回的仍是磁盘密文(`U2FsdGVkX1` 开头),照常解密。
 */
describe('启动期 · 扫描与水合共用一次解密', () => {
  const CIPHER_HEAD = 'U2FsdGVkX1'
  /** 造一片真存档(磁盘上是密文) */
  const put = (id: string, value: unknown): void => {
    probe.disk.set(storageKey(id), encryptSave(JSON.stringify(value)))
  }

  it('扫描过的分片,水合读到的是明文 —— 不再解密', async () => {
    const { preflightScan, persistConfig } = await import('./storage')
    put('game', { x: 'g' })
    put('player', { x: 'p' })
    expect(preflightScan(), '两片都是好档,不该被隔离').toEqual([])

    for (const id of ['game', 'player']) {
      const cfg = persistConfig(id)
      const raw = cfg.storage.getItem(cfg.key) as string
      expect(raw.startsWith(CIPHER_HEAD), `${id} 片水合时还是密文 —— 说明又解了一遍`).toBe(false)
      expect(cfg.serializer.deserialize(raw), `${id} 片的明文不对`).toEqual({ x: id === 'game' ? 'g' : 'p' })
    }
  })

  it('没扫描过的分片仍是密文 —— 缓存只覆盖扫描到的那一段', async () => {
    const { preflightScan, persistConfig } = await import('./storage')
    put('game', { x: 'g' })
    preflightScan()
    // 扫描时还不存在,水合前才写进来
    put('lore', { x: 'l' })
    const cfg = persistConfig('lore')
    const raw = cfg.storage.getItem(cfg.key) as string
    expect(raw.startsWith(CIPHER_HEAD), '不在缓存里的分片必须回到磁盘密文,照常解密').toBe(true)
    expect(cfg.serializer.deserialize(raw)).toEqual({ x: 'l' })
  })

  it('明文只留到第一次读取:同一片取两次,第二次回到密文', async () => {
    const { preflightScan, persistConfig } = await import('./storage')
    put('game', { x: 1 })
    preflightScan()
    const cfg = persistConfig('game')
    const first = cfg.storage.getItem(cfg.key) as string
    const second = cfg.storage.getItem(cfg.key) as string
    expect(first.startsWith(CIPHER_HEAD), '第一次读到的该是扫描留下的明文').toBe(false)
    expect(second, '第二次该回到磁盘上的密文').toBe(probe.disk.get(storageKey('game')))
    expect(JSON.parse(first), '两条路径读出的明文必须一致').toEqual({ x: 1 })
    expect(cfg.serializer.deserialize(second)).toEqual({ x: 1 })
  })

  /**
   * 迁移写回必须作废扫描留下的明文。
   *
   * `migrateLocalSchema` 紧跟 `preflightScan` 跑,而它在真迁移时会**把新形态写回磁盘**。
   * 若一次性明文缓存还是扫描时那份旧形态,水合就会把迁移结果原地撤销 ——
   * 迁移看着跑了、回写也落了,读进去的却是旧结构。
   * 故障注入:把 migrateLocalSchema 里那行作废删掉 → 本条红。
   */
  it('迁移写回的分片,水合读到的是迁移后的形态', async () => {
    const { preflightScan, migrateLocalSchema, persistConfig } = await import('./storage')
    // 旧形态:单数 equippedArtifact,没有 equippedArtifacts
    put('inventory', { items: [], equippedArtifact: 'a_old' })
    preflightScan()
    migrateLocalSchema()
    const cfg = persistConfig('inventory')
    const raw = cfg.storage.getItem(cfg.key) as string
    const seen = cfg.serializer.deserialize(raw) as Record<string, unknown>
    expect(seen.equippedArtifacts, '水合读到的是扫描时的旧明文 —— 迁移被原地撤销了').toEqual(['a_old'])
    expect(seen.equippedArtifact, '旧字段该已被迁移清掉').toBeUndefined()
  })

  it('坏档不进缓存:解不出的分片照旧被隔离', async () => {
    const { preflightScan, persistConfig } = await import('./storage')
    probe.disk.set(storageKey('player'), '这不是存档')
    const corrupted = preflightScan()
    expect(corrupted).toContain('player')
    expect(persistConfig('player').storage.getItem(storageKey('player'))).toBeNull()
  })

  it('清档把缓存一起丢掉 —— 否则新存档会读到上一份的明文', async () => {
    const { preflightScan, persistConfig, clearAllSave } = await import('./storage')
    put('game', { x: 'old' })
    preflightScan()
    clearAllSave()
    put('game', { x: 'new' })
    const cfg = persistConfig('game')
    const raw = cfg.storage.getItem(cfg.key) as string
    expect(cfg.serializer.deserialize(raw), '清档没清掉一次性明文缓存').toEqual({ x: 'new' })
  })
})

describe('存档写盘 · 失败不许静默', () => {
  /** 让 localStorage.setItem 按开关抛错(模拟容量满/被拒);allow(true) = 能写得进去 */
  function installJammedStorage(probe: Probe): { allow: (ok: boolean) => void } {
    let jammed = false
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => probe.disk.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (jammed) throw new DOMException('quota', 'QuotaExceededError')
        probe.disk.set(k, v)
        probe.writes += 1
      },
      removeItem: (k: string) => probe.disk.delete(k),
      clear: () => probe.disk.clear(),
      key: () => null,
      length: 0
    })
    return {
      allow: (ok: boolean) => {
        jammed = !ok
      }
    }
  }

  it('写不进去时:状态浮出来、订阅方被通知、那一片留在队列里等重试', () => {
    const jam = installJammedStorage(probe)
    const seen: (string[] | null)[] = []
    const unsubscribe = subscribeSaveWriteFailure(f => seen.push(f ? f.keys : null))
    const { storage, serializer, key } = persistConfig('player')

    jam.allow(true)
    storage.setItem(key, serializer.serialize({ exp: 1 }))
    flushSaveWrites()
    expect(probe.writes).toBe(1)
    expect(saveWriteFailure()).toBeNull()

    const beforeFail = probe.disk.get(key)
    jam.allow(false)
    storage.setItem(key, serializer.serialize({ exp: 2 }))
    flushSaveWrites()
    expect(saveWriteFailure(), '写失败却没有任何状态').not.toBeNull()
    expect(seen, '订阅方应当收到一次失败通知').toEqual([[key]])
    // 磁盘仍是失败前那版;最新一份留在队列里(读得到)
    expect(probe.disk.get(key), '写失败却把磁盘上的旧档动了').toBe(beforeFail)
    expect(serializer.deserialize(storage.getItem(key)!)).toEqual({ exp: 2 })
    jam.allow(true)
    flushSaveWrites()
    expect(probe.writes, '恢复后重试应当真的写进去').toBe(2)
    expect(probe.disk.get(key), '重试没有真正落盘').not.toBe(beforeFail)
    expect(saveWriteFailure(), '恢复后警告要清掉').toBeNull()
    expect(seen, '恢复也要报一声').toEqual([[key], null])
    unsubscribe()
  })

  it('持续失败不重复轰炸:只在状态翻转时通知一次', () => {
    const jam = installJammedStorage(probe)
    let calls = 0
    const unsubscribe = subscribeSaveWriteFailure(() => {
      calls += 1
    })
    const { storage, serializer, key } = persistConfig('player')
    jam.allow(false)
    storage.setItem(key, serializer.serialize({ exp: 1 }))
    flushSaveWrites()
    vi.advanceTimersByTime(SAVE_FLUSH_MS)
    vi.advanceTimersByTime(SAVE_FLUSH_MS)
    expect(calls, '反复失败只该通知一次').toBe(1)
    unsubscribe()
  })

  /**
   * 导出须取内存最新态:写盘失败时磁盘停在旧值,只读 localStorage 的备份会静默丢掉这一段进度
   * (玩家收到「已导出」,拿回来的却是失败前的档)。故障注入:去掉 pending 分支即红。
   */
  it('写盘失败期间的导出带的是内存最新态,不是磁盘旧值', () => {
    const jam = installJammedStorage(probe)
    const { storage, serializer, key } = persistConfig('player')
    jam.allow(true)
    storage.setItem(key, serializer.serialize({ major: 3 }))
    flushSaveWrites()
    expect(JSON.parse(readSaveText(probe.disk.get(key)!))).toEqual({ major: 3 })

    jam.allow(false)
    storage.setItem(key, serializer.serialize({ major: 9 }))
    flushSaveWrites()
    expect(saveWriteFailure(), '这一档必须先进入写盘失败').not.toBeNull()

    const payload = buildExportPayload()
    expect(payload.data.player, '导出拿的是磁盘旧值 —— 失败期间的进度会被备份静默丢掉').toEqual({ major: 9 })
  })

  it('清档会清掉旧的失败警告(那批待写内容已经不打算写了)', () => {
    const jam = installJammedStorage(probe)
    const seen: (string[] | null)[] = []
    const unsubscribe = subscribeSaveWriteFailure(f => seen.push(f ? f.keys : null))
    const { storage, serializer, key } = persistConfig('player')
    jam.allow(false)
    storage.setItem(key, serializer.serialize({ exp: 1 }))
    flushSaveWrites()
    expect(saveWriteFailure()).not.toBeNull()
    clearAllSave()
    expect(saveWriteFailure()).toBeNull()
    expect(seen).toEqual([[key], null])
    unsubscribe()
  })
})
