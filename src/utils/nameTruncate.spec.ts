/**
 * 道号截断:按码点,不按码元。
 *
 * 原先 CreateView 写的是 `name.trim().slice(0, 8)` 加 `maxlength="8"`,
 * 两者都按 UTF-16 码元计数 —— 一个星月符号占两个码元,
 * 「一二三四五六七」加一个符号共 7 个字,`slice(0, 8)` 会把它切成半个,
 * 留下一个孤立的高位代理项,显示成乱码。
 *
 * 仓库早就有 `truncateCodePoints`(第 262 轮为存档形状写的),这里复用同一把尺。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { truncateCodePoints } from './saveShape'

/** U+1F319。写成 fromCodePoint,源码里不留 emoji 字形 —— 楷体覆盖判据会扫它们 */
const MOON = String.fromCodePoint(0x1f319)
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

describe('道号 · 按码点截断', () => {
  it('七个汉字加一个符号:截到 8 个码点,不切碎符号', () => {
    const src = `一二三四五六七${MOON}`
    // 前提:按码元 slice 会切碎它
    expect(LONE_SURROGATE.test(src.slice(0, 8)), '这个用例的前提变了').toBe(true)

    const got = truncateCodePoints(src, 8)
    expect(LONE_SURROGATE.test(got), `截出了孤立代理项:${JSON.stringify(got)}`).toBe(false)
    expect(Array.from(got).length).toBe(8)
    expect(got).toBe(src)
  })

  it('全是符号:按码点算 8 个,按码元只有 4 个', () => {
    const src = MOON.repeat(9)
    expect(Array.from(src.slice(0, 8)).length).toBe(4)      // 码元口径:4 个完整符号
    const got = truncateCodePoints(src, 8)
    expect(Array.from(got).length).toBe(8)                  // 码点口径:8 个
    expect(LONE_SURROGATE.test(got)).toBe(false)
  })

  it('短于上限时原样返回', () => {
    expect(truncateCodePoints('云隐', 8)).toBe('云隐')
  })

  it('空串与纯空白走兜底,不是空白道号', () => {
    expect(truncateCodePoints('', 8)).toBe('')
    expect(truncateCodePoints('   ', 8).trim() || '无名散修').toBe('无名散修')
  })
})

/**
 * 输入框不能再用 maxlength:它在**输入阶段**就按码元砍,
 * 后面再怎么按码点截也救不回来。这条钉住那个属性别回来。
 */
describe('道号 · 输入框不设 maxlength', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/views/CreateView.vue'), 'utf-8')

  it('CreateView 的道号输入框没有 maxlength', () => {
    const input = /<input[\s\S]*?\/>/.exec(src)?.[0] ?? ''
    expect(input, '没找到道号输入框,判据失效').toContain('道号')
    expect(input, 'maxlength 按码元砍,会把符号切成半个').not.toMatch(/maxlength/)
  })

  it('提交时走 truncateCodePoints,而不是 slice', () => {
    expect(src).toMatch(/truncateCodePoints\(name\.value\.trim\(\),\s*8\)/)
    expect(src, '别再退回 slice(0, 8)').not.toMatch(/name\.value\.trim\(\)\.slice\(/)
  })
})
