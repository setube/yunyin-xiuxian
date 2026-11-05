/**
 * 悟道分支形制:分支是「不可更改、转世不失」的一次抉择,不该三个按钮长得一模一样。
 *
 * 四条判据:
 *   一 道纹按**序号**定位,不按分支名 —— 「开天」在四门功法里各有其一,按名字会画成同一个。
 *   二 品阶色与光环取所属功法,不另立色表;同一门功法的分支因此同一色、不同形。
 *   三 坏档(野分支 id / 取不到功法)返回 undefined,不挂假形制。
 *   四 对话框真的接上了:选卡、已择卡都带同一枚道纹。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GONGFA_BRANCHES, branchesFor, gongfaBranchDef } from '@/data/gongfaBranches'
import { gongfaDef } from '@/data/gongfa'
import { qualityDef } from '@/data/qualities'
import { BRANCH_SLOT_MAX, branchMark, branchMarkOf, branchSlotOf } from './branchMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/cultivation/GongfaDialog.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('分支形制 · 一、道纹按序号定位,不按名字', () => {
  it('同一门功法的分支,槽位互不相同', () => {
    const byGongfa = new Map<string, number[]>()
    for (const b of GONGFA_BRANCHES) {
      const mark = branchMark(b)
      expect(mark, `${b.id} 应取得到形制`).toBeDefined()
      const arr = byGongfa.get(b.gongfaId) ?? []
      arr.push(mark!.slot)
      byGongfa.set(b.gongfaId, arr)
    }
    for (const [gongfaId, slots] of byGongfa) {
      expect(new Set(slots).size, `${gongfaId} 的两条分支占了同一个槽位,画出来就是同一个`).toBe(slots.length)
    }
  })

  it('分支名有重名,但道纹不会被重名带偏', () => {
    // 「开天」在四门功法里各有其一 —— 按名字画纹会把它们画成同一个
    const kaitian = GONGFA_BRANCHES.filter(b => b.name === '开天')
    expect(kaitian.length, '开天重名样本').toBeGreaterThan(1)
    // 按序号定位:各分支的槽位只取决于它在自己那门功法里的次序
    for (const b of kaitian) {
      const idx = branchesFor(b.gongfaId).findIndex(x => x.id === b.id)
      expect(branchMark(b)!.slot).toBe(branchSlotOf(idx + 1))
    }
  })

  it('槽位随序号单调,越界回到合法区间', () => {
    expect(branchSlotOf(1)).toBe(1)
    expect(branchSlotOf(2)).toBe(2)
    expect(branchSlotOf(3)).toBe(3)
    expect(branchSlotOf(4)).toBe(4)
    expect(branchSlotOf(99), '超过上限时复用最后一槽,不画出没人登记的形状').toBe(BRANCH_SLOT_MAX)
    expect(branchSlotOf(0)).toBe(1)
    expect(branchSlotOf(Number.NaN)).toBe(1)
  })

  it('四道纹样在一门真实功法上齐活:庚金剑典有四条分支', () => {
    const four = branchesFor('m_gengjin')
    expect(four.length).toBe(4)
    expect(four.map(b => branchMark(b)!.slot)).toEqual([1, 2, 3, 4])
    expect(four.map(b => branchMark(b)!.glyph)).toEqual(['branch-1', 'branch-2', 'branch-3', 'branch-4'])
  })

  it('四套道纹各有样式,且互不相同', () => {
    const bodies = new Set<string>()
    for (let slot = 1; slot <= BRANCH_SLOT_MAX; slot += 1) {
      const body = block(`.branch-glyph--branch-${slot}::before`)
      expect(body, `缺 .branch-glyph--branch-${slot}::before`).not.toBe('')
      bodies.add(body)
    }
    expect(bodies.size, '两套道纹画了同一套线').toBe(BRANCH_SLOT_MAX)
  })
})

describe('分支形制 · 二、色与光环取所属功法', () => {
  it('同一门功法的各分支同色 —— 分支长在功法上,色跟着功法走', () => {
    for (const b of GONGFA_BRANCHES) {
      const gongfa = gongfaDef(b.gongfaId)!
      expect(branchMark(b)!.tone).toBe(qualityDef(gongfa.quality).color)
    }
  })

  it('光环与功法品阶同档:凡品分支无装饰,天品以上才有', () => {
    const mortal = branchesFor('m_taixuan')
    expect(mortal.length).toBeGreaterThan(0)
    for (const b of mortal) expect(branchMark(b)!.aura.tier).toBe('plain')
    const top = GONGFA_BRANCHES.find(b => qualityDef(gongfaDef(b.gongfaId)!.quality).rank >= 6)
    expect(top, '该有天品以上功法的分支').toBeDefined()
    expect(branchMark(top!)!.aura.tier).toBe('radiant')
  })

  it('说法由分支名与槽位拼成,不另造词', () => {
    const b = branchesFor('m_taixuan')[0]!
    expect(branchMark(b)!.label).toBe(`${b.name}(第1道)`)
  })
})

describe('分支形制 · 三、坏档不挂假形制', () => {
  it('野分支 id 返回 undefined', () => {
    for (const bogus of ['', 'b_nonexistent', 'B_TAIXUAN_SHA', '__proto__']) {
      expect(branchMarkOf(bogus), `${bogus} 不该有分支形制`).toBeUndefined()
    }
    expect(gongfaBranchDef('b_nonexistent')).toBeUndefined()
  })
})

describe('分支形制 · 四、对话框真的接上了', () => {
  /**
   * 选卡与已择卡都带同一枚道纹。
   *
   * 形制仍在,但选卡那一路的落点从「模板里反复调」搬到了「computed 里算一次」:
   * 原先 `branchMarkOf` 在同一个按钮里被调 5 次,`branchStyle` 里还要再调一次。
   */
  it('选卡与已择卡都带同一枚道纹', () => {
    // 选卡:v-for 里的分支,形制由 computed 附上
    expect(DIALOG, '选卡应挂道纹').toContain('branch-glyph--${row.mark.glyph}')
    expect(DIALOG, '已择卡也应挂道纹').toContain('branch-glyph--${pickedMark.glyph}')
    expect(DIALOG, '分支卡应带品阶淡底').toContain('const mark = branchMarkOf(b.id)')
    expect(DIALOG, '道纹是装饰,读屏靠 aria-label').toContain('row.mark?.label')
    // 阳性:模板里不许再逐行调纯函数
    const tpl = DIALOG.slice(0, DIALOG.indexOf('<script'))
    expect(tpl, '模板不该再调 branchMarkOf').not.toContain('branchMarkOf(')
  })

  it('道纹不吃指针事件,且不使用裸 hex', () => {
    expect(block('.branch-glyph::before'), '道纹须 pointer-events: none').toContain('pointer-events: none')
    expect(block('.branch-card::before'), '左内沿色条须 pointer-events: none').toContain('pointer-events: none')
    expect(CSS, '分支样式里不该出现裸 hex').not.toMatch(/\.branch-(glyph|card)[^{]*\{[^}]*#[0-9a-fA-F]{6}/)
  })
})
