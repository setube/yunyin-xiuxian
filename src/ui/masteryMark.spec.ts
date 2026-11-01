/**
 * 满级标记:装备强化到顶、法宝祭炼满重。
 *
 * 这两件都是玩家投入后才有的一次「到底了」,而原先的表现只有一个颜色差
 * (`+N` 与祭炼格变金色)—— 金色是「好」,但不是「到头了」:
 * 一个 +9 与一个 +10 在 40px 的格子上没有形状差别。
 *
 * 与 `qualityAura` 必须是两套语言:品阶是掉落时定下的、满级是玩家挣来的。
 * 混用会让玩家以为「发光的都是强化过的」,所以本条同时钉住两者形状不重叠。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { artifactMastery, equipMastery } from './masteryMark'
import { ARTIFACT_MAX_LEVEL } from '@/data/artifacts'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const EQUIPMENT_CARD = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentCard.vue'), 'utf-8')
const ARTIFACT_PANEL = readFileSync(resolve(ROOT, 'src/components/inventory/ArtifactPanel.vue'), 'utf-8')

describe('满级标记 · 玩家挣来的状态要有形状', () => {
  it('法宝:满重才标,差一重不标', () => {
    expect(artifactMastery(0)).toBeNull()
    expect(artifactMastery(ARTIFACT_MAX_LEVEL - 1)).toBeNull()
    expect(artifactMastery(ARTIFACT_MAX_LEVEL)?.label).toBe('祭炼已满')
    // 超上限(坏档)同样算满,不给「已满 +12」这种读法
    expect(artifactMastery(ARTIFACT_MAX_LEVEL + 5)?.label).toBe('祭炼已满')
  })

  it('装备:达到传入的上限才标 —— 上限随炼器台等级走,由调用方给', () => {
    // 零级炼器台(上限 10)
    expect(equipMastery(0, 10)).toBeNull()
    expect(equipMastery(9, 10)).toBeNull()
    expect(equipMastery(10, 10)?.label).toBe('强化至顶')
    // 炼器台升满(上限 15):+10 就不再是顶
    expect(equipMastery(10, 15)).toBeNull()
    expect(equipMastery(15, 15)?.label).toBe('强化至顶')
  })

  it('认不出等级或上限时不标 —— 标记是加成,判不出来宁可不加', () => {
    expect(equipMastery(Number.NaN, 10)).toBeNull()
    expect(equipMastery(10, Number.NaN)).toBeNull()
    expect(equipMastery(10, 0)).toBeNull()
    expect(artifactMastery(Number.NaN)).toBeNull()
  })

  it('与品阶光环是两套形状:满级用顶边横杠,不用角饰也不用发光', () => {
    const bar = /\.mastery-bar \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(bar, '缺 .mastery-bar').not.toBe('')
    // 横杠是一条实心边,不是边框盒
    expect(bar, '满级标记应是实心横杠').toContain('height: 2px')
    expect(bar, '满级标记不该复用光环的角饰语言').not.toContain('border-radius: inherit')
    // 品阶光环用 --q-tone(品阶色),满级用固定金色 —— 颜色也不能撞
    expect(bar, '满级标记不该吃品阶色').not.toContain('--q-tone')
    expect(bar, '满级标记用金色').toContain('--color-gold-ink-rgb')
  })

  it('两套主题都保得住:日主题的 gold 偏褐,细条要加深', () => {
    const light = /html\[data-theme='light'\] \.mastery-bar \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    const dark = /html\[data-theme='dark'\] \.mastery-bar \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(light, '缺日主题的满级标记覆盖').not.toBe('')
    expect(dark, '缺夜主题的满级标记覆盖').not.toBe('')
    expect(light, '日主题应加深一档(amber-ink)').toContain('--color-amber-ink-rgb')
  })

  it('两处卡都接上了,且带可访问说法', () => {
    expect(EQUIPMENT_CARD, '装备格应渲染满级横杠').toContain('class="mastery-bar"')
    expect(EQUIPMENT_CARD, '装备格的读屏说法应带上标记').toContain('mastery.label')
    expect(ARTIFACT_PANEL, '法宝卡应渲染满级横杠').toContain('class="mastery-bar"')
    expect(ARTIFACT_PANEL, '法宝卡的满重判定走 masteryMark').toContain('artifactMastery(a.level)')
  })
})
