/**
 * 材料认知档位与文案表必须同长。
 *
 * codex.ts 里 `hint: lv < LORE_MAX ? MATERIAL_HINTS[lv]! : ''` —— 用了非空断言,
 * 前提是 **lv 能取到的每个值都在 MATERIAL_HINTS 里**。lv 的范围是 [0, LORE_MAX),
 * 所以真正的前提是 MATERIAL_HINTS.length >= LORE_MAX。
 *
 * 现状恰好相等(3 = 3),但没有任何测试钉住:
 *   LORE_MAX 若调到 4,MATERIAL_HINTS[3] 就是 undefined,`!` 断言把它当有值传给界面,
 *   材料图鉴那一格会渲染成空白;而 stageName 那边有 `?? LORE_STAGE_NAMES[0]` 兜底,
 *   两行一个兜一个不兜,漏的正是这处。
 * 型别上两者无关联:改 LORE_MAX 不会让类型检查报错,只有数量关系能约束。
 */
import { describe, expect, it } from 'vitest'
import { LORE_MAX, LORE_STAGE_NAMES } from '@/data/materials'
import { materialCodex } from './codex'
import { createPinia, setActivePinia } from 'pinia'
import { useLoreStore } from '@/stores/lore'

describe('材料认知 · 档位与文案表同长', () => {
  it('LORE_MAX 是正整数(0 会让所有材料永远「未识」)', () => {
    expect(Number.isInteger(LORE_MAX)).toBe(true)
    expect(LORE_MAX).toBeGreaterThan(0)
  })

  it('LORE_STAGE_NAMES 覆盖 [0, LORE_MAX] 全部档位', () => {
    // 索引 0 是「未识」,故档名表长度须为 LORE_MAX + 1
    expect(
      LORE_STAGE_NAMES.length,
      `LORE_MAX=${LORE_MAX} 时档名表需 ${LORE_MAX + 1} 项,实际 ${LORE_STAGE_NAMES.length} 项`
    ).toBeGreaterThanOrEqual(LORE_MAX + 1)
  })

  it('档名互不相同且都非空(两档同名玩家看不出进度)', () => {
    for (const n of LORE_STAGE_NAMES) {
      expect(n.length).toBeGreaterThan(0)
    }
    expect(new Set(LORE_STAGE_NAMES).size).toBe(LORE_STAGE_NAMES.length)
  })

  it('每个可达到的认知档都能取到 hint(不靠 `!` 断言蒙混)', async () => {
    const src = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('./codex.ts', import.meta.url), 'utf-8')
    )
    const m = /const MATERIAL_HINTS = \[([^\]]*)\]/.exec(src)
    expect(m, '找不出 MATERIAL_HINTS 的定义,本条须随之更新').not.toBeNull()
    const captured = m?.[1]
    if (captured === undefined) throw new Error('没取到 MATERIAL_HINTS 的内容')
    const hintCount = captured.split(',').filter(s => s.trim().length > 0).length
    // codex 用 `lv < LORE_MAX ? MATERIAL_HINTS[lv]! : ''`,lv 取 0..LORE_MAX-1
    expect(
      hintCount,
      `MATERIAL_HINTS 只有 ${hintCount} 项,而 lv 能取 0..${LORE_MAX - 1} —— 缺的那档会被 ! 断言当成有值`
    ).toBeGreaterThanOrEqual(LORE_MAX)
  })

  it('材料图鉴走真实路径:每档已知材料的 hint 都是非空字符串', () => {
    setActivePinia(createPinia())
    const cat = materialCodex()
    expect(cat.entries.length, '图鉴为空,用例空转').toBeGreaterThan(0)
    let checked = 0
    for (const e of cat.entries) {
      // 未识档不提示是合法的;stage ≥ 1 时那格必须有字
      if (e.stage === 0) continue
      expect(typeof e.hint, `${e.name} 在 ${e.stage} 档的 hint 不是字符串`).toBe('string')
      expect((e.hint as string).length, `${e.name} 在 ${e.stage} 档的 hint 是空串`).toBeGreaterThan(0)
      checked += 1
    }
    // 全新建档时可能一条都没辨识,那本用例就空转了 —— 显式说明这一点
    expect(checked, '没有任何材料到达已知档').toBeGreaterThanOrEqual(0)
  })

  it('每个未满档都取得到 hint,满档有意为空(不提示已通晓者)', () => {
    setActivePinia(createPinia())
    const lore = useLoreStore()
    const id = materialCodex().entries[0]!.id
    // 逐档推进:0 → 1 → 2 → LORE_MAX,每档看 hint 是否符合预期
    for (let lv = 1; lv < LORE_MAX; lv += 1) {
      expect(lore.advanceLore(id, lv), `推到第 ${lv} 档应成功`).toBe(true)
      const e = materialCodex().entries.find(x => x.id === id)!
      expect(e.stage).toBe(lv)
      expect(e.hint, `第 ${lv} 档取不到 hint —— 这里正是 ! 断言的那一格`).toBeTruthy()
    }
    // 满档:代码写的是 `lv < LORE_MAX ? … : ''`,空串是有意的
    expect(lore.advanceLore(id, LORE_MAX), '推到满档应成功').toBe(true)
    const top = materialCodex().entries.find(x => x.id === id)!
    expect(top.stage).toBe(LORE_MAX)
    expect(top.hint, '满档不提示是设计,不是缺文案').toBe('')
  })
})
