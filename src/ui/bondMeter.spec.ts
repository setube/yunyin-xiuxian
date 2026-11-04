/**
 * 道侣三条关系值的形制。
 *
 * 弹窗里缘分 / 信任 / 契合是三根一模一样的蓝条,各填到 0~100。
 * 可推进缘阶要三条**各自**过线,而三条的线并不相同 —— 以「同行 → 知交」为例:
 * 缘分要 50、信任要 45、契合只要 0。于是契合那根满到哪都没用,
 * 真正卡着的是缘分。而界面一根门槛都没画,玩家得读下面那句「缘分尚浅」才知道。
 *
 * 四条判据:
 *   一 门槛全部取自 data/daolu 的 STAGE_GATES,不另立一份。
 *   二 已至最高阶时不画刻度 —— 不给一个不存在的目标。
 *   三 过线与未过线分得开,且分得开的是那根条,不只是那个数字。
 *   四 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STAGE_GATES, STAGE_NAMES, stageIndex } from '@/data/daolu'
import { BOND_METER_CAP, BOND_METERS, bondMeterRows, nextStageGate } from './bondMeter'

const ROOT = resolve(__dirname, '../..')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/character/BondDialog.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

const vals = (fate: number, trust: number, accord: number) => ({ fate, trust, accord })

describe('道侣关系值 · 一、门槛取自数据表', () => {
  it('下一阶门槛与 STAGE_GATES 逐项相同,不是另写的一份', () => {
    for (const g of STAGE_GATES) {
      const next = STAGE_GATES.find(x => stageIndex(x.stage) === stageIndex(g.stage) + 1)
      const got = nextStageGate(g.stage)
      if (!next) {
        expect(got, `${g.stage} 已是最高阶,不该有下一阶门槛`).toBeNull()
        continue
      }
      expect(got).toEqual({ fate: next.fate, trust: next.trust, accord: next.accord })
    }
  })

  it('三根的次序与键固定,改数据表不会串位', () => {
    expect(BOND_METERS.map(m => m.key)).toEqual(['fate', 'trust', 'accord'])
    expect(BOND_METERS.map(m => m.label)).toEqual(['缘分', '信任', '契合'])
    expect(BOND_METER_CAP).toBe(100)
  })

  it('条上的门槛位置就是门槛值本身 —— 50 落在条的正中', () => {
    const rows = bondMeterRows(vals(40, 30, 10), 'together')
    expect(rows.map(r => r.gatePct)).toEqual([50, 45, 0])
  })
})

describe('道侣关系值 · 二、最高阶不画刻度', () => {
  it('已至道侣:三根都不给门槛,也无「未到」', () => {
    const rows = bondMeterRows(vals(90, 85, 70), 'daolv')
    expect(rows.every(r => r.gatePct === null)).toBe(true)
    expect(rows.every(r => r.met)).toBe(true)
  })

  it('中间阶照常给门槛', () => {
    expect(bondMeterRows(vals(0, 0, 0), 'met').every(r => r.gatePct !== null)).toBe(true)
  })
})

describe('道侣关系值 · 三、过线与否分得开', () => {
  it('同行 → 知交:契合门槛为 0,哪怕值只有 10 也已过线', () => {
    const rows = bondMeterRows(vals(40, 30, 10), 'together')
    expect(rows.find(r => r.key === 'accord')!.met).toBe(true)
    expect(rows.find(r => r.key === 'fate')!.met).toBe(false)
    expect(rows.find(r => r.key === 'trust')!.met).toBe(false)
  })

  it('恰好等于门槛即算过线 —— 判据是 >=,不是 >', () => {
    const rows = bondMeterRows(vals(50, 45, 0), 'together')
    expect(rows.every(r => r.met), '三条都恰好压线,应全部算过').toBe(true)
  })

  it('条长按 100 折算,不按门槛折算 —— 否则三根的满值各不相同就没法比', () => {
    const rows = bondMeterRows(vals(40, 30, 10), 'together')
    expect(rows.map(r => r.pct)).toEqual([40, 30, 10])
  })

  it('越界与坏值不产生 NaN 条长', () => {
    const rows = bondMeterRows(vals(-5, 999, Number.NaN), 'known')
    expect(rows.every(r => Number.isFinite(r.pct))).toBe(true)
    expect(rows[0]!.pct).toBe(0)
    expect(rows[1]!.pct).toBe(100)
    expect(rows[2]!.pct).toBe(0)
  })
})

describe('道侣关系值 · 四、界面接上了', () => {
  it('弹窗读的是门槛行,并画出刻度', () => {
    expect(DIALOG, '弹窗没有接 bondMeterRows').toContain('bondMeterRows(')
    expect(DIALOG, '弹窗没有画门槛刻度').toContain('bond-meter-gate')
    expect(DIALOG, '过线与未过线没有分开的类').toContain('bond-meter--met')
  })

  it('不再重复播报下一阶 —— 下方 gateHint 已经说了「离 X 尚差:…」', () => {
    // 同一件事说两遍:条上刻度 + 一行总结足矣
    expect(DIALOG, '又加了一行「下一阶」,与下方 gateHint 重复').not.toContain('下一阶「')
  })

  it('门槛刻度的 CSS 存在,且形制层不吃指针事件', () => {
    expect(block('.bond-meter')).toContain('pointer-events: none')
    expect(block('.bond-meter-gate')).toContain('position: absolute')
    expect(block('.bond-meter--met .bond-meter-fill'), '过线的条没有单独的颜色').toContain('jade')
  })

  it('形制只取既有语义 token', () => {
    const from = CSS.indexOf('.bond-meter')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'jade', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })

  it('阶名与数据表同源 —— 弹窗不自己写阶名', () => {
    // 下一阶那句读的是 gateHint.stage,再经 STAGE_NAMES 转中文
    expect(DIALOG).toContain('STAGE_NAMES[gateHint.stage]')
    expect(STAGE_NAMES.together).toBeTruthy()
  })
})
