/**
 * QA 夹具与产品代码的一致性命中面。
 *
 * `scripts/lib/saveFixture.mjs` 为了让五个 QA 脚本能注入后期存档,自己复述了
 * 存档格式:`yunyin.<storeId>` 键 + `CryptoJS.AES` 加密 + 同一个密钥。
 *
 * 密钥一改(或换成别的加密算法),夹具写出来的就是**解不开的密文**,
 * 而那时游戏会把它当坏档 —— 五个脚本照旧跑,只是**全跑在干净档上**,
 * 「后期存档」这一档覆盖悄悄失效。这种失效没有任何报错。
 *
 * 这一条把两边钉在一起。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const product = readFileSync(resolve(ROOT, 'src/utils/crypto.ts'), 'utf-8')
const storage = readFileSync(resolve(ROOT, 'src/utils/storage.ts'), 'utf-8')
const fixture = readFileSync(resolve(ROOT, 'scripts/lib/saveFixture.mjs'), 'utf-8')

describe('夹具 · 存档格式与产品代码同源', () => {
  it('两边用同一个密钥', () => {
    const a = /SAVE_SECRET\s*=\s*['"]([^'"]+)['"]/.exec(product)?.[1]
    const b = /SAVE_SECRET\s*=\s*['"]([^'"]+)['"]/.exec(fixture)?.[1]
    expect(a, '产品代码里没找到 SAVE_SECRET').toBeTruthy()
    expect(b, '夹具里没找到 SAVE_SECRET').toBeTruthy()
    expect(b, '夹具的密钥与 crypto.ts 不一致 —— 夹具写出的密文游戏解不开').toBe(a)
  })

  it('两边用同一个加密算法', () => {
    expect(product).toContain('CryptoJS.AES.encrypt')
    expect(fixture, '夹具换算法了?须与 crypto.ts 的 CryptoJS.AES 一致').toContain('CryptoJS.AES.encrypt')
  })

  it('两边的键前缀一致', () => {
    const a = /SAVE_PREFIX\s*=\s*['"]([^'"]+)['"]/.exec(storage)?.[1]
    const b = /SAVE_PREFIX\s*=\s*['"]([^'"]+)['"]/.exec(fixture)?.[1]
    expect(b, '夹具的键前缀与 storage.ts 不一致 —— 游戏读不到夹具写的档').toBe(a)
  })

  it('夹具的 JSON 序列化与产品一致', () => {
    // 夹具写 JSON.stringify(slice),产品读 JSON.parse(明文);直接对比两处写法
    expect(fixture).toContain('JSON.stringify(slice)')
    expect(product).toContain('CryptoJS.AES.encrypt(plain')
  })
})
