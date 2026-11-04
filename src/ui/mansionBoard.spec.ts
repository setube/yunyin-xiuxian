/**
 * 四象二十八宿盘。
 *
 * 星象页原先只写一句「今日值某宿」,再加一句「四象配四界」——
 * 二十八宿是哪几宿、分属哪一象、今天轮到了哪一宿,全靠读文字。
 * 而它们本就是**按象成组**的(东苍龙七宿、南朱雀七宿…),摆成四排,
 * 哪一象的宿今值、在本象里排第几位,一眼看得见。
 *
 * 判据:
 *   一 分组只换摆法:宿、象、界域仍取 data/xiangxiu,不另立一份。
 *   二 四象各七宿,二十八宿一个不漏、不重。
 *   三 今值之宿恰标一处;找不到就给 null,不编一个「排第一」。
 *   四 读数与当天同源 —— 盘上的今值与星象页那行文字取自同一个 todayMansion。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IMAGES, MANSIONS } from '@/data/xiangxiu'
import { mansionGroups, mansionOrdinal, mansionsAccountedFor, todayMansionOf } from './mansionBoard'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('星宿盘 · 一、分组不另立数据', () => {
  it('四象与二十八宿取自 data/xiangxiu', () => {
    expect(IMAGES).toHaveLength(4)
    expect(MANSIONS).toHaveLength(28)
  })

  it('每象的宿就是数据表里 image 相同的那几宿,顺序不变', () => {
    for (const g of mansionGroups('角')) {
      const expected = MANSIONS.filter(m => m.image === g.id).map(m => m.name)
      expect(g.mansions.map(m => m.name), `${g.name}的宿`).toEqual(expected)
    }
  })

  it('四象的界域与方位全部转发数据表', () => {
    for (const g of mansionGroups('角')) {
      const def = IMAGES.find(i => i.id === g.id)!
      expect(g.name).toBe(def.name)
      expect(g.direction).toBe(def.direction)
      expect(g.world).toBe(def.world)
    }
  })
})

describe('星宿盘 · 二、二十八宿一个不漏', () => {
  it('四象各七宿', () => {
    for (const g of mansionGroups('角')) expect(g.mansions, `${g.name}`).toHaveLength(7)
  })

  it('分组后的宿数等于 MANSIONS 总数 —— 盘上不会漏宿', () => {
    expect(mansionsAccountedFor()).toBe(MANSIONS.length)
  })

  it('没有一宿被分进两象', () => {
    const seen = mansionGroups('角').flatMap(g => g.mansions.map(m => m.name))
    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe('星宿盘 · 三、今值恰标一处', () => {
  it('今值落在所属之象,其余三象不标', () => {
    for (const m of MANSIONS) {
      const groups = mansionGroups(m.name)
      const here = groups.filter(g => g.here)
      expect(here, `${m.fullName}应恰标一象`).toHaveLength(1)
      expect(here[0]!.id).toBe(m.image)
    }
  })

  it('本象内的位次就是它在本排里的位置', () => {
    for (const m of MANSIONS) {
      const group = mansionGroups(m.name).find(g => g.id === m.image)!
      const i = group.mansions.findIndex(x => x.name === m.name)
      expect(mansionOrdinal(group, m.name)).toBe(i + 1)
    }
  })

  it('不在本象返回 null,不给假的 0 —— 那会被读成「排第一」', () => {
    const qinglong = mansionGroups('角').find(g => g.id === 'qinglong')!
    expect(mansionOrdinal(qinglong, '斗')).toBeNull()
    expect(mansionOrdinal(qinglong, '')).toBeNull()
    expect(mansionOrdinal(qinglong, '角角')).toBeNull()
  })

  it('空宿名不标任何一象', () => {
    expect(mansionGroups('').some(g => g.here)).toBe(false)
  })
})

describe('星宿盘 · 四、界面与读数同源', () => {
  it('模板按 mansionGroups 铺排,不自己再筛一遍', () => {
    expect(VIEW).toContain('mansion-board')
    expect(VIEW).toMatch(/v-for="g in mansionGroupsList"/)
    expect(VIEW).toMatch(/v-for="m in g\.mansions"/)
  })

  it('今值之宿与页面那行「直日」取自同一个 todayMansion', () => {
    // 同一页两处各调一次 todayMansion 会各算一遍日数,盘上的今值与文字可能对不上
    expect(VIEW).toContain('todayMansion()')
    expect(VIEW).toContain('todayMansionLine()')
    expect(VIEW).toMatch(/const todayMansionName = computed\(\(\) => todayMansion\(\)\.name\)/)
  })

  it('认不出的宿名返回 null,不抛错', () => {
    expect(todayMansionOf('')).toBeNull()
    expect(todayMansionOf('不存在')).toBeNull()
    expect(todayMansionOf('角')?.fullName).toBe('角木蛟')
  })
})

describe('星宿盘 · 五、形制', () => {
  it('今值那一排另有一档边框,不与其余三象混同', () => {
    const here = block('.mansion-row--here')
    expect(here).toContain('cinnabar')
    expect(here).not.toBe(block('.mansion-row'))
  })

  it('今值那一宿转朱,在一排七宿里认得出', () => {
    expect(block('.mansion-star--today')).toContain('cinnabar')
    expect(block('.mansion-star--today')).not.toBe(block('.mansion-star'))
  })

  it('盘面不吃指针事件,逐星信息留在 title', () => {
    expect(block('.mansion-board')).toContain('pointer-events: none')
    expect(VIEW).toContain('`${m.fullName} · ${m.domain} · ${m.good}`')
  })

  it('盘面只取既有语义 token', () => {
    const from = CSS.indexOf('.mansion-board {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'ink-soft', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })

  it('廿八宿名走整色 token —— 11px 半透明墨在浅纸上只有 3.4:1', () => {
    expect(block('.mansion-star')).toContain('ink-soft')
    expect(block('.mansion-star'), '宿名不许叠透明度').not.toMatch(/rgb\(var\(--color-[a-z-]+-rgb\)\s*\//)
  })
})
