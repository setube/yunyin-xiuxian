/** 转世天赋池 —— 33 个,按品阶加权抽取 */
import type { StatMods, TalentDef } from '@/types'

function t(id: string, name: string, grade: TalentDef['grade'], desc: string, mods: StatMods): TalentDef {
  const weights = { 1: 100, 2: 45, 3: 15, 4: 4 } as const
  return { id, name, grade, desc, mods, weight: weights[grade] }
}

export const TALENTS: TalentDef[] = [
  t('t_jianxin', '剑心', 2, '天生剑骨,杀伐果断', { attackPct: 0.12, critRate: 0.03 }),
  t('t_fuyuan', '福缘', 2, '气运傍身,机缘自来', { luck: 0.1, eventLuck: 0.1 }),
  t('t_tianming', '天命', 3, '天命所归,小进阶如履平川;大关天劫,不假此运', { breakthroughRate: 0.05, luck: 0.05 }),
  t('t_changsheng', '长生', 3, '寿数绵长,岁月不侵', { lifespanPct: 0.3 }),
  t('t_daogu', '道骨', 1, '根骨清奇,修行略快', { cultivationSpeed: 0.08 }),
  t('t_linggen', '灵慧', 1, '颖悟天生,战胜所得修为更丰', { expGain: 0.1 }),
  t('t_tiegu', '铁骨', 1, '筋骨强健,皮糙肉厚', { maxHpPct: 0.1, defensePct: 0.05 }),
  t('t_xunjie', '迅捷', 1, '身轻如燕,须得抢先;差一寸仍居人后', { speed: 0.08 }),
  t('t_jufu', '聚福', 1, '小富即安,战胜则灵石自来;洞府之产不与', { spiritStoneGain: 0.12 }),
  t('t_shanbu', '善补', 1, '疗伤有方,恢复迅速', { regenPerRound: 0.01, maxHpPct: 0.05 }),
  t('t_yuanman', '圆融', 2, '道基圆融,小进阶更稳,败则少损;大关天劫不由此基', { breakthroughRate: 0.03, breakRefund: 0.1 }),
  t('t_wuwang', '悟妄', 2, '明心见性,悟道极快', { cultivationSpeed: 0.15 }),
  t('t_potian', '破天', 3, '一身杀力,天下无双', { attackPct: 0.18, damageBonus: 0.08 }),
  t('t_buhuai', '不坏', 3, '金刚法体,万法难伤', { defensePct: 0.15, damageReduction: 0.06 }),
  t('t_shengun', '神棍', 2, '铁口直断,趋吉避凶', { eventLuck: 0.15, dodgeRate: 0.03 }),
  t('t_yaoyuan', '妖缘', 2, '与兽有缘,同程妖踪更密,兵器更易现世', { explorationSpeed: 0.12, dropRate: 0.06 }),
  t('t_danxin', '丹心', 2, '炉火纯青,一炉或得双丹', { alchemyYield: 0.2 }),
  t('t_qiao', '巧匠', 2, '巧夺天工,强化更省其料;法宝祭炼不与', { forgeDiscount: 0.15 }),
  t('t_wugou', '无垢', 3, '道心无垢,修炼不辍,小进阶不滞', { cultivationSpeed: 0.1, breakthroughRate: 0.04 }),
  t('t_canglan', '沧澜', 2, '气海如渊,灵气充沛', { qiRegen: 0.2 }),
  t('t_zhuoyue', '卓越', 3, '天资卓越,样样精通', { attackPct: 0.08, defensePct: 0.08, maxHpPct: 0.08 }),
  t('t_guyong', '孤勇', 2, '背水一战,愈挫愈勇', { lowHpReduction: 0.15, executeDamage: 0.1 }),
  t('t_tanbao', '探宝', 2, '嗅觉敏锐,宝物难藏', { dropRate: 0.12, doubleDropRate: 0.05 }),
  t('t_leiti', '雷体', 3, '天生雷体,渡劫如常', { tribulationResist: 0.15, attackPct: 0.08 }),
  t('t_kongming', '空明', 1, '心境空明,吐纳悠长', { qiRegen: 0.1, cultivationSpeed: 0.04 }),
  t('t_hongyun', '鸿运', 4, '鸿运当头,器物成色自高,小进阶亦顺', { luck: 0.2, breakthroughRate: 0.06, dropRate: 0.1 }),
  t('t_daozi', '道子', 4, '生而知之,近道之体', { cultivationSpeed: 0.3, expGain: 0.15 }),
  t('t_zhanshen', '战神', 4, '战意通神,所向披靡', { attackPct: 0.25, critRate: 0.05, critDamage: 0.3 }),
  t('t_guiling', '龟灵', 4, '龟灵之体,寿与天齐', { lifespanPct: 0.5, maxHpPct: 0.2 }),
  t('t_hunyuan', '混元', 4, '混元一气,攻守兼备', { attackPct: 0.15, defensePct: 0.15, maxHpPct: 0.15, damageReduction: 0.05 }),
  t('t_pofu', '破釜', 2, '身陷绝境,战意愈炽', { lowHpDamage: 0.15, lowHpReduction: 0.08 }),
  t('t_dunxin', '盾心', 2, '以盾证道,愈守愈强', { shieldOnStart: 0.08, shieldPower: 0.1 }),
  t('t_jingji', '荆棘', 2, '犯我者,虽强必偿', { counterRate: 0.08, counterDamage: 0.15 })
]

const BY_ID = new Map(TALENTS.map(x => [x.id, x]))

export function talentDef(id: string): TalentDef | undefined {
  return BY_ID.get(id)
}

export const TALENT_GRADE_NAMES = ['', '凡赋', '灵赋', '天赋', '道赋'] as const
export const TALENT_GRADE_COLORS = ['', '#857F70', 'var(--color-azure)', 'var(--color-violet-ink)', '#C9A227'] as const
