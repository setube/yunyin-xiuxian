/**
 * 装备图标(玩家反馈:「武器都是剑、帽子都是王冠、衣物都是衬衫,希望多出点
 * 有辨识度的装备图标」)。
 *
 * equipment.ts 的 t() 现在按名字里的字眼挑图标(甲→盾、盔→盔、斧→斧、簪→光 …),
 * 不再同槽清一色。这里钉两件事:
 * 1) 每一个模板的图标键都必须注册在 ui/icons.ts(坏了就地名红,免得掉成空图标);
 * 2) 关键的名 → 图标对不能被无意改乱。
 */
import { describe, expect, it } from 'vitest'
import { EQUIPMENT_TEMPLATES, equipmentTemplate } from './equipment'
import { ICONS } from '@/ui/icons'

describe('装备图标', () => {
  it('全部模板的图标键都已注册,没有死键', () => {
    // 直接在注册表里查成员 —— iconOf 会有 Sparkles 兜底、永不抛错,
    // 包在 try/catch 里等于永远测不出死键(会静默掉成四角星)。
    const dead = EQUIPMENT_TEMPLATES.filter(t => !(t.icon in ICONS)).map(t => `${t.id}:${t.icon}`)
    expect(dead, '以下模板的图标键未注册').toEqual([])
  })

  it('同槽不再清一色:衣甲盾、头盔盔、斧用斧、簪用光', () => {
    expect(equipmentTemplate('w_kaifu')?.icon, '开天斧 → 斧').toBe('axe')
    expect(equipmentTemplate('b_hantan')?.icon, '寒潭甲 → 盾').toBe('shield')
    expect(equipmentTemplate('h_yunshen')?.icon, '陨神盔 → 盔(工程盔)').toBe('hardhat')
    expect(equipmentTemplate('h_muzan')?.icon, '桃木簪 → 光点').toBe('sparkles')
    expect(equipmentTemplate('w_xuantie')?.icon, '玄铁重剑 → 剑').toBe('sword')
  })

  it('名字的字眼只作用于自己的槽:剑冢一行不再全变剑、腕甲不再全是盾', () => {
    // 10 阶剑冢的「剑」只是花纹,不该把头/衣/腕/坠/符整行变成剑
    expect(equipmentTemplate('h_jianwen')?.icon, '剑纹冠 → 冠').toBe('crown')
    expect(equipmentTemplate('b_liuyun')?.icon, '剑痕衣 → 衫').toBe('shirt')
    expect(equipmentTemplate('wr_longlin')?.icon, '剑骨腕甲 → 护腕默认').toBe('watch')
    expect(equipmentTemplate('n_yuehua')?.icon, '剑魄坠 → 玉').toBe('gem')
    expect(equipmentTemplate('tl_jianzhong')?.icon, '剑冢符 → 卷').toBe('scroll')
    // 「甲」只让衣袍成盾,护腕/腕甲回槽位默认
    expect(equipmentTemplate('wr_moyuan')?.icon, '魔渊腕甲 → 护腕默认').toBe('watch')
    expect(equipmentTemplate('wr_canjia')?.icon, '残甲护腕 → 护腕默认').toBe('watch')
    // 钺/戈形制同斧,不再落回剑;幽海钩按「勾」用锚
    expect(equipmentTemplate('w_tianguan')?.icon, '天关神钺 → 斧').toBe('axe')
    expect(equipmentTemplate('w_shenge')?.icon, '神戈 → 斧').toBe('axe')
    expect(equipmentTemplate('w_youhai')?.icon, '幽海钩 → 锚').toBe('anchor')
  })

  it('手挑过的图标不算(雾隐长枪仍用 wand),不被关键词规则覆盖', () => {
    expect(equipmentTemplate('w_zidian')?.icon).toBe('wand')
  })

  it('衣甲与衣袍同槽并存:寒潭甲盾牌、风林道袍衬衫', () => {
    expect(equipmentTemplate('b_hantan')?.icon).toBe('shield')
    expect(equipmentTemplate('b_qingyun')?.icon).toBe('shirt')
  })
})
