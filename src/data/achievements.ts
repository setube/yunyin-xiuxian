/**
 * 成就库 —— 50 个,长期目标
 *
 * 未达成者在界面上一律以「???」示人(见 views/CollectionView.vue),
 * 所以此表不再有"隐藏成就"一说 —— 五十个位子人人平等,成了才现名目。
 */
import type { AchievementDef, AchvCond, CounterKey, RewardBundle } from '@/types'

function counter(key: CounterKey, value: number): AchvCond {
  return { type: 'counter', key, value }
}

function ac(id: string, name: string, desc: string, cond: AchvCond, reward?: RewardBundle): AchievementDef {
  return { id, name, desc, cond, reward }
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---- 境界 ----
  ac('a_r0', '初窥仙途', '首次踏入炼气境', { type: 'realm', major: 0 }, { stoneTier: 20, titleId: 'ti_churu' }),
  ac('a_r1', '筑基修士', '突破筑基境', { type: 'realm', major: 1 }, { stoneTier: 40, wudao: 10, titleId: 'ti_zhuji' }),
  ac('a_r2', '金丹得道', '突破金丹境', { type: 'realm', major: 2 }, { stoneTier: 60, wudao: 20, titleId: 'ti_jindan' }),
  ac('a_r3', '元婴出窍', '突破元婴境', { type: 'realm', major: 3 }, { stoneTier: 80, wudao: 30, titleId: 'ti_yuanying' }),
  ac('a_r4', '神游太虚', '突破化神境', { type: 'realm', major: 4 }, { stoneTier: 100, wudao: 40 }),
  ac('a_r5', '返虚合道', '突破炼虚境', { type: 'realm', major: 5 }, { stoneTier: 120, wudao: 50 }),
  ac('a_r6', '天人合一', '突破合体境', { type: 'realm', major: 6 }, { stoneTier: 140, wudao: 60 }),
  ac('a_r7', '大道将成', '突破大乘境', { type: 'realm', major: 7 }, { stoneTier: 160, wudao: 80 }),
  ac('a_r8', '雷海渡厄', '突破渡劫境', { type: 'realm', major: 8 }, { stoneTier: 200, wudao: 100 }),
  ac('a_r9', '得证仙位', '飞升真仙境', { type: 'realm', major: 9 }, { stoneTier: 300, wudao: 200 }),
  // ---- 突破 ----
  ac('a_bt10', '拾级而上', '累计突破 10 次', counter('breakthroughs', 10), { stoneTier: 30 }),
  ac('a_bt30', '道途不辍', '累计突破 30 次', counter('breakthroughs', 30), { wudao: 20 }),
  ac('a_bt60', '百折不挠', '累计突破 60 次', counter('breakthroughs', 60), { wudao: 40 }),
  ac('a_btf5', '道阻且长', '突破失败 5 次', counter('breakthroughFails', 5), { herb: 20 }),
  ac('a_trib3', '劫后余生', '渡过 3 次天劫', counter('tribulations', 3), { wudao: 30 }),
  // ---- 战斗 ----
  ac('a_k50', '初试锋芒', '击败 50 个敌人', counter('kills', 50), { stoneTier: 25 }),
  ac('a_k300', '身经百战', '击败 300 个敌人', counter('kills', 300), { stoneTier: 50, titleId: 'ti_slayer' }),
  ac('a_k1000', '千军辟易', '击败 1000 个敌人', counter('kills', 1000), { stoneTier: 100 }),
  ac('a_k5000', '伏尸百万', '击败 5000 个敌人', counter('kills', 5000), { stoneTier: 200 }),
  ac('a_boss10', '一剑破万法', '击败 10 位区域首领', counter('bossKills', 10), { titleId: 'ti_wanfa', wudao: 30 }),
  ac('a_boss20', '横扫诸域', '击败 20 位区域首领', counter('bossKills', 20), { stoneTier: 150 }),
  // ---- 装备 ----
  ac('a_eq10', '初有积蓄', '累计获得 10 件装备', counter('equipsGained', 10), { dust: 10 }),
  ac('a_eq100', '琳琅满目', '累计获得 100 件装备', counter('equipsGained', 100), { dust: 50 }),
  ac('a_eq500', '藏宝千件', '累计获得 500 件装备', counter('equipsGained', 500), { dust: 200 }),
  ac('a_q4', '玄光初现', '获得一件玄品或更高装备', { type: 'quality', rank: 4 }, { stoneTier: 40 }),
  ac('a_q6', '天命之子', '获得一件天品或更高装备', { type: 'quality', rank: 6 }, { titleId: 'ti_tianjiao', stoneTier: 80 }),
  ac('a_q7', '仙缘深厚', '获得一件仙品或更高装备', { type: 'quality', rank: 7 }, { stoneTier: 120 }),
  ac('a_q8', '神物自晦', '获得一件神品装备', { type: 'quality', rank: 8 }, { stoneTier: 200 }),
  ac('a_up30', '小有心得', '累计强化 30 次', counter('upgrades', 30), { dust: 30 }),
  ac('a_up100', '百炼成钢', '累计强化 100 次', counter('upgrades', 100), { titleId: 'ti_baolian', dust: 80 }),
  ac('a_dec50', '化繁为简', '分解 50 件装备', counter('decomposed', 50), { dust: 60 }),
  // ---- 历练 ----
  ac('a_ex10', '行万里路', '完成 10 次历练', counter('explores', 10), { stoneTier: 30 }),
  ac('a_ex50', '踏遍山河', '完成 50 次历练', counter('explores', 50), { stoneTier: 80 }),
  ac('a_ev20', '际遇非凡', '经历 20 次奇遇', counter('events', 20), { wudao: 15 }),
  ac('a_ev100', '缘法自来', '经历 100 次奇遇', counter('events', 100), { wudao: 50 }),
  // ---- 丹药 ----
  ac('a_pill20', '以药辅道', '服用 20 枚丹药', counter('pillsUsed', 20), { herb: 30 }),
  ac('a_pill100', '丹药如饭', '服用 100 枚丹药', counter('pillsUsed', 100), { herb: 100 }),
  ac('a_craft30', '开炉有喜', '炼制 30 枚丹药', counter('pillsCrafted', 30), { herb: 50 }),
  ac('a_craft100', '丹道圣手', '炼制 100 枚丹药', counter('pillsCrafted', 100), { titleId: 'ti_danwang' }),
  // ---- 功法 ----
  ac('a_gf5', '博采众长', '习得 5 部功法', counter('gongfaLearned', 5), { page: 20 }),
  ac('a_gf15', '一览道藏', '习得 15 部功法', counter('gongfaLearned', 15), { page: 60, wudao: 30 }),
  // ---- 洞府 ----
  ac('a_bd10', '安家立业', '累计升级建筑 10 次', counter('buildingUpgrades', 10), { stoneTier: 40 }),
  ac('a_bd40', '洞天福地', '累计升级建筑 40 次', counter('buildingUpgrades', 40), { stoneTier: 120 }),
  // ---- 转世 ----
  ac('a_re1', '一世轮回', '完成第一次转世', counter('reincarnations', 1), { titleId: 'ti_zhuanshi', wudao: 50 }),
  ac('a_re3', '三生三世', '完成三次转世', counter('reincarnations', 3), { wudao: 150 }),
  // ---- 离线 ----
  ac('a_off5', '闭关有成', '领取 5 次离线收益', counter('offlineClaims', 5), { stoneTier: 30 }),
  ac('a_off30', '闭关狂人', '领取 30 次离线收益', counter('offlineClaims', 30), { stoneTier: 100 }),
  // ---- 特殊 ----
  ac('a_lifelow', '寿元将尽', '寿元只剩不到一成', { type: 'custom', key: 'lifespanLow' }, { herb: 50 }),
  ac('a_lifespan', '万古长生', '寿元上限超过一万载', { type: 'custom', key: 'lifespan10k' }, { titleId: 'ti_changsheng' }),
  ac('a_rich', '富可敌国', '持有灵石超过一百万', { type: 'custom', key: 'stone1m' }, { wudao: 30 })
]

const BY_ID = new Map(ACHIEVEMENTS.map(x => [x.id, x]))

export function achievementDef(id: string): AchievementDef | undefined {
  return BY_ID.get(id)
}
