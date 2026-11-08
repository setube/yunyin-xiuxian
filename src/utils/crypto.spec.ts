import { describe, expect, it } from 'vitest'
import { decryptSave, encryptSave, readSaveText } from './crypto'
import CryptoJS from 'crypto-js'

/**
 * 「外来密文」的来源:整包 CryptoJS。
 * `scripts/lib/saveFixture.mjs` 与 `scripts/layout-check.mjs` 都用整包写法加密,
 * 产品的 `crypto.ts` 现在按子模块取(`crypto-js/aes`)—— 这里拿整包当对端验证。
 * 测试文件不进产物,引整包不影响包体。
 */
const LEGACY_AES = CryptoJS.AES
const LEGACY_ENC = CryptoJS.enc
const SECRET = 'yunyin-xiuxian::dao-in-the-clouds::v1'

describe('存档加密', () => {
  it('加解密往返一致', () => {
    const plain = JSON.stringify({ name: '顾望舒', exp: { m: 1.23, e: 45 } })
    const cipher = encryptSave(plain)
    expect(cipher).not.toBe(plain)
    expect(cipher.startsWith('{')).toBe(false)
    expect(decryptSave(cipher)).toBe(plain)
  })

  it('每次加密盐值不同,但都能解回', () => {
    const a = encryptSave('道')
    const b = encryptSave('道')
    expect(a).not.toBe(b)
    expect(decryptSave(a)).toBe('道')
    expect(decryptSave(b)).toBe('道')
  })

  it('非密文解密返回 null', () => {
    expect(decryptSave('{"plain":"json"}')).toBeNull()
    expect(decryptSave('随便一段文本')).toBeNull()
  })

  it('readSaveText 兼容旧版明文', () => {
    expect(readSaveText('{"a":1}')).toBe('{"a":1}')
    expect(readSaveText(encryptSave('{"a":1}'))).toBe('{"a":1}')
  })

  /**
   * 密文格式是**存档兼容面**:已落盘的存档、玩家导出的文件、三个 QA 夹具脚本
   * (`scripts/lib/saveFixture.mjs` / `layout-check.mjs` 自己用整包 CryptoJS 加密)
   * 都按 OpenSSL 格式互认。
   *
   * `crypto.ts` 改用子模块 `crypto-js/aes` 后产物少了整包那一大截,
   * 但若哪天有人顺手换了盐长度、KDF 或格式化器,老存档会**全部解不开**,
   * 而那时测试里的往返用例(自己加密、自己解密)照样全绿 —— 它证明不了对外兼容。
   * 这里钉住密文头与一段固定密文的可解性。
   */
  it('密文仍是带盐的 OpenSSL 格式 —— 整包 CryptoJS 写得出的,这里得解得开', () => {
    const plain = JSON.stringify({ game: 'yunyin-xiuxian', data: { x: 1 } })
    expect(encryptSave(plain).startsWith('U2FsdGVkX1'), '密文头须是 U2FsdGVkX1(Salted__)').toBe(true)
    // 用整包 CryptoJS 的写法加密(与 scripts/lib/saveFixture.mjs 同一路),须解回原文
    const foreign = LEGACY_AES.encrypt(plain, SECRET).toString()
    expect(foreign.startsWith('U2FsdGVkX1')).toBe(true)
    expect(decryptSave(foreign), '整包写的密文,子模块这边解不开 —— 老存档与夹具都会失效').toBe(plain)
    // 反向:这边写的,整包 CryptoJS 须解得开
    expect(LEGACY_AES.decrypt(encryptSave(plain), SECRET).toString(LEGACY_ENC.Utf8)).toBe(plain)
  })
})
