/**
 * 明文存档不许被误当密文(导入兼容旧版明文 JSON)。
 * CryptoJS 的 Base64 解析跳过非法字符,明文 JSON 约 0.6% 会解出非空乱码。
 * 故障注入:去掉 decryptSave 开头的密文头检查,第一条用例红(2000 条里 11 条中招)。
 */
import { describe, expect, it } from 'vitest'
import { decryptSave, encryptSave, readSaveText } from './crypto'
import { SAVE_SERIALIZER } from './storage'

/** 毫秒基准:2026-01-01;样本只有时间戳不同 */
const BASE_AT = 1767225600000

function plainEnvelope(exportedAt: number): string {
  return JSON.stringify({
    game: 'yunyin-xiuxian',
    version: 2,
    exportedAt,
    data: { game: { started: true }, player: null }
  })
}

describe('明文存档 · 不许被误当密文', () => {
  it('一批明文(时间戳逐条变化)全部原样读回', () => {
    // 2000 条足以稳定暴露
    const bad: string[] = []
    for (let i = 0; i < 2000; i++) {
      const text = plainEnvelope(BASE_AT + i)
      if (readSaveText(text) !== text) bad.push(String(BASE_AT + i))
    }
    expect(bad, `这些明文被误读了:${bad.slice(0, 5).join('、')}`).toEqual([])
  })

  it('明文根本不进解密 —— 不会被「解」出任何东西', () => {
    const text = plainEnvelope(BASE_AT)
    expect(decryptSave(text), '明文不该被当密文解出乱码').toBeNull()
    expect(() => JSON.parse(readSaveText(text))).not.toThrow()
  })

  it('真密文仍解得开 —— 修的是误判,不是把解密关掉', () => {
    const plain = JSON.stringify({ game: 'yunyin-xiuxian', data: { x: 1 } })
    const cipher = encryptSave(plain)
    expect(cipher.startsWith('U2FsdGVkX1'), '本项目的密文都带 Salted__ 头').toBe(true)
    expect(decryptSave(cipher)).toBe(plain)
    expect(readSaveText(cipher)).toBe(plain)
  })

  /** 测 store 真正调用的 SAVE_SERIALIZER.deserialize;序列化器另写解码、绕过 readSaveText 会复发 */
  it('存档序列化器读明文也不许翻车(真正被 store 调用的那一段)', () => {
    const data = { game: { started: true }, player: { exp: 42 } }
    expect(SAVE_SERIALIZER.deserialize(plainEnvelope(BASE_AT))).toMatchObject({ version: 2 })
    expect(SAVE_SERIALIZER.deserialize(SAVE_SERIALIZER.serialize(data))).toEqual(data)
  })
})
