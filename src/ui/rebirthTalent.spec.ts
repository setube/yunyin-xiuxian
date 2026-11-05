import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { talentDef } from '@/data/talents'
import { modsText } from '@/data/statNames'

describe('轮回择姿', () => {
  /**
   * 两处都要露出实际词条。
   *
   * 词条文本原先在模板里现算(`modsText(talentDef(id)!.mods)`),一个渲染周期算好几遍;
   * 现改为在 `talentRow` 里算一次、模板读 `row.modsText`。判据跟着落点走。
   */
  it('三选一与自开天资都露出实际词条', () => {
    const src = readFileSync(resolve(__dirname, '../components/character/ReincarnationDialog.vue'), 'utf8')
    expect(src, '词条文本应在 talentRow 里算一次').toContain('modsText: def ? modsText(def.mods) : \'\'')
    // 两处列表都读同一个字段
    expect((src.match(/row\.modsText/g) ?? []).length, '三选一与另得两处都要露出词条').toBeGreaterThanOrEqual(2)
    const jianxin = talentDef('t_jianxin')!
    expect(modsText(jianxin.mods)).toContain('攻击')
    // 阴性对照:另得那块不许只写名字不写词条
    expect(src).not.toMatch(/另得:[\s\S]{0,120}row\.name[\s\S]{0,40}<\/span>\s*<\/p>/)
  })
})
