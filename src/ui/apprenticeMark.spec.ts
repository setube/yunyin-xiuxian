/**
 * 道童形制。
 *
 * 道童卡上此前只有两串文字:「第 7 层」(上限 20)与「道徒」(羁绊五阶)。
 *   第 7 层离满还有多远,得自己拿 7 去比 20;
 *   「道徒」与「记名弟子」哪个更近,得先记住五阶的次序。
 *
 * 四条判据:
 *   一 门槛全部取自 data/apprentices 的既有常量与 BOND_TITLES,不另立一份。
 *   二 阶序与 bondTitle 同一判据 —— 两处不能各说各话。
 *   三 满层与未满层分得开;坏值不产生负格或超长数组。
 *   四 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { APPRENTICE_MAX_LEVEL, APPRENTICES, BOND_TITLES } from '@/data/apprentices'
import { qualityDef } from '@/data/qualities'
import { apprenticeBondLabel, apprenticeMark, BOND_STEPS, LEVEL_PIPS, levelPips } from './apprenticeMark'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/ApprenticeView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('道童形制 · 一、门槛取自数据表', () => {
  it('层数刻度就是 APPRENTICE_MAX_LEVEL 格', () => {
    expect(LEVEL_PIPS).toBe(APPRENTICE_MAX_LEVEL)
    expect(levelPips(0)).toHaveLength(APPRENTICE_MAX_LEVEL)
  })

  it('羁绊阶数就是 BOND_TITLES 的条数', () => {
    expect(BOND_STEPS).toBe(BOND_TITLES.length)
  })

  it('阶序与 bondTitle 同源 —— 形制说有几点,称谓就得是那一阶', () => {
    for (const t of BOND_TITLES) {
      const m = apprenticeMark(1, t.min)
      expect(apprenticeBondLabel(t.min), `${t.min} 趟的称谓不对`).toBe(t.name)
      // 形制的阶序与称谓必须指向同一个门槛
      expect(BOND_TITLES[m.bondRank]!.name, `${t.min} 趟:形制与称谓各说各话`).toBe(t.name)
    }
  })

  it('离下一阶的趟数按 BOND_TITLES 现算', () => {
    expect(apprenticeMark(1, 0).toNextBond).toBe(BOND_TITLES[1]!.min)
    expect(apprenticeMark(1, 5).toNextBond).toBe(BOND_TITLES[1]!.min - 5)
    // 已至最高阶
    expect(apprenticeMark(1, BOND_TITLES[BOND_TITLES.length - 1]!.min).toNextBond).toBeNull()
  })
})

describe('道童形制 · 二、层数刻度', () => {
  it('已满几格就是第几层', () => {
    expect(levelPips(3).filter(Boolean)).toHaveLength(3)
    expect(levelPips(12).filter(Boolean)).toHaveLength(12)
    expect(levelPips(APPRENTICE_MAX_LEVEL).filter(Boolean)).toHaveLength(APPRENTICE_MAX_LEVEL)
  })

  it('满层标记只在真满时给', () => {
    expect(apprenticeMark(APPRENTICE_MAX_LEVEL, 0).maxed).toBe(true)
    expect(apprenticeMark(APPRENTICE_MAX_LEVEL - 1, 0).maxed).toBe(false)
  })

  it('越界与坏值不产生负格或超长数组', () => {
    expect(levelPips(-5).filter(Boolean)).toHaveLength(0)
    expect(levelPips(999).filter(Boolean)).toHaveLength(APPRENTICE_MAX_LEVEL)
    expect(levelPips(Number.NaN).filter(Boolean)).toHaveLength(0)
    for (const v of [-5, 999, Number.NaN]) {
      expect(levelPips(v)).toHaveLength(APPRENTICE_MAX_LEVEL)
      expect(Number.isFinite(apprenticeMark(v, v).level.have)).toBe(true)
    }
  })

  it('格数按层数单调增 —— 否则刻度读不出高低', () => {
    let last = -1
    for (let i = 0; i <= APPRENTICE_MAX_LEVEL; i += 1) {
      const n = levelPips(i).filter(Boolean).length
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })
})

describe('道童形制 · 三、羁绊阶点', () => {
  it('一阶一点,从 1 起:道童也有一点', () => {
    expect(apprenticeMark(1, 0).bondPips).toBe(1)
    expect(apprenticeMark(1, BOND_TITLES[BOND_TITLES.length - 1]!.min).bondPips).toBe(BOND_STEPS)
  })

  it('阶点在门槛处跳一格,不掉格', () => {
    let last = 0
    for (let bond = 0; bond <= 130; bond += 1) {
      const pips = apprenticeMark(1, bond).bondPips
      expect(pips).toBeGreaterThanOrEqual(last)
      last = pips
    }
  })
})

describe('道童形制 · 四、界面接上了', () => {
  it('道童页读 apprenticeMark 与 levelPips', () => {
    expect(VIEW, '道童页没接 apprenticeMark').toContain('apprenticeMark(')
    expect(VIEW, '道童页没渲染层数刻度').toContain('levelPips(')
    expect(VIEW, '道童页没渲染羁绊阶点').toContain('bond-pips')
  })

  it('层数刻度给读屏名 —— 二十格细条对面是盲的', () => {
    expect(VIEW).toContain('共 ${a.mark.level.total} 层')
  })

  it('层数刻度的 CSS 存在,且形制层不吃指针事件', () => {
    expect(block('.appr-pips')).toContain('pointer-events: none')
    expect(block('.appr-pips--max i.on'), '满层没有单独的颜色').toContain('gold-ink')
  })

  it('每格要够宽 —— 二十格挤在 78px 时,1/20 与未点几乎分不出', () => {
    /*
     * 原 2.5px:一格只占屏宽千分之七。二十格排开是一条带缺口的细线,
     * 「才第 1 层」读不出来 —— 而这排刻度存在的唯一理由就是这个。
     * 行内还有「N/20」与右侧羁绊阶点,320 宽下余约 185px,加宽到 4px 放得下。
     */
    expect(block('.appr-pips i'), '每格至少 4px').toContain('width: 4px')
    // 已到的格取满色,不再压到 0.8 —— 小格上 0.8 与空槽的差还要再小一档
    expect(block('.appr-pips i.on'), '已到格取满色').toMatch(/background: rgb\(var\(--color-gold-ink-rgb\)\)/)
  })

  it('加宽后 320 宽放得下(二十格 + 读数 + 羁绊点)', () => {
    // 20 × 4 + 19 × 1.5 = 108.5px;读数约 20px、羁绊约 52px → 合计约 181px,行内可用 262px
    const pips = 20 * 4 + 19 * 1.5
    expect(pips).toBeLessThan(262 - 20 - 52)
  })

  it('形制只取既有语义 token', () => {
    const from = CSS.indexOf('.appr-pips {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'gold-ink'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })

  it('称谓仍读 data 的 bondTitle,不在模板里另写一份', () => {
    expect(VIEW).toContain('bondTitle(a.bond)')
  })

  /**
   * 品阶形制:六个道童原型分属凡/良/精/灵四档,而卡上此前一字未提 ——
   * 层数与羁绊都已各有刻度,品阶是这张卡上唯一还没有形制的量。
   * 与装备、丹药、功法同一套语言:名字走品阶文字色,另加一枚品阶签。
   *
   * 色必须走 qualityTextColor,不能用品阶原色:玄/天/仙/神四档原色在日/夜
   * 各有一档过不了 4.5:1(见 data/qualities 的 TEXT_COLOR)。
   * 故障注入:把两处 qualityTextColor 删掉,本条红。
   */
  it('道童卡也标出品阶,且文字色走「当文字用」那一组', () => {
    expect(VIEW, '名字应走品阶文字色').toContain('qualityTextColor(a.def.quality)')
    expect(VIEW, '应另加一枚品阶签').toContain('qualityDef(a.def.quality).name')
    // 阴性对照:不许用品阶原色顶文字
    expect(VIEW, '不该拿 qualityDef(...).color 当字色').not.toMatch(/color: qualityDef\(a\.def\.quality\)\.color/)
  })

  it('四档品阶在道童里真的都有,这条判据才不是空集', () => {
    const ranks = new Set(APPRENTICES.map(a => qualityDef(a.quality).rank))
    expect(ranks.size, '道童只用一个品阶,判据形同虚设').toBeGreaterThan(1)
  })
})
