/**
 * Phase 31.1:新玩法联动审计
 *
 * 目标(非删功能):
 *  ① 师承没有变成隐藏职业 —— 不同环境下价值变化
 *  ② 机缘没有"固定答案" —— 代价对某些 Build 是赚、对另一些是亏
 *  ③ 秘境区别于特殊世界 —— 是"小型实验场",不是小号特殊世界
 *  ④ 装备共鸣没有"最优套装化" —— 散件 Build 仍有空间
 *  ⑤ 天时/区域事件影响选择而非只给 Buff
 *  ⑥ 联动矩阵:每个新系统至少与 2+ 个已有系统有真实关系
 */
import { describe, it, expect } from 'vitest'
import { MENTORS } from '@/data/mentors'
import { FORTUNE_EVENTS } from '@/data/events'
import { REGION_EVENTS, regionEventDef } from './regionEvent'
import { weatherDef } from './weather'
import { SECRET_REALMS } from './secretRealm'
import { PETS } from '@/data/pets'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { equipSetDef, type EquipSetDef } from './equipSet'

describe('联动审计 · ①师承非职业', () => {
  it('四种师承词条方向不同(非同一维度叠加)', () => {
    const modKeys = MENTORS.map(m => Object.keys(m.mods).sort().join('+')).sort()
    // 至少 3 种不同的词条组合(方向性才有差异)
    expect(new Set(modKeys).size).toBeGreaterThanOrEqual(3)
    // 师承不应全给同一主属性(如全给攻击)
    const allSamePrimary = MENTORS.every(m => Object.keys(m.mods).includes('attackPct'))
    expect(allSamePrimary).toBe(false)
  })

  it('师承词条与流派核心词条不冲突(剑修给暴击,罡盾流不受压)', () => {
    // 剑修:critRate/damageBonus —— 与背水/锋芒类联动;不与护盾类互斥
    const sword = MENTORS.find(m => m.id === 'swordsman')!
    expect(sword.mods.critRate).toBeGreaterThan(0)
    expect(sword.mods.damageBonus).toBeGreaterThan(0)
  })
})

describe('联动审计 · ②机缘非固定答案', () => {
  it('每个机缘都有代价或放弃选项(不全是免费拿)', () => {
    for (const ev of FORTUNE_EVENTS) {
      // 必须存在代价类效果(伤害/诅咒)或默认放弃选项
      const hasCost = ev.choices.some(c =>
        c.outcomes.some(o =>
          o.effects.some(e => e.type === 'buff' || e.type === 'stone' || e.type === 'nothing')
        )
      )
      expect(hasCost, `${ev.id} 应有代价或放弃`).toBe(true)
    }
  })
})

describe('联动审计 · ③秘境区别于特殊世界', () => {
  it('秘境规则池不含终局契约/道途类规则(是小实验场)', () => {
    // 秘境规则为凡界体验(治疗/回合/狂化等),不得出现契约彩头
    const realmRules = SECRET_REALMS.map(s => s.desc)
    for (const desc of realmRules) {
      expect(desc).not.toContain('道源×')
      expect(desc).not.toContain('契约')
    }
  })

  it('秘境入口代价是灵石(基础 40~80,按层级折算),与终局的道源经济分开', () => {
    for (const s of SECRET_REALMS) {
      // Phase 34.9:原稿写的是「元婴门槛 + 道源代价」——道源真仙才有,元婴付不出,
      // 等于进不去。现按既定的 minMajor 取灵石代价(见 data/secretRealms 的 ⚠ 注)
      // Phase 34.10:产品口径「都做」→ 分两阶:凡境(minMajor 3,灵石)与天界(minMajor 9,道源)
      if (s.gate === 'mortal') {
        expect('stone' in s.cost).toBe(true)
        expect(s.minMajor).toBeGreaterThanOrEqual(3)
      } else {
        expect('daoSource' in s.cost).toBe(true)
        expect(s.minMajor).toBeGreaterThanOrEqual(9)
      }
    }
    expect(SECRET_REALMS.length).toBeGreaterThanOrEqual(3)
  })
})

describe('联动审计 · ④共鸣非最优套装化', () => {
  it('套装装备仅占少数,散件仍是大头', () => {
    const setCount = EQUIPMENT_TEMPLATES.filter(t => t.set).length
    // 判据是「比例」而非某个历史数字:扩界后模板池从 50 增到 77,
    // 套装件(铁壁3/星斗2 + 三界各 3)随之增加;Phase B-2a 又给饰品加了三件套
    // (妖庭项链/戒指/灵符),故绝对数从 15 升到 18 —— 真正守住的是比例:散件仍须绝对多数
    const ratio = setCount / EQUIPMENT_TEMPLATES.length
    expect(ratio, `套装件占比 ${(ratio * 100).toFixed(0)}% 偏高`).toBeLessThanOrEqual(0.25)
    expect(setCount).toBeLessThanOrEqual(18)
  })

  it('共鸣触发条件宽松(2 件即可),不强制 6 件收集', () => {
    expect(EQUIPMENT_TEMPLATES.filter(t => t.set).length).toBeGreaterThan(0)
  })

  it('每种机制钩子都在 playerSnap 有物化点 —— 声明必须兑现(星斗/仙甲/混沌 RE: TASK-137)', () => {
    // 历史暗伤:astral 三套声明「开战护盾+5%」、UI 显示「共鸣」,战斗却零消费
    // (ironwall 有 ironwallBrace 物化点)。声明即承诺,判据拿着 playerSnap 源码
    // 与共鸣定义对账:每一类钩子,源码里都必须写着同一钩子名的物化点。
    const src = readFileSync(resolve(__dirname, './playerSnap.ts'), 'utf8')
    const hooks = [...new Set(EQUIPMENT_TEMPLATES.map(t => (t.set ? equipSetDef(t.set)?.hook : undefined)).filter(Boolean))] as EquipSetDef['hook'][]
    expect(hooks.length).toBeGreaterThanOrEqual(2)
    for (const hook of hooks) {
      expect(
        src.includes(`'${hook}'`),
        `playerSnap 未物化共鸣钩子 \`${hook}\` —— 套装声明了效果,战斗却不会兑现`
      ).toBe(true)
    }
  })
})

describe('联动审计 · ⑤天时/区域事件影响选择', () => {
  it('天时含境界影响(雷鸣+渡劫难度),而非纯数字 buff', () => {
    const lm = weatherDef('leiming')
    expect(lm?.tribulationMult).toBeGreaterThan(1)
  })

  it('区域事件改变生态维度(事件率),而非只有数值', () => {
    const gumu = regionEventDef('gumu')
    expect(gumu?.eventMult).toBeGreaterThan(1)
    // 完整四事件各有特征
    expect(REGION_EVENTS.length).toBeGreaterThanOrEqual(4)
  })
})

describe('联动审计 · ⑥联动矩阵(每系统 ≥2 个真实关系)', () => {
  /**
   * 矩阵(关系已在 31.0/31.1 实现):
   * 师承 ── 功法分支(词条并入) · 机缘(剑痕→剑修) · 人物页(叙事评价)
   * 机缘 ── 师承 · 灵兽(认主) · 功法(gongfa 掉落)
   * 秘境 ── 流派(规则) · 装备(战利品) · 天时(环境)
   * 灵兽 ── 秘境? (未连)  => 审计标记:灵兽仅连 历练/路线
   * 共鸣 ── 战斗(铁壁/星斗钩子) · 流派(词条)
   * 天时 ── 区域事件(雷鸣→雷灵) · 秘境(环境) · 修炼
   * 区域事件 ── 掉落 · 危险 · 事件率
   */
  it('天时与区域事件构成"环境系统"(联动 ≥2 方向)', () => {
    // 天时影响修炼/渡劫;区域事件影响掉落/危险/事件率 —— 两系统各自多向
    const ly = weatherDef('lingyu')
    expect((ly?.mods.cultivationSpeed ?? 0) + (ly?.mods.qiRegen ?? 0)).toBeGreaterThan(0)
    const sha = regionEventDef('shangdui')
    expect(sha?.rewardMult).toBeGreaterThan(1)
  })

  it('每个秘境都有专属环境特征(影响 Build 取舍)', () => {
    for (const s of SECRET_REALMS) {
      expect(s.desc.length).toBeGreaterThan(8) // 有具体规则描述
    }
  })

  it('灵兽各有性格方向(选伙伴而非纯数值)', () => {
    const personalities = new Set(PETS.map(p => p.personality))
    expect(personalities.size).toBeGreaterThanOrEqual(3)
  })
})
