/**
 * `types` 里那份 `COUNTER_KEYS` 数组必须**盖得住**所有会写计数器的键。
 *
 * 读档自愈按它过滤:表外的键会被清掉。若某个键在 `src/core` 里被
 * `track()` / `trackQuiet()` 写入、却不在表里,那个计数**读档时会被归零** ——
 * 玩家的进度凭空消失,而且没有任何报错。
 *
 * 类型与数组是同一份事实源(`CounterKey` 由 `typeof COUNTER_KEYS[number]` 推),
 * 故这里只需查「源码里的字面量键都在数组里」。加新 track 键忘了加数组 → 红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { COUNTER_KEYS } from '@/types'

const CORE = resolve(__dirname)

/** 递归列出 core 下的非测试 .ts 文件 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(p)
  }
  return out
}

/** 从源码里扫出所有 `track('key'` / `trackQuiet('key'` 的字面量键 */
function scannedKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of walk(CORE)) {
    const src = readFileSync(file, 'utf-8')
    for (const m of src.matchAll(/\btrack(?:Quiet)?\(\s*'([a-zA-Z]+)'/g)) keys.add(m[1]!)
  }
  return keys
}

describe('计数器键表 · 必须盖住所有 track 调用点', () => {
  it('源码里每个 track 字面量键都在表内', () => {
    const scanned = scannedKeys()
    expect(scanned.size, '一个 track 都没扫到 —— 判据要跟着改名').toBeGreaterThan(10)
    const missing = [...scanned].filter(k => !(COUNTER_KEYS as readonly string[]).includes(k)).sort()
    expect(
      missing,
      `这些键被 track() 写入却不在 COUNTER_KEYS 里 —— 读档时会被当野键清掉,进度凭空消失`
    ).toEqual([])
  })

  it('表里的键数对得上联合类型的规模(不是空转)', () => {
    // 19 是 CounterKey 的字面量个数;多一两个(未来扩充)允许,但绝不该只剩个位数
    expect(COUNTER_KEYS.length, '键表太小了').toBeGreaterThanOrEqual(15)
  })
})
