/* eslint-disable no-console -- 写盘频次审计需要打印读数 */
/**
 * 存档写入频次与完整性
 *
 * 玩家反馈:手机越玩越烫。实测根因之一是**写盘频次**:
 * 引擎每秒推进修为、灵气、洞府产出,而 pinia-plugin-persistedstate
 * 默认对每次 store 变更同步落盘 —— 仅 game/player/resources 三片就是
 * 每秒 3 次「JSON 序列化 + 全片 AES 加密 + 主线程同步磁盘写」,
 * 真实游玩再加上 adventure/dongfu/quests 会到 4~6 次。挂机一天约 26 万次。
 * crypto-js 是纯 JS 实现,localStorage.setItem 在 Android WebView 上又是
 * 同步落盘,两者叠加就是持续发热。
 *
 * 改为定期批量刷盘之后,这里钉的是两条不能各自成立的不变量:
 *
 *   **写盘频次有上界**(否则又会烫回去)
 *   **且落盘内容必须正确、不丢、不被回写**(否则省下的电是拿存档换的)
 *
 * 只测前者会退化成「写得越少越好」,把不写档也判成通过 —— 故两条必须同测。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAVE_FLUSH_MS, clearAllSave, dropPendingWrites, flushSaveWrites, persistConfig, storageKey } from './storage'

interface Probe {
  disk: Map<string, string>
  writes: number
}

let probe: Probe

function installFakeStorage(): Probe {
  const disk = new Map<string, string>()
  const p: Probe = { disk, writes: 0 }
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => {
      disk.set(k, v)
      p.writes += 1
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
    // 周期内一次都不写 —— 这正是省下来的那部分
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
    // 若不做这一步,上面两条可能只是「计数器没在数」而非节流真的生效
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
    // 磁盘上必须是密文(明文落盘等于把加密改没了)
    expect(raw).not.toContain('云隐')
    expect(serializer.deserialize(raw!)).toEqual({ exp: 9, name: '云隐' })
  })

  it('读己所写:尚未落盘也能立刻读回最新值', () => {
    const { storage, serializer, key } = persistConfig('player')
    storage.setItem(key, serializer.serialize({ exp: 42 }))
    // 一次都还没落盘
    expect(probe.writes).toBe(0)
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
