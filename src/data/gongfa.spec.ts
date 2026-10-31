/**
 * 功法满级的两处默认值必须一致。
 *
 * 满级在项目里有两处独立写法:
 *   g() 工厂       :maxLevel: opts.maxLevel ?? (type === 'secret' ? 3 : 9)
 *   gongfaMaxLevel :def?.maxLevel ?? (def?.type === 'secret' ? 3 : 9)
 *
 * 第二处的注释特意警告过:「别处写 `?? 9` 会把漏配 maxLevel 的秘术练到 9 层」——
 * 一旦两处的型默认分叉,界面按一处判满级、实际按另一处算层数,就会出现
 * 「显示已满级却还能再练」或「练到 9 层仍显示未满」。
 *
 * 本条不复制那两个数字,只验证「同一份数据经两处得到同一答案」。
 *
 * 已知覆盖缺口(实测得出):把 g() 工厂的默认值也改成 `?? 9` 时,本条仍然全绿 ——
 * 因为 g() 构造时就把 maxLevel 写进了对象,gongfaMaxLevel 永远走 `def.maxLevel` 分支,
 * 走不到自己的 `??` 兜底。两处的默认值只在「数据漏配」时才会各自生效,生产数据里不触发。
 * 工厂侧改由下一条「数据里的秘术满级是 3」覆盖 —— 它直接断言真实数据,
 * 工厂默认值一旦分叉,新建的秘术就会写成 9 层,那条即红。
 */
import { describe, expect, it } from 'vitest'
import type { GongfaDef } from '@/types'
import { GONGFA, gongfaDef, gongfaMaxLevel } from '@/data/gongfa'

describe('功法满级 · 两处默认值同源', () => {
  it('每条真实功法:gongfaMaxLevel 与自身 maxLevel 一致', () => {
    let checked = 0
    for (const def of GONGFA) {
      expect(def.maxLevel, `「${def.name}」没有 maxLevel`).toBeDefined()
      expect(gongfaMaxLevel(def), `「${def.name}」的满级判定与数据不符`).toBe(def.maxLevel)
      checked += 1
    }
    expect(checked, '功法表为空,用例空转').toBeGreaterThan(0)
  })

  it('按 id 查回来再判,结果不变(查表链路无损)', () => {
    for (const def of GONGFA) {
      const back = gongfaDef(def.id)
      expect(back, `「${def.id}」查不回来`).toBeDefined()
      expect(gongfaMaxLevel(back)).toBe(def.maxLevel)
    }
  })

  it('漏配 maxLevel 时按型给默认:秘术 3、主辅 9', () => {
    // 手工造三条「数据漏配」的 def,模拟老存档或未来新增条目忘了写 maxLevel 的情形
    const bare = (type: GongfaDef['type']): GongfaDef =>
      ({ id: 'x', name: 'x', type, desc: '', element: 'metal' }) as unknown as GongfaDef
    expect(gongfaMaxLevel(bare('secret')), '秘术的默认满级是 3,不是 9').toBe(3)
    expect(gongfaMaxLevel(bare('main'))).toBe(9)
    expect(gongfaMaxLevel(bare('sub'))).toBe(9)
  })

  it('undefined 也能给出安全默认,不抛错', () => {
    expect(() => gongfaMaxLevel(undefined)).not.toThrow()
    expect(gongfaMaxLevel(undefined), 'undefined 按非秘术处理').toBe(9)
  })

  it('数据里的秘术满级是 3,主修与辅修是 9 —— 注释警告的实质 (注释说别处写 `?? 9` 会把秘术练到 9 层)', () => {
    const secrets = GONGFA.filter(g => g.type === 'secret')
    expect(secrets.length, '没有秘术,说明数据变了').toBeGreaterThan(0)
    for (const s of secrets) {
      expect(s.maxLevel, `秘术「${s.name}」的满级不是 3,会与主辅混同`).toBe(3)
    }
    for (const g of GONGFA) {
      if (g.type === 'secret') continue
      expect(g.maxLevel, `「${g.name}」的满级不是 9`).toBe(9)
    }
  })

  it('所有功法的满级都是正整数', () => {
    for (const def of GONGFA) {
      expect(def.maxLevel, `「${def.name}」的满级 ${def.maxLevel} 不是正整数`).toBeGreaterThan(0)
      expect(Number.isInteger(def.maxLevel)).toBe(true)
    }
  })

  it('id 与 name 都不重复', () => {
    const ids = GONGFA.map(g => g.id)
    const names = GONGFA.map(g => g.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })
})
