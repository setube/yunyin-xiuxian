/** 灵兽 —— 事件与灵兽园获得,佩戴一只;性格(personality)为历练时的行为倾向 */
import type { PetDef } from '@/types'
import { qualityDef } from './qualities'

/** 神兽门槛:仙品及以上 */
export const IMMORTAL_RANK = qualityDef('immortal').rank

/**
 * 泛型灵兽事件(未指名 id,如 ev_wounded_beast / ft_beast_pledge)的发放池:只含仙品以下。
 * 仙品/神品神兽只由带 minRealm 的指名事件发放(见 data/events.ts),不进此池。
 */
export function genericPetPool(owned: Set<string>): PetDef[] {
  return PETS.filter(p => qualityDef(p.quality).rank < IMMORTAL_RANK && !owned.has(p.id))
}

export const PETS: PetDef[] = [
  {
    id: 'pet_qingyu',
    name: '青羽灵狐',
    desc: '尾生青羽,善寻妖踪;同程多遇,行程不减',
    family: 'beast',
    quality: 'excellent',
    mods: { explorationSpeed: 0.12, eventLuck: 0.06 },
    personality: 'greedy'
  },
  {
    id: 'pet_xuegui',
    name: '雪背小龟',
    desc: '背驮一座小小山岳,步步极稳',
    family: 'chelonian',
    quality: 'excellent',
    mods: { defensePct: 0.08, maxHpPct: 0.05 },
    personality: 'steady'
  },
  {
    id: 'pet_huoque',
    name: '赤火雀',
    desc: '羽翼含火,性子急躁',
    family: 'winged',
    quality: 'excellent',
    mods: { attackPct: 0.08, speed: 0.05 },
    personality: 'fierce'
  },
  {
    id: 'pet_yueying',
    name: '月影狸',
    desc: '昼伏夜出,来去无声',
    family: 'beast',
    quality: 'spirit',
    mods: { dodgeRate: 0.05, dropRate: 0.1 },
    personality: 'cautious'
  },
  {
    id: 'pet_jinchan',
    name: '三足金蟾',
    desc: '口衔铜钱,战胜则灵石自来;洞府之产,不与此蟾',
    family: 'treasure',
    quality: 'spirit',
    mods: { spiritStoneGain: 0.18, luck: 0.06 },
    personality: 'greedy'
  },
  {
    id: 'pet_yaoguang',
    name: '摇光鹿',
    desc: '角悬星光,踏梦而行',
    family: 'beast',
    quality: 'profound',
    mods: { cultivationSpeed: 0.22, qiRegen: 0.26 },
    personality: 'steady'
  },
  {
    id: 'pet_leihou',
    name: '御雷猴',
    desc: '生于雷泽,不惧天威',
    family: 'beast',
    quality: 'profound',
    mods: { tribulationResist: 0.26, attackPct: 0.18 },
    personality: 'fierce'
  },
  {
    id: 'pet_longzi',
    name: '螭龙幼子',
    desc: '龙生九子,此其一也',
    family: 'dragon',
    quality: 'heaven',
    mods: { attackPct: 0.2, maxHpPct: 0.2, cultivationSpeed: 0.12 },
    personality: 'fierce'
  },
  // ---- 仙界及以上神兽 ----
  {
    id: 'pet_yinglong',
    name: '应龙',
    desc: '四爪生翼,云雨相随,仙门之上的护道神兽',
    family: 'dragon',
    quality: 'immortal',
    mods: { attackPct: 0.3, maxHpPct: 0.3, cultivationSpeed: 0.2 },
    personality: 'fierce'
  },
  {
    id: 'pet_qilin',
    name: '麒麟',
    desc: '仁兽现世,福泽自生',
    family: 'dragon',
    quality: 'immortal',
    mods: { luck: 0.32, dropRate: 0.26, defensePct: 0.26 },
    personality: 'steady'
  },
  {
    id: 'pet_kunpeng',
    name: '鲲鹏',
    desc: '北冥有鱼,化而为鹏,扶摇直上九万里;同程多遇,行程不减',
    family: 'winged',
    quality: 'divine',
    mods: { explorationSpeed: 0.35, dodgeRate: 0.14, eventLuck: 0.2 },
    personality: 'cautious'
  },
  {
    id: 'pet_taotie',
    name: '混沌饕餮',
    desc: '混沌所孕,吞天噬地;小进阶亦贪其修,大关天劫不入其腹',
    family: 'beast',
    quality: 'divine',
    mods: { cultivationSpeed: 0.36, breakthroughRate: 0.13, lifesteal: 0.11 },
    personality: 'fierce'
  },
  // ---- 补足:每个界域至少两只 ----
  {
    id: 'pet_qingluan',
    name: '青鸾',
    desc: '羽色如洗,鸣声清越,云海之上的传信神禽',
    family: 'winged',
    quality: 'immortal',
    mods: { cultivationSpeed: 0.24, qiRegen: 0.24, explorationSpeed: 0.3 },
    personality: 'cautious'
  },
  {
    id: 'pet_baize',
    name: '白泽',
    desc: '知万物之名,能言人语,卧于断碑之侧;战胜所得修为,较旁兽更丰',
    family: 'beast',
    quality: 'divine',
    mods: { expGain: 0.6, breakthroughRate: 0.14, eventLuck: 0.45 },
    personality: 'greedy'
  }
]

const BY_ID = new Map(PETS.map(x => [x.id, x]))

export function petDef(id: string): PetDef | undefined {
  return BY_ID.get(id)
}
