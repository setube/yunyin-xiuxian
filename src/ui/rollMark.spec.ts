/**
 * 词条掷值的形制:同一条「攻击 +12」,掷到 0.95 与掷到 0.15 是两种东西。
 *
 * 而详情里此前只有一个「浮 95%」的读数 —— 与「浮 15%」长得一模一样。
 * 那是装备里最本质的「运气」,界面上却完全没有形制。
 *
 * 四条判据:
 *   一 三档边界取自 data/constants,不另立阈值
 *   二 只给满档重形制(与 luster 同一条:每档都加,等于每档都没有)
 *   三 坏值退回「常」,不画错的档
 *   四 界面真的接上了,且与智能收纳同一根线
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SMART_KEEP_PERFECT_ROLL } from '@/data/constants'
import { ROLL_GRADE_NAMES, allRollsApex, rollMark } from './rollMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const DETAIL = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentDetailDialog.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/rollMark.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('掷值档 · 一、边界取自 constants', () => {
  it('满档下沿就是智能收纳的保留线', () => {
    expect(rollMark(SMART_KEEP_PERFECT_ROLL).grade, '恰好等于阈值时应算满').toBe('apex')
    expect(rollMark(SMART_KEEP_PERFECT_ROLL - 0.01).grade, '差一点就是良').toBe('good')
    expect(rollMark(1).grade).toBe('apex')
  })

  it('阈值不在形制层另写一份', () => {
    expect(MODULE, '应自 constants 引入').toContain('SMART_KEEP_PERFECT_ROLL')
    // 不该出现手抄的 0.85
    expect(MODULE, '不该手抄阈值').not.toMatch(/0\.85/)
  })

  it('良档下沿是过半 —— 这是手感线,不进 constants', () => {
    expect(rollMark(0.5).grade).toBe('good')
    expect(rollMark(0.49).grade).toBe('plain')
  })

  it('三档各有档名,常档为空串(调用点据此不印)', () => {
    expect(ROLL_GRADE_NAMES.apex).toBeTruthy()
    expect(ROLL_GRADE_NAMES.good).toBeTruthy()
    expect(ROLL_GRADE_NAMES.plain, '常档不印,留空').toBe('')
    expect(rollMark(0.1).name).toBe('')
  })
})

describe('掷值档 · 二、只给满档重形制', () => {
  it('满档带描边,良档只转色不加框 —— 落差才是稀有感的来源', () => {
    const apex = block('.affix-roll--apex')
    const good = block('.affix-roll--good')
    expect(apex, '缺满档样式').not.toBe('')
    expect(good, '缺良档样式').not.toBe('')
    expect(apex, '满档应有描边').toContain('border:')
    expect(good, '良档不该有描边').not.toContain('border:')
  })

  it('满档用金,良档不用金 —— 金在这一屏是稀缺的', () => {
    expect(block('.affix-roll--apex'), '满档应取金').toContain('gold-ink')
    expect(block('.affix-roll--good'), '良档不该也用金').not.toContain('gold-ink')
  })

  it('常档不挂类 —— 没有 .affix-roll--plain 这条规则', () => {
    expect(block('.affix-roll--plain'), '常档不该有样式').toBe('')
  })

  it('三种档名说法不重复,满档要说得比良档多一层', () => {
    const apex = rollMark(0.95)
    const good = rollMark(0.7)
    expect(apex.label, '满档应写出「近满」').toContain('近满')
    expect(good.label, '良档只说读数').not.toContain('近满')
    expect(apex.pct).toBe(95)
    expect(good.pct).toBe(70)
  })
})

describe('掷值档 · 三、坏值不画错', () => {
  it('缺 roll / NaN 一律按常档', () => {
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rollMark(bad).grade, `${String(bad)} 应退回常档`).toBe('plain')
      expect(rollMark(bad).name).toBe('')
    }
  })

  it('越界夹回 0~1,但读数不骗人', () => {
    expect(rollMark(-3).grade).toBe('plain')
    expect(rollMark(-3).pct).toBe(0)
    expect(rollMark(9).grade).toBe('apex')
    expect(rollMark(9).pct, '越界应夹到 100').toBe(100)
  })
})

/**
 * 整件「全满」。
 *
 * 一件装备所有词条同时达满档是运气极点,也是智能收纳里「词条近满件永不自动处置」
 * 的同一根线 —— 但那边是裁决(留不留),这里是形制(惊不惊喜)。
 */
describe('掷值档 · 全满整件', () => {
  it('条条满档才算全满;有一条没满就不算', () => {
    expect(allRollsApex([1, 0.99, 0.9])).toBe(true)
    expect(allRollsApex([1, 0.99, 0.8]), '有一条掉到良档就不算').toBe(false)
    expect(allRollsApex([0.9, 0.3])).toBe(false)
  })

  it('0 条词条不算全满 —— 空装备不该戴运气极点的记号', () => {
    expect(allRollsApex([])).toBe(false)
  })

  it('坏值不算满 —— 与单条掷值档同一条兜底', () => {
    expect(allRollsApex([1, Number.NaN]), 'NaN 按常档,不该混成全满').toBe(false)
    expect(allRollsApex([1, undefined])).toBe(false)
  })

  it('与智能收纳的完美词条判据同一根线,不许分叉', () => {
    // 两边都读 SMART_KEEP_PERFECT_ROLL;任一处改成别的阈值,本条即红
    const smartKeep = readFileSync(resolve(ROOT, 'src/core/smartKeep.ts'), 'utf-8')
    const src = readFileSync(resolve(ROOT, 'src/ui/rollMark.ts'), 'utf-8')
    expect(src, '形制层应读同一个阈值').toContain('SMART_KEEP_PERFECT_ROLL')
    expect(smartKeep, '收纳层也应读同一个阈值').toContain('SMART_KEEP_PERFECT_ROLL')
    // 恰好等于阈值:两边都应判满
    expect(allRollsApex([SMART_KEEP_PERFECT_ROLL])).toBe(true)
  })

  it('全满有自己的一枚记号,且只在详情挂', () => {
    expect(DETAIL, '详情应算全满').toContain('allRollsApex(')
    expect(DETAIL, '应有读屏说法').toContain('aria-label="词条全满"')
    expect(block('.affix-full'), '缺全满样式').not.toBe('')
  })

  it('全满记号不与满级签混成同一件事', () => {
    // 满级是练出来的,全满是掷运 —— 两个独立条件、两套类名
    expect(DETAIL, '满级签与全满签应是两个独立条件').toMatch(/v-if="mastery"[\s\S]{0,400}v-if="allApex"/)
    expect(block('.affix-full'), '全满不该复用满级签的类名').not.toBe(block('.mastery-bar'))
  })
})

describe('掷值档 · 四、界面接上了', () => {
  it('装备详情的词条行挂掷值档', () => {
    expect(DETAIL, '词条行应读形制').toContain('rollGrade: rollMark(line.roll)')
    expect(DETAIL, '应挂类名').toContain('affix-roll--')
    expect(DETAIL, '应印档的读法').toContain('line.rollGrade.label')
  })

  it('读数仍来自同一份,不再另调 affixRollText', () => {
    // 形制自己给出读数,模板不必再调一次纯函数
    const tpl = DETAIL.slice(0, DETAIL.indexOf('<script'))
    expect(tpl, '模板不该再调 affixRollText').not.toContain('affixRollText(')
    expect(DETAIL, '不应再引入 affixRollText').not.toMatch(/import \{[^}]*affixRollText/)
  })

  it('稀有度 meta 与掷值档各算一次,模板不反复查表', () => {
    expect(DETAIL, '稀有度应预计算').toContain('meta: AFFIX_RARITY_META[line.rarity]')
    const tpl = DETAIL.slice(0, DETAIL.indexOf('<script'))
    expect(tpl, '模板不该再调 AFFIX_RARITY_META').not.toContain('AFFIX_RARITY_META')
    expect(tpl, '模板不该再调 rollMark').not.toContain('rollMark(')
  })

  it('形制不吃指针事件 —— 它只是标记,不是控件', () => {
    expect(block('.affix-roll'), '掷值档不该吃指针事件').toContain('pointer-events: none')
  })
})
