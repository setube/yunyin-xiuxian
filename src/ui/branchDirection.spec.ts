/**
 * 悟道分支的方向形制:分支卡上此前只有一行词条。
 *
 * 分支是「一经选择不可更改、转世不失」的一次抉择,而玩家要在三条之间挑一条时,
 * 得先把三行词条逐字读完,再在心里把「会心 + 破甲」与「防御 + 生命」折成同一个问题:
 * **这一条是往哪个方向走**。
 *
 * 四条判据:
 *   一 四类方向各取得到,跨两类以上报「合」
 *   二 固定次序 —— 同一份数据不许报出两种读法
 *   三 不按分支名归类(名字会重名,按名字归类是给文案立法)
 *   四 界面真的接上了
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GONGFA_BRANCHES } from '@/data/gongfaBranches'
import {
  BRANCH_DIRECTION_NAMES,
  allBranchDirections,
  branchDirectionMark
} from './branchDirection'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/cultivation/GongfaDialog.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/branchDirection.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('分支方向 · 一、四类各取得到', () => {
  it('单类词条各报自己对的方向', () => {
    expect(branchDirectionMark({ attackPct: 0.1, critRate: 0.05 }).direction).toBe('attack')
    expect(branchDirectionMark({ defensePct: 0.1, maxHpPct: 0.06 }).direction).toBe('guard')
    expect(branchDirectionMark({ cultivationSpeed: 0.1, qiRegen: 0.1 }).direction).toBe('growth')
    expect(branchDirectionMark({ speed: 0.05, qiCapPct: 0.04 }).direction).toBe('fate')
  })

  it('跨两类以上报「合」,并列出落在哪几类', () => {
    const mark = branchDirectionMark({ attackPct: 0.1, defensePct: 0.05 })
    expect(mark.direction, '两头都沾应报「合」').toBe('blend')
    expect(mark.name).toBe('合')
    expect(mark.hits).toEqual(['attack', 'guard'])
    expect(mark.label).toBe('合 · 攻守')
  })

  it('一条方向都没有时给空说法,调用点据此不印', () => {
    expect(branchDirectionMark({}).label).toBe('')
    expect(branchDirectionMark(undefined).label).toBe('')
    // 未登记的键不计入(它们仍会显示在词条行里)
    expect(branchDirectionMark({ someUnknownKey: 1 } as never).label).toBe('')
  })

  it('全表逐条都取得到方向,且没有一条落到空集', () => {
    const empty: string[] = []
    for (const b of GONGFA_BRANCHES) {
      if (!branchDirectionMark(b.mods).label) empty.push(b.name)
    }
    expect(empty, `这些分支一个方向也没认出来:\n${empty.join(' / ')}`).toEqual([])
  })
})

describe('分支方向 · 二、固定次序,同一份数据只有一种读法', () => {
  it('hits 按 攻/守/修/疾 排,不随词条插入序变', () => {
    // 同样两类的两种写法,必须报同一个结果
    const a = branchDirectionMark({ defensePct: 0.1, attackPct: 0.05 })
    const b = branchDirectionMark({ attackPct: 0.05, defensePct: 0.1 })
    expect(a.hits, '插入序不该影响读法').toEqual(b.hits)
    expect(a.label).toBe(b.label)
  })

  it('四类全沾也只报一次「合」,不重复计数', () => {
    const mark = branchDirectionMark({ attackPct: 1, defensePct: 1, cultivationSpeed: 1, speed: 1 })
    expect(mark.hits).toEqual(['attack', 'guard', 'growth', 'fate'])
    expect(mark.label).toBe('合 · 攻守修疾')
  })

  it('方向表覆盖全部五类', () => {
    expect(allBranchDirections().sort()).toEqual(['attack', 'blend', 'fate', 'growth', 'guard'])
    for (const d of allBranchDirections()) {
      expect(BRANCH_DIRECTION_NAMES[d], `${d} 缺中文名`).toBeTruthy()
    }
  })
})

describe('分支方向 · 三、按词条归类,不按分支名', () => {
  it('形制层不读分支名 —— 名字会重名,按名字归类是给文案立法', () => {
    // 模块里不该出现任何分支名或 def.name 的读取
    expect(MODULE, '不该读分支名').not.toContain('def.name')
    expect(MODULE, '不该读分支名').not.toContain('b.name')
    // 归类只由词条键决定
    expect(MODULE, '归类应读 KEY_DIRECTION').toContain('KEY_DIRECTION')
  })

  it('同名分支可以分属不同方向 —— 这正说明名字不可作依据', () => {
    // 「化形」「归一」这类名字在数据里各出现两次;它们的方向由各自词条决定
    const byName = new Map<string, string[]>()
    for (const b of GONGFA_BRANCHES) {
      byName.set(b.name, [...(byName.get(b.name) ?? []), branchDirectionMark(b.mods).direction])
    }
    expect(byName.size, '分支名重名是有意留着的风味,判据靠词条').toBeLessThan(GONGFA_BRANCHES.length)
  })
})

describe('分支方向 · 四、界面接上了,且色不新造', () => {
  it('分支卡挂方向印,并给读屏说法', () => {
    expect(DIALOG, '分支卡应挂方向印').toContain('branch-dir')
    expect(DIALOG, '应读形制').toContain('branchDirectionMark(b.mods)')
    expect(DIALOG, '应有读屏说法').toContain('row.direction.label')
    expect(DIALOG, '方向印应有 title').toContain(':title="row.direction.label"')
  })

  it('四类方向各有一色,「合」单独一色', () => {
    const tones = (['attack', 'guard', 'growth', 'fate', 'blend'] as const).map(d => {
      const b = block(`.branch-dir--${d}`)
      expect(b, `缺 ${d} 的方向色`).not.toBe('')
      return [...b.matchAll(/--color-([a-z-]+)-rgb/g)].map(m => m[1]).join('+')
    })
    expect(new Set(tones).size, `方向色有重复:${tones.join(' / ')}`).toBe(5)
  })

  it('色只取既有 token,方向印不吃指针事件', () => {
    expect(block('.branch-dir'), '方向印不该吃指针事件').toContain('pointer-events: none')
    for (const d of ['attack', 'guard', 'growth', 'fate', 'blend']) {
      const seg = block(`.branch-dir--${d}`)
      for (const m of seg.matchAll(/--color-([a-z-]+)-rgb/g)) {
        expect(['cinnabar', 'jade', 'violet-ink', 'azure', 'ink', 'ink-soft'], `新造了色 ${m[1]}`).toContain(m[1])
      }
    }
  })
})
