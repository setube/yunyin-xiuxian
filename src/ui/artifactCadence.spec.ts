/**
 * 法宝神通节奏形制:每隔几回合出手一次,界面上此前一处未读。
 *
 * 法宝卡只写「神通「X」:某效果」,不写它多久出手一次 ——
 * 而节奏正是法宝之间最实质的差别:同样一句「造成伤害」,
 * 三回合一次与五回合一次是两种分量。玩家要比较两件值不值得祭炼,
 * 最该先看的就是这一项。
 *
 * 四条判据:
 *   一 `interval = 1` 是「随身常在」,不是「每 1 回合」—— 语义取自数据与 core 的注释
 *   二 其余按间隔成刻度,格数等于间隔(越短越密,读出来就是「更慢」)
 *   三 坏值不画错:判不出时按随身常在,不把法宝画成「每 99 回合」
 *   四 界面真的接上了
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ARTIFACTS } from '@/data/artifacts'
import { ARTIFACT_CADENCE_MAX, cadenceMark, cadencePips } from './artifactCadence'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const PANEL = readFileSync(resolve(ROOT, 'src/components/inventory/ArtifactPanel.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('法宝节奏 · 一、interval = 1 是随身常在', () => {
  it('间隔为 1 的走「随身常在」档,不画回合刻度', () => {
    const always = ARTIFACTS.filter(a => a.active.interval <= 1)
    expect(always.length, '判据失去对象 —— 数据里没有 interval=1 的法宝').toBeGreaterThan(0)
    for (const a of always) {
      const mark = cadenceMark(a)
      expect(mark.cadence, `${a.name} 的 interval=1 应读作随身常在`).toBe('always')
      expect(mark.pips, '随身常在不该画回合刻度').toBe(0)
      expect(cadencePips(mark)).toEqual([])
      expect(mark.label).toBe('随身常在')
    }
  })

  it('间隔大于 1 的一律走「每 N 回合」', () => {
    for (const a of ARTIFACTS.filter(x => x.active.interval > 1)) {
      expect(cadenceMark(a).cadence, `${a.name} 应读作每 N 回合`).toBe('everyN')
      expect(cadenceMark(a).label).toBe(`每 ${a.active.interval} 回合一次`)
    }
  })
})

describe('法宝节奏 · 二、刻度随间隔变', () => {
  it('格数等于间隔,且全部实心 —— 表达的是「多久一次」,不是「走了多远」', () => {
    for (const a of ARTIFACTS.filter(x => x.active.interval > 1)) {
      const mark = cadenceMark(a)
      const pips = cadencePips(mark)
      expect(pips.length, `${a.name} 的格数应等于间隔`).toBe(Math.min(ARTIFACT_CADENCE_MAX, a.active.interval))
      expect(pips.every(Boolean), '这里不是进度条,格全实心').toBe(true)
    }
  })

  it('间隔越短格越少 —— 玩家读出来就是「更快」', () => {
    const three = cadencePips(cadenceMark(ARTIFACTS.find(a => a.active.interval === 3)!))
    const four = cadencePips(cadenceMark(ARTIFACTS.find(a => a.active.interval === 4)!))
    expect(three.length, '三回合一次应比四回合一次短').toBeLessThan(four.length)
  })

  it('超过满格数的间隔按满格画,不撑破一行', () => {
    const mark = cadenceMark({ active: { interval: 99 } } as never)
    expect(cadencePips(mark).length).toBe(ARTIFACT_CADENCE_MAX)
    // 读数仍报原值,刻度只是封顶
    expect(mark.label).toBe('每 99 回合一次')
  })
})

describe('法宝节奏 · 三、坏值不画错', () => {
  it('缺字段 / NaN / 负数一律按随身常在', () => {
    for (const bad of [undefined, { active: {} } as never, { active: { interval: Number.NaN } } as never, { active: { interval: -3 } } as never]) {
      const mark = cadenceMark(bad)
      expect(mark.cadence, '判不出时宁可不画回合刻度').toBe('always')
      expect(mark.pips).toBe(0)
    }
  })
})

describe('法宝节奏 · 四、界面接上了', () => {
  it('法宝卡报出节奏,并给读屏说法', () => {
    expect(PANEL, '法宝卡应报节奏').toContain('row.cadence')
    expect(PANEL, '应读形制').toContain('cadenceMark(def)')
    expect(PANEL, '回合型应画刻度').toContain('cadencePips(row.cadence)')
    expect(PANEL, '应有读屏说法').toContain('row.cadence.label')
  })

  it('随身常在型不画回合刻度,只留说法', () => {
    // 条件落在「是不是回合型」上,不是无条件渲染
    expect(PANEL, '刻度应只在回合型出现').toContain("row.cadence.cadence === 'everyN'")
  })

  it('样式存在、不吃指针事件,且只取既有 token', () => {
    expect(block('.artifact-cadence-pips'), '缺节奏刻度样式').not.toBe('')
    expect(block('.artifact-cadence-pips'), '不该吃指针事件').toContain('pointer-events: none')
    const tones = [...block('.artifact-cadence-pips i').matchAll(/--color-([a-z-]+)-rgb/g)].map(m => m[1])
    for (const tone of tones) expect(['violet-ink', 'gold-ink', 'ink'], `新造了色 ${tone}`).toContain(tone)
  })
})
