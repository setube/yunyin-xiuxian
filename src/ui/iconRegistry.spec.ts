/**
 * 全数据源图标键登记审计。
 *
 * equipmentIcon.spec 已守卫装备,这里把同一层保护扩到其余吃图标的数据面:
 * 灵兽/建筑/区域/敌人/增益/丹药/法宝。它们与装备走同一个渲染口
 * (GameIcon → iconOf → ICONS),而 iconOf 有 Sparkles 兜底、永不抛错 ——
 * 哪个键写错/被删,UI 上只会静默掉成四角星,必须在这层直接钉死。
 */
import { describe, expect, it } from 'vitest'
import { ICONS } from './icons'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { PETS } from '@/data/pets'
import { BUILDINGS } from '@/data/buildings'
import { REGIONS } from '@/data/regions'
import { ENEMIES } from '@/data/enemies'
import { BUFFS } from '@/data/buffs'
import { PILLS } from '@/data/pills'
import { ARTIFACTS } from '@/data/artifacts'
import { CELESTIAL_WORLDS, TRIAL_FOES } from '@/data/endgame'

const SOURCES: { label: string; items: { name?: string; icon?: string }[] }[] = [
  { label: '装备', items: EQUIPMENT_TEMPLATES },
  { label: '灵兽', items: PETS },
  { label: '建筑', items: BUILDINGS },
  { label: '区域', items: REGIONS },
  { label: '敌人', items: ENEMIES },
  { label: '增益', items: BUFFS },
  { label: '丹药', items: PILLS },
  { label: '法宝', items: ARTIFACTS },
  { label: '天道各界的敌人', items: CELESTIAL_WORLDS.flatMap(w => w.foes) },
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
