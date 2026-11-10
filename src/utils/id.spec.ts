/**
 * 唯一 ID 生成器。
 *
 * 两条不变式:
 *  一 **不撞** —— 同毫秒内连续生成也只是 counter 递增,不会重复。
 *  二 **不碰 Math.random** —— 这条比第一条更容易在很久以后才出问题。
 *
 * 为什么单独钉第二条:`utils/storage.ts` 的心跳键为此栽过一次 ——
 * 模块顶层调 `Math.random` 会占掉那些用 `mockReturnValueOnce` 精确控制随机序列的测试的一次配额,
 * 把整条序列往后挪,当时 `earlyGameBuffs` 的「灵机一动」用例因此崩掉。
 * `id.ts` 在 `equipGen` / `soulForge` / `loadoutService` 的模块级初始化路径上,
 * 同一个坑不能踩第二遍。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { uid } from './id'

const SRC = readFileSync(resolve(__dirname, './id.ts'), 'utf-8')
/** 剥掉注释:注释里提到 Math.random 是在解释「为什么不用它」 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('uid · 不撞', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('同一毫秒内连续生成一万个,一个不重', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const seen = new Set<string>()
    for (let i = 0; i < 10000; i += 1) seen.add(uid())
    expect(seen.size, '同毫秒生成撞了 —— counter 或扰动退化了').toBe(10000)
  })

  it('跨毫秒也不撞,且长度稳定', () => {
    let t = 1700000000000
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 7))
    const a = uid()
    const b = uid()
    expect(a).not.toBe(b)
    // 时间戳(base36 约 8 位)+ 3 位计数 + 1~3 位扰动
    for (const id of [a, b]) expect(id, `id 长度异常:${id}`).toMatch(/^[0-9a-z]{12,14}$/)
  })
})

describe('uid · 不碰 Math.random', () => {
  /**
   * 这条是行为判据,不是源码判据 —— 但源码也一起钉:
   * 行为上「生成一个 id 不消耗 Math.random」,源码上「id.ts 里没有 Math.random 这个标识符」。
   * 两条各自都能单独抓到回归(把扰动换回 Math.random 时行为那条先红)。
   */
  it('生成 id 不消耗 Math.random 的返回值', () => {
    const spy = vi.spyOn(Math, 'random')
    uid()
    uid()
    expect(spy, 'idl 生成途中动了 Math.random —— 会挪偏精确控制的随机序列').not.toHaveBeenCalled()
  })

  it('精确的 mockReturnValueOnce 序列不会被 id 生成的配额顶掉', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.11)
      .mockReturnValueOnce(0.22)
    // 中间插入十次 id 生成(模拟模块级初始化)
    for (let i = 0; i < 10; i += 1) uid()
    expect(Math.random(), '第一次业务取值被 id 抢走了').toBeCloseTo(0.11, 10)
    expect(Math.random(), '第二次业务取值被 id 抢走了').toBeCloseTo(0.22, 10)
  })

  it('源码里不出现 Math.random', () => {
    expect(CODE, 'id.ts 又用回 Math.random 了 —— storage.ts 为此栽过一次').not.toContain('Math.random')
  })
})
