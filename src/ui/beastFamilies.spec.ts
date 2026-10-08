/**
 * 族类 → 形 判据
 *
 * 敌人与灵宠的 icon「大类够用就行」那一套把 47 只敌人塞进一枚骷髅、兽爪那枚同时
 * 是野狼/野猪/石猿/灵狐 与「麒麟」;族类表(src/data/beastFamilies.ts)是唯一事实源,
 * 数据里只写 `family`,形从表里取。这里把这份账钉死,量五件事:
 *   一 一枚形不许被两个族类共用(「异族不共形」的红线,真能抓错);
 *   二 每个族类都有形,且那枚形注册在 ICONS 里(不会静默掉成 Sparkles);
 *   三 每只敌人/灵宠都有族类,且是声明过的族类(未归类 = 0 遗漏);
 *   四 族类表不留闲族 —— 立了族却没人归进去,说明分类没落到底;
 *   五 数据不自己另写 icon —— def 上只有 family,没有 icon 字段。
 */
import { describe, expect, it } from 'vitest'
import { BEAST_FAMILIES, beastIcon } from '@/data/beastFamilies'
import { ENEMIES } from '@/data/enemies'
import { PETS } from '@/data/pets'
import { ICONS } from './icons'

const ROSTER = [
  ...ENEMIES.map(x => ({ where: '敌人', name: x.name, family: x.family, def: x })),
  ...PETS.map(x => ({ where: '灵宠', name: x.name, family: x.family, def: x }))
]

describe('族类 → 形 · 一族一形', () => {
  it('一族共一枚形:每一枚形只被一个族类声明', () => {
    const perIcon = new Map<string, string[]>()
    for (const [family, def] of Object.entries(BEAST_FAMILIES)) {
      const list = perIcon.get(def.icon) ?? []
      list.push(family)
      perIcon.set(def.icon, list)
    }
    const shared = [...perIcon.entries()].filter(([, fams]) => fams.length > 1)
    // 一枚 icon 被一个以上族类共用即红 —— 这是「异族不共形」的判据。
    expect(shared, `以下形被多个族类共用,须拆开或在族类表里归并:${JSON.stringify(shared)}`).toEqual([])
  })

  it('每个族类都有形,且该形注册在 ICONS 里(有兜底也不会静默错形)', () => {
    for (const [family, def] of Object.entries(BEAST_FAMILIES)) {
      expect(def.icon, `族类 ${family} 缺形`).toBeTruthy()
      expect(ICONS[def.icon], `族类 ${family} 的形 ${def.icon} 未注册`).toBeTruthy()
    }
  })

  it('每只敌人/灵宠都有族类,且是声明过的族类(未归类 = 0 遗漏)', () => {
    const missing = ROSTER.filter(x => x.family === undefined || !(x.family in BEAST_FAMILIES))
    expect(missing.map(x => `${x.where}:${x.name}:${String(x.family)}`), '以下敌人/灵宠未归类').toEqual([])
  })

  it('族类表不留闲族:每个族类都至少有一只敌人/灵宠归入', () => {
    const used = new Set<string>(ROSTER.map(x => x.family))
    const idle = Object.keys(BEAST_FAMILIES).filter(f => !used.has(f))
    expect(idle, '以下族类立了却没人归进去,分类未落到底').toEqual([])
  })

  it('数据不自己另写 icon:敌人/灵宠 def 上只有 family,没有 icon 字段', () => {
    const selfWritten = ROSTER.filter(x => 'icon' in x.def)
    expect(selfWritten.map(x => x.name), '以下敌人/灵宠自己写了 icon,应改为写 family').toEqual([])
  })

  it('每只敌人/灵宠的族类形都能取到(beastIcon 不回退)', () => {
    for (const x of ROSTER) {
      const icon = beastIcon(x.family)
      expect(icon, `${x.where}:${x.name} 族类 ${x.family} 取不到形`).toBeTruthy()
      expect(ICONS[icon], `${x.where}:${x.name} 的形 ${icon} 未注册`).toBeTruthy()
    }
  })
})
