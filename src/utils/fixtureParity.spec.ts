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

const layoutCheck = readFileSync(resolve(ROOT, 'scripts/layout-check.mjs'), 'utf-8')

describe('夹具 · 存档格式与产品代码同源', () => {
  /**
   * `layout-check.mjs` 也自己写了一份密钥与加密函数 —— 它不通过 saveFixture,
   * 是另一条独立的注入路径。这两处此前各抄了 23 遍,现已抽成模块级常量;
   * 这一条钉住「只留一处」,免得哪天又复制回去。
   */
  it('layout-check 只留一份密钥与加密函数', () => {
    const secret = layoutCheck.match(/const SAVE_SECRET = '([^']+)'/g) ?? []
    expect(secret, 'layout-check 里 SAVE_SECRET 出现不止一次 —— 又抄回去了').toHaveLength(1)
    expect(layoutCheck.match(/CryptoJS\.AES\.encrypt/g) ?? [], '加密函数不该出现多份').toHaveLength(1)
    expect(/const SAVE_SECRET = '([^']+)'/.exec(layoutCheck)?.[1], 'layout-check 的密钥与产品不一致').toBe(
      /SAVE_SECRET\s*=\s*['"]([^'"]+)['"]/.exec(product)?.[1],
    )
  })

  it('两边用同一个密钥', () => {
    const a = /SAVE_SECRET\s*=\s*['"]([^'"]+)['"]/.exec(product)?.[1]
    const b = /SAVE_SECRET\s*=\s*['"]([^'"]+)['"]/.exec(fixture)?.[1]
    expect(a, '产品代码里没找到 SAVE_SECRET').toBeTruthy()
    expect(b, '夹具里没找到 SAVE_SECRET').toBeTruthy()
    expect(b, '夹具的密钥与 crypto.ts 不一致 —— 夹具写出的密文游戏解不开').toBe(a)
  })

  /**
   * 算法判据认的是 `AES.encrypt` 这件事本身,不认它挂在哪个名字上。
   * 产品侧从 `import CryptoJS from 'crypto-js'`(整包)改成子模块 `crypto-js/aes` 后
   * 调用点写作 `AES.encrypt(...)` —— 算法没变,密文格式也没变,
   * 但按老写法钉 `CryptoJS.AES.encrypt` 会把这次纯性能改动误判成「换了算法」。
   */
  it('两边用同一个加密算法', () => {
    expect(product, '产品侧须调 crypto-js 的 AES.encrypt').toContain('AES.encrypt(')
    expect(fixture, '夹具换算法了?须与 crypto.ts 的 AES 一致').toContain('CryptoJS.AES.encrypt')
  })

  it('两边的键前缀一致', () => {
    const a = /SAVE_PREFIX\s*=\s*['"]([^'"]+)['"]/.exec(storage)?.[1]
    const b = /SAVE_PREFIX\s*=\s*['"]([^'"]+)['"]/.exec(fixture)?.[1]
    expect(b, '夹具的键前缀与 storage.ts 不一致 —— 游戏读不到夹具写的档').toBe(a)
  })

  it('夹具的 JSON 序列化与产品一致', () => {
    // 夹具写 JSON.stringify(slice),产品读 JSON.parse(明文);直接对比两处写法
    expect(fixture).toContain('JSON.stringify(slice)')
    expect(product, '产品的加密入口须仍是 AES.encrypt(plain, 密钥) 这一形态').toContain('AES.encrypt(plain')
  })

  /**
   * 分片里的**字段名**也须与 store 对得上。
   *
   * 上面几条只钉加密格式 —— 密钥与算法对了,字段名写错时仍然解得出、水合得上,
   * 只是那一片被 Vue 当成未知键**静默忽略**:脚本照跑,跑的是空账。
   * 实测 `resources: { herb: 900 }` 一直没生效过(resources 里 herb 是 computed,
   * 可写的是 herbByGrade 按品阶分账),于是五个 QA 脚本里灵草全是 0,
   * 炼丹页的「神品灵草 ×N」与背包材料页的灵草格一直拿空数据在测。
   */
  it('夹具写的资源字段名与 store 对得上', () => {
    const resourcesSrc = readFileSync(resolve(ROOT, 'src/stores/resources.ts'), 'utf-8')
    // 夹具里 resources 那一段的顶层键
    const block = /resources: \{([\s\S]*?)\n {4}\}/.exec(fixture)?.[1] ?? ''
    expect(block, '夹具里找不到 resources 分片,判据空转').not.toBe('')
    const keys = [...block.matchAll(/^ {6}(\w+):/gm)].map(m => m[1]!)
    expect(keys.length, '一个字段都没扫到,判据空转').toBeGreaterThan(3)
    // store 的可写字段:ref(...) 的声明 + smallRefs 的四个键
    const writable = new Set([
      ...[...resourcesSrc.matchAll(/const (\w+) = ref[<(]/g)].map(m => m[1]!),
      ...[...resourcesSrc.matchAll(/smallRefs[^=]*= \{([^}]+)\}/g)].flatMap(m =>
        (m[1] ?? '').split(',').map(x => x.trim().split(':')[0]!.trim())
      )
    ])
    expect(writable.has('spiritStone') && writable.has('herbByGrade'), '可写字段抓取失败').toBe(true)
    const unknown = keys.filter(k => !writable.has(k))
    expect(unknown, `这些字段名 store 里不存在,写进去会被静默忽略:${unknown.join(', ')}`).toEqual([])
  })
})
