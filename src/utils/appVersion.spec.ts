/**
 * appVersion 工具 —— 版本比较器与版本号来源的确定性测试。
 *
 * 判据:比较器必须稳定、无依赖、可单测;APP_VERSION 必须与 package.json 同源,
 * 否则「发布说明第一条的版本 == package.json 版本」那条判据(见 releaseNotes.spec)
 * 会替我们撒谎。
 */
import { describe, expect, it } from 'vitest'
import { APP_VERSION, compareVersions } from './appVersion'
import pkg from '../../package.json'

describe('compareVersions · 三段式版本比较', () => {
  it('相等返回 0', () => {
    expect(compareVersions('1.37.0', '1.37.0')).toBe(0)
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0)
  })

  it('补丁级:patch 越大越新', () => {
    expect(compareVersions('1.37.0', '1.37.1')).toBeLessThan(0)
    expect(compareVersions('1.37.2', '1.37.1')).toBeGreaterThan(0)
  })

  it('次版本级:minor 越大越新', () => {
    expect(compareVersions('1.36.9', '1.37.0')).toBeLessThan(0)
    expect(compareVersions('1.38.0', '1.37.9')).toBeGreaterThan(0)
  })

  it('主版本级:major 越大越新', () => {
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
  })

  it('段数不一致:缺段按 0 看待', () => {
    expect(compareVersions('1.37', '1.37.0')).toBe(0)
    expect(compareVersions('1.37', '1.37.1')).toBeLessThan(0)
    expect(compareVersions('1.36', '1.37.0')).toBeLessThan(0)
  })

  it('非数字段按 0 处理,不抛错', () => {
    expect(compareVersions('1.37.beta', '1.37.0')).toBe(0)
    expect(compareVersions('1.37.next', '1.37.0')).toBe(0)
    // 全非数字 → 全 0,取相等(保守,不让含脏数据的分支炸掉)
    expect(compareVersions('x.y.z', 'a.b.c')).toBe(0)
  })

  it('符号对称:交替换位结果取反', () => {
    for (const [a, b] of [['1.0.0', '2.0.0'], ['1.2.3', '1.2.4'], ['3.0', '3.0.1'], ['0.5', '0.5']] as const) {
      const forward = compareVersions(a, b)
      const backward = compareVersions(b, a)
      expect(backward).toBe(forward === 0 ? 0 : -Math.sign(forward))
    }
  })
})

describe('APP_VERSION · 与 package.json 同源', () => {
  it('读的是 package.json 的 version 字段', () => {
    expect(APP_VERSION).toBe(pkg.version)
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
