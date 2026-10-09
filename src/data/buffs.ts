/** Buff 定义 —— 丹药增益 / 事件祝福 / 负面状态 */
import type { BuffDef, StatMods } from '@/types'
import { INJURY_DURATION } from './constants'

function b(id: string, name: string, kind: BuffDef['kind'], durationSec: number, desc: string, mods: StatMods, icon = 'sparkles'): BuffDef {
  return { id, name, kind, durationSec, desc, mods, icon }
}

export const BUFFS: BuffDef[] = [
  b('buff_juling', '聚灵', 'pill', 1800, '灵气汇聚,修炼速度提升 50%', { cultivationSpeed: 0.5 }, 'wind'),
  b('buff_ningshen', '凝神', 'pill', 600, '心神凝定,小进阶成功率提升 8%(大关天劫,不与此益)', { breakthroughRate: 0.08 }, 'moon'),
  b('buff_zhanli', '战意沸腾', 'pill', 900, '攻击提升 20%,防御提升 10%', { attackPct: 0.2, defensePct: 0.1 }, 'sword'),
  b('buff_huxin', '护心', 'pill', 900, '受到伤害降低 15%', { damageReduction: 0.15 }, 'shield'),
  b('buff_shenxing', '神行', 'pill', 900, '足下生风,同程妖踪更密 30%,行程不减;先手判定 +10%', { explorationSpeed: 0.3, speed: 0.1 }, 'footprints'),
  b('buff_wudao', '茶香悟道', 'pill', 1800, '战斗所得修为提升 30%', { expGain: 0.3 }, 'leaf'),
  b('buff_jingang', '金刚护体', 'pill', 900, '生命上限提升 20%,开战护盾 10%', { maxHpPct: 0.2, shieldOnStart: 0.1 }, 'mountain'),
  b('buff_tianyun', '天运加身', 'pill', 1200, '气运提升 15%,装备掉落率提升 10%', { luck: 0.15, dropRate: 0.1 }, 'star'),
  b('buff_xuanming', '玄冥护体', 'pill', 600, '天劫伤害降低 20%', { tribulationResist: 0.2 }, 'cloud'),
  b('buff_pojing', '破境', 'pill', 300, '破境之势,小进阶成功率提升 15%(大关天劫,不与此丹)', { breakthroughRate: 0.15 }, 'zap'),
  b(
    'injury',
    '重伤',
    'injury',
    INJURY_DURATION,
    '气血亏损,修炼速度减半,战力大减',
    { cultivationSpeed: -0.5, attackPct: -0.2, defensePct: -0.2 },
    'skull'
  ),
  b('bless_qingfeng', '清风拂面', 'blessing', 900, '心旷神怡,修炼速度提升 20%', { cultivationSpeed: 0.2 }, 'wind'),
  // 名字里不带「机缘」:「机缘」已专属 ft_ 取/弃事件,这条祝福给的是气运与历练际遇
  b('bless_jiyuan', '气运加身', 'blessing', 1200, '气运提升 20%,历练际遇提升 15%', { luck: 0.2, eventLuck: 0.15 }, 'star'),
  b('bless_daoyun', '道韵加身', 'blessing', 1800, '修炼速度提升 40%,战斗修为提升 20%', { cultivationSpeed: 0.4, expGain: 0.2 }, 'scroll'),
  b(
    'curse_xinmo',
    '心魔缠身',
    'injury',
    600,
    '心魔滋生,修炼速度降低 30%,小进阶成功率降低 10%(大关天劫,不因此更凶)',
    { cultivationSpeed: -0.3, breakthroughRate: -0.1 },
    'ghost'
  ),
  b('buff_pofu', '破釜沉舟', 'pill', 900, '生命低于三成时伤害提升 30%,受伤降低 15%', { lowHpDamage: 0.3, lowHpReduction: 0.15 }, 'flame'),
  b('buff_gangdun', '罡气盾', 'pill', 900, '开战护盾提升 15%,持盾时伤害提升 12%', { shieldOnStart: 0.15, shieldPower: 0.12 }, 'shield'),
  // ---- Phase 28 前期玩法:悟道顿悟(选择后生效,数值与 earlyGame.ts 文案对齐) ----
  b('enlighten_cult', '静心凝神', 'blessing', 600, '心神沉静,修炼速度提升 20%', { cultivationSpeed: 0.2 }, 'moon'),
  b('enlighten_cult_strong', '道心通明', 'blessing', 300, '道心澄澈,修炼速度提升 35%', { cultivationSpeed: 0.35 }, 'sun'),
  b('enlighten_dmg', '锤炼筋骨', 'blessing', 600, '筋骨如钢,战斗伤害提升 15%', { damageBonus: 0.15 }, 'sword'),
  b('enlighten_def', '凝气护体', 'blessing', 600, '真气护体,防御提升 12%', { defensePct: 0.12 }, 'shield'),
  b('enlighten_bt', '悟透瓶颈', 'blessing', 1800, '瓶颈松动,小进阶成功率提升 8%(大关天劫,不与此悟)', { breakthroughRate: 0.08 }, 'zap'),
  b('enlighten_qi', '吐纳有序', 'blessing', 600, '气息绵长,灵气回复提升 25%', { qiRegen: 0.25 }, 'wind'),
  // ---- Phase 28 洞府巡游奖励 buff(修复前是纯空转:addBuff 查无此定义静默返回) ----
  b('cave_furnace_cult', '药气入体', 'blessing', 600, '吸纳丹炉药气,修炼速度提升 20%', { cultivationSpeed: 0.2 }, 'flame'),
  b('cave_array_qicap', '阵枢焕新', 'blessing', 600, '修复后的阵法运转如意,灵气上限提升 25%', { qiCapPct: 0.25 }, 'wind'),
  b('cave_garden_pet', '灵兽相随', 'blessing', 600, '安抚后的灵兽更尽心,灵兽效果提升 30%', { beastPct: 0.3 }, 'paw'),
  // 惩罚 buff:id 与 penalty.type 对齐(见 earlyGameService.chooseCaveOption)
  b('cave_penalty_cultivationSpeed', '修炼倦怠', 'injury', 300, '强行吸纳伤了根基,修炼速度下降 15%', { cultivationSpeed: -0.15 }, 'skull'),
  // ---- Phase 28 闭关:5 分钟 +150% 修炼、期间禁止历练。
  // durationSec=300 必须与 earlyGameService.startRetreat 的 5 分钟口径一致(同一真相源=buff 本身) ----
  b('retreat', '闭关', 'blessing', 300, '闭关静修,修炼速度提升 150%,期间无法外出历练', { cultivationSpeed: 1.5 }, 'mountain'),
  // ---- 仙界及以上丹药增益(每 buff 仅一味丹产出,见 pillValue 法则 C) ----
  b('buff_xianli', '仙力加身', 'pill', 1200, '仙力贯体,攻击提升 35%,暴击伤害提升 30%', { attackPct: 0.35, critDamage: 0.3 }, 'sword'),
  b('buff_shenwei', '神威临世', 'pill', 1200, '神威加身,造成伤害提升 25%,受伤降低 12%', { damageBonus: 0.25, damageReduction: 0.12 }, 'crown'),
  b('buff_hundun', '本源归一', 'pill', 1800, '混沌本源入体,修炼速度提升 80%;小进阶成功率提升 10%(大关天劫,不食此源)', {
    cultivationSpeed: 0.8,
    breakthroughRate: 0.1
  }, 'sparkles'),
  // ---- 深邃设计:仙界以上的神/道品丹药增益(每 buff 仅一味丹产出,见 pillValue 法则 C) ----
  b('buff_daluo', '大罗金身', 'pill', 1200, '大罗金身不坏,攻击提升 40%,暴击率提升 5%', { attackPct: 0.4, critRate: 0.05 }, 'crown'),
  b('buff_shenyuan', '神元淬体', 'pill', 1800, '神元淬炼肉身,修炼速度提升 70%;小进阶成功率提升 6%(大关天劫,不食此源)', {
    cultivationSpeed: 0.7,
    breakthroughRate: 0.06
  }, 'sparkles'),
  b('buff_zhenshan', '镇世神威', 'pill', 1500, '神威镇世,造成伤害提升 30%,生命上限提升 15%', { damageBonus: 0.3, maxHpPct: 0.15 }, 'crown'),
  b('buff_daotai', '道胎不灭', 'pill', 1800, '道胎不朽,受到伤害降低 20%,反击几率提升 20%', { damageReduction: 0.2, counterRate: 0.2 }, 'shield'),
  b('buff_huntian', '混天一气', 'pill', 1800, '一气混元,修炼速度提升 120%,灵气回复提升 40%', { cultivationSpeed: 1.2, qiRegen: 0.4 }, 'wind')
]

const BY_ID = new Map(BUFFS.map(x => [x.id, x]))

export function buffDef(id: string): BuffDef | undefined {
  return BY_ID.get(id)
}
