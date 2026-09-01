/** 灵兽 —— 事件与灵兽园获得,佩戴一只
 * Phase 31.0 S4:增加性格(personality)—— 探索时的行为倾向,
 * 让玩家选伙伴而非只看数值 */
import type { PetDef } from '@/types'

export type PetPersonality = 'greedy' | 'steady' | 'fierce' | 'cautious'

export const PETS: PetDef[] = [
  {
    id: 'pet_qingyu',
    name: '青羽灵狐',
    desc: '尾生青羽,善寻机缘',
    icon: 'paw',
    quality: 'excellent',
    mods: { explorationSpeed: 0.1, eventLuck: 0.05 },
    personality: 'greedy'
  },
  {
    id: 'pet_xuegui',
    name: '雪背小龟',
    desc: '背驮微型山岳,稳如泰山',
    icon: 'shield',
    quality: 'excellent',
    mods: { defensePct: 0.08, maxHpPct: 0.05 },
    personality: 'steady'
  },
  {
    id: 'pet_huoque',
    name: '赤火雀',
    desc: '羽翼含火,性子急躁',
    icon: 'bird',
    quality: 'excellent',
    mods: { attackPct: 0.08, speed: 0.04 },
    personality: 'fierce'
  },
  {
    id: 'pet_yueying',
    name: '月影狸',
    desc: '昼伏夜出,来去无声',
    icon: 'moon',
    quality: 'spirit',
    mods: { dodgeRate: 0.04, dropRate: 0.08 },
    personality: 'cautious'
  },
  {
    id: 'pet_jinchan',
    name: '三足金蟾',
    desc: '口衔铜钱,天生聚财',
    icon: 'gem',
    quality: 'spirit',
    mods: { spiritStoneGain: 0.15, luck: 0.05 },
    personality: 'greedy'
  },
  {
    id: 'pet_yaoguang',
    name: '摇光鹿',
    desc: '角悬星光,踏梦而行',
    icon: 'star',
    quality: 'profound',
    mods: { cultivationSpeed: 0.08, qiRegen: 0.1 },
    personality: 'steady'
  },
  {
    id: 'pet_leihou',
    name: '御雷猴',
    desc: '生于雷泽,不惧天威',
    icon: 'zap',
    quality: 'profound',
    mods: { tribulationResist: 0.1, attackPct: 0.06 },
    personality: 'fierce'
  },
  {
    id: 'pet_longzi',
    name: '螭龙幼子',
    desc: '龙生九子,此其一也',
    icon: 'sparkles',
    quality: 'heaven',
    mods: { attackPct: 0.1, maxHpPct: 0.1, cultivationSpeed: 0.06 },
    personality: 'fierce'
  }
]

const BY_ID = new Map(PETS.map(x => [x.id, x]))

export function petDef(id: string): PetDef | undefined {
  return BY_ID.get(id)
}
