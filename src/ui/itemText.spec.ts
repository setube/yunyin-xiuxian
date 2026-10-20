/**
 * 用具文案 —— 装备 / 法宝 / 功法 / 丹药 / 灵兽
 *
 * 这五样东西此前都只印一句风味,不回答「它给我什么」:图鉴点开不知要不要留,
 * 背包里的丹看不出服下去会怎样,灵兽的「贪宝」究竟多少则连数量级都没有。
 * 故这里守两件事:
 *   一 每一类都真写得出功用行,且数值来自表里(不另抄一份);
 *   二 需要等级的(法宝祭炼)按传进来的那一份给,不给 0 级那一句。
 */
import { describe, expect, it } from 'vitest'
import { ARTIFACTS, artifactActiveText, artifactDef } from '@/data/artifacts'
import { buffDef } from '@/data/buffs'
import { EQUIPMENT_TEMPLATES, equipmentTemplate } from '@/data/equipment'
import { GONGFA, GONGFA_TYPE_NAMES, gongfaDef } from '@/data/gongfa'
import { PETS } from '@/data/pets'
import { PILLS, pillDef } from '@/data/pills'
import { REALMS } from '@/data/realms'
import { worldNameOfTier } from '@/core/formulas'
import { personalityEffects } from '@/core/petPersonality'
import { gongfaModsAt } from '@/stores/cultivation'
import { formatNum, formatPercent } from '@/utils/format'
import { modsText } from '@/data/statNames'
import {
  artifactFuncText,
  artifactMetaText,
  equipFuncText,
  equipMetaText,
  gongfaFuncText,
  gongfaMetaText,
  petFuncText,
  petTraitText,
  pillFuncText,
  pillMetaText,
  pillSourceText
} from './itemText'

describe('用具 · 装备/法宝/功法三类的功用行', () => {
  it('每件装备都写得出所主与出处,共鸣件还带共鸣效果', () => {
    for (const t of EQUIPMENT_TEMPLATES) {
      const func = equipFuncText(t)
      expect(func, `${t.name} 的功用行是空的`).not.toBe('')
      expect(func).toContain('所主:')
      const meta = equipMetaText(t)
      expect(meta).toContain(worldNameOfTier(t.tier))
      expect(meta).toContain(`${t.tier} 阶`)
      if (t.set) expect(func, `${t.name} 属于共鸣,功用行里却没写`).toContain('共鸣')
      if (t.fixedMods && Object.keys(t.fixedMods).length) {
        expect(func, `${t.name} 的固有机制没写进功用行`).toContain('固有:')
      }
    }
  })

  it('每件法宝的功用行都带被动与神通,且数值按传入的祭炼等级走', () => {
    for (const a of ARTIFACTS) {
      const base = artifactFuncText(a, 0)
      expect(base, `${a.name} 的功用行是空的`).not.toBe('')
      expect(base).toContain('被动:')
      expect(base).toContain(`神通「${a.active.name}」`)
      expect(base).toContain(artifactActiveText(a, 0))
      const leveled = artifactFuncText(a, 5)
      if (Object.keys(a.passive).length > 0) expect(leveled, `${a.name} 祭炼之后说明没变`).not.toBe(base)
      expect(artifactMetaText(a)).toContain(worldNameOfTier(a.fromTier))
    }
  })

  it('每部功法都写得出圆满账与神通几率', () => {
    for (const g of GONGFA) {
      const func = gongfaFuncText(g)
      expect(func).toContain('圆满')
      expect(func, `${g.name} 的圆满数值与 gongfaModsAt 不同源`).toContain(modsText(gongfaModsAt(g.id, g.maxLevel)))
      if (g.skill) {
        expect(func).toContain('几率')
        expect(func).toContain('须设为主修')
        expect(func).toContain(formatPercent(g.skill.rate))
      }
      const meta = gongfaMetaText(g)
      expect(meta, `${g.name} 的出处没写门槛境界`).toContain(`${REALMS[g.minRealm]!.name}期可参`)
      expect(meta).toContain(GONGFA_TYPE_NAMES[g.type])
      if (g.element) expect(meta).toContain('属性')
    }
  })

  it('风化文本仍在,功用行是补上去的而不是顶替', () => {
    const t = equipmentTemplate('w_xuantie')!
    expect(equipFuncText(t)).not.toContain(t.desc)
    const a = artifactDef('af_muyu')!
    expect(artifactFuncText(a, 0)).not.toContain(a.desc)
    const g = gongfaDef('m_taixuan')!
    expect(gongfaFuncText(g)).not.toContain(g.desc)
  })
})

describe('用具 · 丹药', () => {
  it('每味丹都写得出「服之」与来路', () => {
    for (const def of PILLS) {
      const text = pillFuncText(def)
      expect(text, `${def.name} 没写服下去会怎样`).toContain('服之')
      expect(text).toContain(pillSourceText(def))
    }
  })

  it('即时丹的数值与其 instant 本体一致(不手抄)', () => {
    const yanshou = pillDef('p_yanshou')!
    expect(yanshou.instant?.lifespanYears).toBeGreaterThan(0)
    expect(pillFuncText(yanshou)).toContain(`寿元 +${formatNum(yanshou.instant!.lifespanYears!)} 载`)

    const huichun = pillDef('p_huichun')!
    expect(pillFuncText(huichun)).toContain(`灵气 +上限的 ${Math.round(huichun.instant!.qiPct! * 100)}%`)
  })

  it('增益丹写出化开的增益、逐项数值与持续时长', () => {
    const buffPill = PILLS.find(p => p.kind === 'buff' && p.buffId && buffDef(p.buffId))!
    const buff = buffDef(buffPill.buffId!)!
    const text = pillFuncText(buffPill)
    expect(text).toContain(`服之化开「${buff.name}」`)
    expect(text).toContain(modsText(buff.mods))
    expect(text).toContain(`持续 ${Math.round(buff.durationSec / 60)} 分钟`)
  })

  it('无方之丹明说自己无方 —— 免得玩家满世界找一本不存在的方子', () => {
    const dropOnly = PILLS.find(p => !p.recipe)!
    expect(pillSourceText(dropOnly)).toContain('无方')
    expect(pillMetaText(dropOnly)).toContain('偶得')
    const craftable = PILLS.find(p => p.recipe)!
    expect(pillSourceText(craftable)).toContain(`灵草×${craftable.recipe!.herb}`)
    expect(pillMetaText(craftable)).toContain('可炼')
  })

  it('出处一行含品质与门槛境界', () => {
    for (const def of PILLS) {
      const meta = pillMetaText(def)
      expect(meta).toContain(`${REALMS[def.minRealm]!.name}期起见`)
    }
  })
})

describe('用具 · 灵兽', () => {
  it('出战加成与 mods 同源', () => {
    for (const def of PETS) {
      expect(petFuncText(def)).toBe(modsText(def.mods))
    }
  })

  it('性子给出具体数值,且与 personalityEffects 同源', () => {
    for (const def of PETS) {
      const e = personalityEffects(def.id)
      const text = petTraitText(def)
      expect(text, `${def.name} 的性子只写了话、没写数`).not.toBe('')
      if (e.exploreDurMult !== 1) expect(text).toContain(`历练时长 ${e.exploreDurMult > 1 ? '+' : ''}${formatPercent(e.exploreDurMult - 1)}`)
      if (e.dangerMult !== 1) expect(text).toContain(`遇险 ${e.dangerMult > 1 ? '+' : ''}${formatPercent(e.dangerMult - 1)}`)
      if (e.dropLuck !== 0) expect(text).toContain(`掉落气运 ${e.dropLuck > 0 ? '+' : ''}${formatPercent(e.dropLuck)}`)
    }
  })

  it('零值不列:中性项不占字数', () => {
    // 慢稳的掉落气运是 0,那一项就不该出现在它的性子里
    const steady = PETS.find(p => p.personality === 'steady')!
    expect(personalityEffects(steady.id).dropLuck).toBe(0)
    expect(petTraitText(steady)).not.toContain('掉落气运')
  })
})
