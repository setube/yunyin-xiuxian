/**
 * 灵兽的描述要指向它的词条方向。
 *
 * 法宝有 `artifactEffects.spec` 对账「说明里的数值 = 数据里的数值」,灵兽没有对应的守卫 ——
 * 于是两处名实不符能一直躺着:
 *   · 紫电貔貅旧 desc「云中踏电而行,只进不出」讲的是貔貅聚财,词条却是会心三项
 *   · 螭龙幼子旧 desc「龙生九子,此其一也」纯身份说明,看不出它是成长型
 *
 * 判据刻意宽松:**任一词条命中一个关键词就算过**。这个表不为文案立法,
 * 只保证「描述与词条至少指向同一件事」——能被它抓住的是「完全不相关」那种。
 *
 * 新增灵兽若被误报,往对应键补一个同义词即可;若某个键反复误报,
 * 说明语义检查不适合该键,应把它从表里去掉而不是放宽整条检查。
 */
import { describe, expect, it } from 'vitest'
import { PETS } from '@/data/pets'
import { STAT_NAMES } from '@/data/statNames'
import type { AnyStatKey } from '@/types'

/** 词条键 → 允许出现在描述里的关键词 */
const HINTS: Record<string, string> = {
  explorationSpeed: '寻行程踪游遇信',
  eventLuck: '机缘际',
  defensePct: '稳甲护御山坚',
  maxHpPct: '血气体骨肉',
  attackPct: '攻爪牙锐锋噬',
  speed: '疾迅骤急速飞',
  dodgeRate: '影声避隐无痕',
  dropRate: '获得拾藏',
  spiritStoneGain: '钱石财宝',
  luck: '福泽运祥瑞',
  cultivationSpeed: '修炼星梦道吐纳',
  qiRegen: '息气灵韵',
  tribulationResist: '雷天威劫',
  breakthroughRate: '境进根骨关',
  critRate: '要害准寸',
  critDamage: '重狠',
  lifesteal: '血噬吞',
  expGain: '修为经验丰获',
  // 地品两只引入的三个新键:灵兽此前从未提供过这三路
  damageReduction: '守御挡挡甲壳根山',
  armorPen: '甲壳硬烂破蚀穿',
  damageBonus: '伤势烈增幅'
}

describe('灵兽 · 描述与词条指向同一件事', () => {
  it('词表覆盖现有灵兽用到的全部词条键', () => {
    const used = new Set<string>()
    for (const p of PETS) for (const k of Object.keys(p.mods)) used.add(k)
    const missing = [...used].filter(k => HINTS[k] === undefined)
    expect(missing, `这些词条键没有配关键词,守卫对它们形同虚设:\n${missing.join('\n')}`).toEqual([])
  })

  it('每只灵兽的描述至少命中其一个词条的关键词', () => {
    const miss: string[] = []
    for (const p of PETS) {
      const hit = Object.keys(p.mods).some(k => [...(HINTS[k] ?? '')].some(c => p.desc.includes(c)))
      if (!hit) {
        const dirs = Object.keys(p.mods).map(k => STAT_NAMES[k as AnyStatKey] ?? k).join(' · ')
        miss.push(`「${p.name}」desc「${p.desc}」看不出方向(词条:${dirs})`)
      }
    }
    expect(miss, `描述与词条完全对不上的灵兽:\n${miss.join('\n')}`).toEqual([])
  })

  it('描述不能为空或多字重复的占位', () => {
    for (const p of PETS) {
      expect(p.desc.trim().length, `${p.name} 的 desc 为空`).toBeGreaterThan(3)
    }
  })
})
