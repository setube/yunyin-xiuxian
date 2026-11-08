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
import { affixDef, affixFitBlock } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { qualityDef } from '@/data/qualities'
import { BAG_CAPACITY } from '@/data/constants'
import { lateSlices, stressSlices } from '../../scripts/lib/saveFixture.mjs'
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
    /*
     * 读**实际返回值**的键,不解析源码文本。
     * 上一轮压测夹具的教训:文本正则看不出一层嵌套里写了什么,只认得「形似」;
     * 实际调用 read 到的键才是真的会被写进存档的东西。
     */
    const slices = lateSlices()
    const resources = (slices as unknown as { resources: Record<string, unknown> }).resources
    const keys = Object.keys(resources ?? {})
    expect(keys.length, '夹具的 resources 分片是空的,判据空转').toBeGreaterThan(3)
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
  /**
   * 各 QA 脚本里内联的 resources 夹具也要过同一道。
   *
   * 上面那条只看 lateSlices() —— 而 layout-check / detail-geometry 里另有二十几处
   * 自己写的 resources 字面量,一直写着 `herb: 900` 这种不生效的字段:
   * herb 在 store 里是 computed(由 herbByGrade 求和),写进去被 Vue 当未知键静默忽略,
   * 于是两脚本的灵草全是 0,炼丹页「灵草 ×N」与背包材料格一直在拿空数据量。
   */
  it('各 QA 脚本内联的资源夹具字段名同样有效', () => {
    const resourcesSrc = readFileSync(resolve(ROOT, 'src/stores/resources.ts'), 'utf-8')
    const writable = new Set([
      ...[...resourcesSrc.matchAll(/const (\w+) = ref[<(]/g)].map(m => m[1]!),
      ...[...resourcesSrc.matchAll(/smallRefs[^=]*= \{([^}]+)\}/g)].flatMap(m =>
        (m[1] ?? '').split(',').map(x => x.trim().split(':')[0]!.trim())
      )
    ])
    /*
     * 只看真正的夹具字面量:herb 后跟数字。
     * `herb: (() => {...})()` 是 DOM 查询结果的变量名,不是夹具字段,不在此列。
     */
    const reports: string[] = []
    let scanned = 0
    for (const rel of ['scripts/layout-check.mjs', 'scripts/detail-geometry.mjs', 'scripts/edge-states.mjs', 'scripts/lib/saveFixture.mjs']) {
      const src = readFileSync(resolve(ROOT, rel), 'utf-8')
      /*
       * 只取 resources 对象的**第一层**键:块里可能嵌着 herbByGrade: { 1: .., 2: .. }
       * 与 spiritStone: { m: .., e: .. },那两层里的键不是字段名。
       * 故按花括号深度走一遍,只收深度为 1 时出现的 `key:`。
       */
      for (const m of src.matchAll(/resources:\s*\{([\s\S]*?)\n?\s*\}/g)) {
        scanned += 1
        const body = m[1] ?? ''
        let depth = 0
        for (let i = 0; i < body.length; i += 1) {
          const ch = body[i]
          if (ch === '{') {
            depth += 1
            continue
          }
          if (ch === '}') {
            depth -= 1
            continue
          }
          if (depth !== 0) continue
          // 深度 0 处、位于 { 或 , 之后:读一个标识符 + 冒号
          const atKeyStart = i === 0 || /[{,]/.test(body.slice(0, i).trimEnd().slice(-1))
          if (!atKeyStart) continue
          const km = /^(\w+)\s*:/.exec(body.slice(i))
          if (!km) continue
          const key = km[1]!
          if (key === 'herb') {
            reports.push(`${rel}: resources.herb 是 computed,写进去不生效 —— 该写 herbByGrade`)
          } else if (!writable.has(key)) {
            reports.push(`${rel}: resources.${key} 在 store 里不存在`)
          }
          i += km[0].length - 1
        }
      }
    }
    expect(scanned, '一处 resources 字面量都没扫到,判据空转').toBeGreaterThan(10)
    expect(reports, `这些字段写进去会被静默忽略:\n${reports.join('\n')}`).toEqual([])
  })
})

/**
 * 性能压测夹具的合法性 —— **实际调用** stressSlices(),不靠源码文本猜。
 *
 * `perf-profile --stress` 铺 120 件满词条神品来代表玩家能堆到的最大负载。
 * 夹具里任一条不成立,`inventory.sanitize()` 就会静默剔除那一件或那一条 ——
 * 压测照跑、门照旧报绿,量的却不是声称的最大负载。
 *
 * 首版这条判据是源码正则:只查「id 出现在 affixes 数组里」,于是
 * 模板阶数不符、品质被改、槽位错位、uid 重复这些全都能溜过去。
 * 现改为调用函数读返回值 —— 一次调用能同时钉住所有这些。
 */
describe('性能压测夹具 · 实际调用后每一条都成立', () => {
  const slices = stressSlices()
  const inv = slices.inventory
  const items = inv.items

  it('物品数正好是 BAG_CAPACITY', () => {
    expect(items.length, `夹具该铺满 ${BAG_CAPACITY} 件,实际 ${items.length} 件`).toBe(BAG_CAPACITY)
  })

  it('每件都是神品,且阶数与模板阶数一致', () => {
    const cap = qualityDef('divine').affixes[1]
    for (const it of items) {
      expect(it.quality, `${it.uid} 不是神品`).toBe('divine')
      const tpl = equipmentTemplate(it.templateId)
      expect(tpl, `${it.uid} 的模板 ${it.templateId} 不存在`).toBeTruthy()
      expect(it.tier, `${it.uid} 的 tier 与模板 ${it.templateId} 的阶数不符`).toBe(tpl!.tier)
      expect(it.affixes.length, `${it.uid} 只有 ${it.affixes.length} 条词条,神品上限是 ${cap}`).toBe(cap)
    }
  })

  it('每条词条都存在,且与该件的槽位相容', () => {
    const rank = qualityDef('divine').rank
    for (const it of items) {
      const tpl = equipmentTemplate(it.templateId)!
      for (const a of it.affixes) {
        const def = affixDef(a.id)
        expect(def, `${it.uid} 的词条 ${a.id} 不存在`).toBeTruthy()
        expect(affixFitBlock(def!, tpl.slot, rank), `${it.uid} 的词条 ${a.id} 与 ${tpl.slot} 槽不符`).toBeNull()
      }
    }
  })

  it('uid 唯一', () => {
    const uids = new Set(items.map(it => it.uid))
    expect(uids.size, `uid 有重复:${items.length} 件里只有 ${uids.size} 个不同 uid`).toBe(items.length)
  })

  it('九个可穿戴槽全穿上,且每个 uid 都真在 items 里', () => {
    const byUid = new Map(items.map(it => [it.uid, it]))
    const slots = Object.keys(inv.equipped)
    expect(slots.sort(), '九个可穿戴槽该全穿上').toEqual(
      ['belt', 'body', 'boots', 'head', 'necklace', 'ring', 'talisman', 'weapon', 'wrist'].sort()
    )
    for (const [slot, uid] of Object.entries(inv.equipped)) {
      const it = byUid.get(uid)
      expect(it, `槽 ${slot} 指向的 ${uid} 不在 items 里 —— sanitize 会把这格清空`).toBeTruthy()
      const tpl = equipmentTemplate(it!.templateId)!
      expect(tpl.slot, `槽 ${slot} 配了 ${tpl.slot} 的模板 —— sanitize 会剔掉`).toBe(slot)
    }
  })

  it('与轻量夹具的差异就是行囊这一片', () => {
    /*
     * 只比键集合,不比分片内容:lateSlices() 每次都现取时间戳(lastActiveAt 等),
     * 逐字节比对必然不等 —— 那验的是「两次调用有没有差一个毫秒」,不是夹具形状。
     */
    const base = lateSlices()
    expect(Object.keys(slices).sort(), '压测夹具该只是 lateSlices 的一个覆盖').toEqual(Object.keys(base).sort())
    // 行囊之外的分片键集合也该一致(不新增/不删)
    expect(Object.keys(inv).sort(), '行囊分片不该增删键').toEqual(Object.keys(base.inventory).sort())
  })
})
