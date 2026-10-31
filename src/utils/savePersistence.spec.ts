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
  saveWriteFailure,
  storageKey,
  subscribeSaveWriteFailure
} from './storage'

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
