/**
 * 全数据源图标键登记审计。
 *
 * equipmentIcon.spec 已守卫装备,这里把同一层保护扩到其余吃图标的数据面:
 * 灵兽/建筑/区域/敌人/增益/丹药/法宝。它们与装备走同一个渲染口
 * (GameIcon → iconOf → ICONS),而 iconOf 有 Sparkles 兜底、永不抛错 ——
 * 哪个键写错/被删,UI 上只会静默掉成四角星,必须在这层直接钉死。
 *
 * 下面第二段把同一把尺子伸到**源码里的字面量**:上面那份名单是手工维护的,
 * 新写一处界面自己现拼的图标名它就看不见 —— `RegionCard` 那句
 * `row.suppressed ? 'shield-check' : …` 正是这样漏了三年(注册表里从来没这一键,
 * 镇压中的地界一直画着四角星)。故第二段直接扫 `icon: 'x'`、`:name="… 'x' …"`
 * 与 `<GameIcon name="x">` 三种写法。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ICONS } from './icons'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { BUILDINGS } from '@/data/buildings'
import { REGIONS } from '@/data/regions'
import { BUFFS } from '@/data/buffs'
import { PILLS } from '@/data/pills'
import { ARTIFACTS } from '@/data/artifacts'
import { CELESTIAL_WORLDS, TRIAL_FOES } from '@/data/endgame'

const SOURCES: { label: string; items: { name?: string; icon?: string }[] }[] = [
  { label: '装备', items: EQUIPMENT_TEMPLATES },
  // 敌人与灵兽已不再自持 icon:族类 → 形 的唯一事实源在 data/beastFamilies.ts,
  // 其形注册与「异族不共形」判据由 beastFamilies.spec.ts 钉死。
  { label: '建筑', items: BUILDINGS },
  { label: '区域', items: REGIONS },
  { label: '增益', items: BUFFS },
  { label: '丹药', items: PILLS },
  { label: '法宝', items: ARTIFACTS },
  // 一界可达的敌人不止 foes:守界的天道守护者(guardian)与路线树每个节点的
  // 镇守 foe 同样是渲染口 —— 只查 foes 会漏掉它们身上的死键(Sourcery 审查指出)。
  {
    label: '天道各界的敌人',
    items: CELESTIAL_WORLDS.flatMap(w => [...w.foes, w.guardian, ...w.routes.flat().map(n => n.foe)])
  },
  { label: '试炼之敌', items: TRIAL_FOES }
]

describe('图标注册表 · 全数据源无死键', () => {
  it.each(SOURCES)('$label 的每个图标键都在 ICONS 注册表里', ({ label, items }) => {
    const dead = items
      .filter(item => item.icon !== undefined && !(item.icon! in ICONS))
      .map(item => `${item.name ?? '?'}:${item.icon}`)
    expect(dead, `${label} 以下图标键未注册(会静默掉成 Sparkles)`).toEqual([])
  })
})

const SRC = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry) && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/**
 * 源码里写死的图标名 —— **每一种写法都要认**。
 *
 * 上面那份 SOURCES 是按对象上的 `icon` 字段查的,只覆盖「数据表里带 icon 的数据源」;
 * 界面自己现拼的名字(三元表达式、局部映射表、`<GameIcon name="trash">` 这种静态属性)
 * 一条都查不到。故这里直接按文本扫三种写法:
 *   一 `icon: 'x'` —— 数据表与局部映射的写法;
 *   二 `<GameIcon … :name="… 'x' …"` —— 绑定表达式里嵌的字面量(RegionCard 那处);
 *   三 `<GameIcon name="x"` —— 静态属性写法。
 */
function literalIconNames(text: string): string[] {
  const names: string[] = []
  for (const m of text.matchAll(/\bicon:\s*'([a-z0-9-]+)'/g)) names.push(m[1]!)
  for (const m of text.matchAll(/<GameIcon\b[^>]*?:name="([^"]*)"/gs))
    for (const lit of m[1]!.matchAll(/'([a-z0-9-]+)'/g)) names.push(lit[1]!)
  for (const m of text.matchAll(/<GameIcon\b[^>]*?\bname="([a-z0-9-]+)"/g)) names.push(m[1]!)
  return names
}

describe('图标注册表 · 源码里写死的名字也必须登记', () => {
  it('三种写法扫出来的每个键都在 ICONS 里(漏登记就静默掉成四角星)', () => {
    const dead: string[] = []
    let scanned = 0
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8')
      const names = literalIconNames(text)
      // 阳性对照:真扫到了大量图标名才敢相信「没死键」这个结论
      scanned += names.length
      for (const name of names) if (!(name in ICONS)) dead.push(`${file.slice(SRC.length + 1)}:${name}`)
    }
    expect(scanned, '一处图标字面量都没扫到 —— 正则坏了,这条会在空集上假绿').toBeGreaterThan(100)
    expect([...new Set(dead)], '这些名字写在了源码里却没进 ICONS 注册表').toEqual([])
  })

  /**
   * 故障注入:把 RegionCard 的 `'shield-check'` 改回一个没登记的键(如 `'shield-ok'`)
   * → 本条红并点名那一处;把 names 换回按对象字段查(旧法)→ 本条同样红空转。
   */
  it('判据自家不空转:RegionCard 那处三元里的字面量真被读到了', () => {
    const src = readFileSync(resolve(SRC, 'components/adventure/RegionCard.vue'), 'utf8')
    expect(literalIconNames(src), '表达式里嵌的图标名没被读出来').toContain('shield-check')
  })
})
