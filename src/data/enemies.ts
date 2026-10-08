/**
 * 敌人库 —— 132 个,含 44 名区域首领;多段/真伤/闪避等机制用于流派克制
 *
 * 每一条写的是**族类**(`family`),形由 data/beastFamilies.ts 的族类表给出 ——
 * 从此不手写 icon:狼写 beast、蛇蟒写 serpent、傀儡写 construct、神明写 deity。
 * 原先这里直接写 icon,于是「大类够用」把 47 只敌人塞进一枚骷髅(独角妖狼、
 * 霞光巨蟒、玄冰蛟、瑶池仙后、混沌道祖…),灵宠那边应龙与螭龙幼子是星芒、麒麟是
 * 兽爪。族类与形的关系现在只有一处,见 BEAST_FAMILIES;判据在 src/ui/beastFamilies.spec.ts。 */
import type { BeastFamily, BossArchetype, BossPhase, ElementId, EnemyDef, EnemySkill, StatMods } from '@/types'

function e(
  id: string,
  name: string,
  tier: number,
  family: BeastFamily,
  mults: [hp: number, atk: number, def: number, speed: number],
  skills: EnemySkill[],
  opts: { boss?: boolean; element?: ElementId; mods?: StatMods; archetype?: BossArchetype; phases?: BossPhase[] } = {}
): EnemyDef {
  return {
    id,
    name,
    tier,
    family,
    hpMult: mults[0],
    atkMult: mults[1],
    defMult: mults[2],
    speed: mults[3],
    skills,
    isBoss: opts.boss,
    element: opts.element,
    mods: opts.mods,
    archetype: opts.archetype,
    phases: opts.phases
  }
}

const bite = (name = '撕咬', mult = 1.4, rate = 0.25): EnemySkill => ({ name, mult, rate })
const heavy = (name: string, mult: number, rate = 0.2): EnemySkill => ({ name, mult, rate })

export const ENEMIES: EnemyDef[] = [
  // t1 青云山麓
  e('e_wolf', '赤目野狼', 1, 'beast', [0.9, 1.0, 0.8, 1.0], [bite()]),
  e('e_boar', '山间野猪', 1, 'beast', [1.2, 0.9, 1.0, 0.85], [heavy('猪突', 1.6, 0.18)]),
  e('e_wolfking', '独角妖狼', 1, 'beast', [2.8, 1.3, 0.85, 1.15], [{ name: '裂空爪', mult: 1.8, rate: 0.3 }], { boss: true, archetype: 'berserk', phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.5 }, skillChanges: [{ name: '狂化·裂空', mult: 2.2, rate: 0.4 }], label: '狂化' }] }),
  // t2 落霞谷
  e('e_sparrow', '落霞灵雀', 2, 'winged', [0.8, 1.1, 0.7, 1.25], [heavy('霞光啄', 1.5, 0.25)]),
  e('e_stoneape', '谷中石猿', 2, 'beast', [1.3, 1.0, 1.2, 0.9], [heavy('投石', 1.5, 0.2)]),
  e('e_python', '霞光巨蟒', 2, 'serpent', [4.0, 1.1, 1.5, 1.0], [{ name: '绞缠', mult: 1.2, rate: 0.4, effect: 'multi' }], { boss: true, archetype: 'counter', mods: { counterRate: 0.25 }, phases: [{ hpThreshold: 0.5, modChanges: { counterRate: 0.45 }, skillChanges: [{ name: '绞缠·缠绕', mult: 1.5, rate: 0.45, effect: 'multi' }], label: '缠绕' }] }),
  // t3 黑风林
  e('e_bwolf', '黑风狼', 3, 'beast', [1.0, 1.1, 0.9, 1.15], [bite('黑风爪', 1.5)], { element: 'wind' }),
  e('e_vine', '噬人藤', 3, 'verdant', [1.4, 0.9, 1.2, 0.7], [{ name: '缠绕吸血', mult: 1.3, rate: 0.3, effect: 'drain' }], {
    element: 'wood'
  }),
  e('e_bwking', '黑风妖王', 3, 'demon', [3.2, 1.6, 1.6, 1.05], [heavy('黑风啸', 1.8, 0.3)], { boss: true, element: 'wind', archetype: 'spellbane', mods: { damageReduction: 0.15 }, phases: [{ hpThreshold: 0.5, modChanges: { damageReduction: 0.3 }, label: '噬法' }] }),
  // t4 寒潭幽窟
  e('e_snake', '寒潭水蛇', 4, 'serpent', [1.0, 1.1, 0.9, 1.1], [{ name: '寒毒', mult: 1.4, rate: 0.28, effect: 'bleed' }], {
    element: 'water'
  }),
  e('e_bat', '幽窟蝙蝠', 4, 'winged', [0.85, 1.15, 0.8, 1.3], [{ name: '音波', mult: 1.4, rate: 0.25, effect: 'stun' }], { element: 'dark' }),
  e('e_icejiao', '玄冰蛟', 4, 'dragon', [3.4, 1.5, 1.3, 1.1], [{ name: '冰封吐息', mult: 1.6, rate: 0.35, effect: 'pierce' }], { boss: true, element: 'ice', archetype: 'truedmg', phases: [{ hpThreshold: 0.6, skillChanges: [{ name: '冰封·贯体', mult: 2.3, rate: 0.35, effect: 'pierce' }], label: '冰封贯体' }] }),
  // t5 万妖林
  e('e_fox', '三尾灵狐', 5, 'beast', [0.95, 1.2, 0.85, 1.25], [{ name: '魅惑', mult: 1.5, rate: 0.25, effect: 'stun' }], {
    mods: { dodgeRate: 0.15 }
  }),
  e('e_bear', '铁背妖熊', 5, 'beast', [1.5, 1.05, 1.3, 0.8], [heavy('熊霸一击', 1.8, 0.22)]),
  e('e_forestlord', '万妖林主', 5, 'demon', [4.6, 1.2, 1.4, 0.95], [heavy('万妖齐鸣', 2.0, 0.3)], { boss: true, element: 'wood', archetype: 'attrition', mods: { regenPerRound: 0.015 }, phases: [{ hpThreshold: 0.5, modChanges: { regenPerRound: 0.04 }, label: '万妖觉醒' }] }),
  // t6 古战场遗迹
  e('e_soldier', '残魂兵俑', 6, 'construct', [1.1, 1.1, 1.1, 0.95], [heavy('残戈', 1.5, 0.25)], { element: 'dark' }),
  e('e_knight', '怨灵骑士', 6, 'ghost', [1.2, 1.2, 1.0, 1.1], [{ name: '怨气冲锋', mult: 1.7, rate: 0.25, effect: 'bleed' }], {
    element: 'dark'
  }),
  e('e_general', '古将军亡魂', 6, 'ghost', [3.6, 1.4, 1.9, 1.0], [{ name: '将军令', mult: 2.0, rate: 0.28, effect: 'shield' }], {
    boss: true,
    element: 'dark',
    archetype: 'threshold',
    mods: { shieldOnStart: 0.25 },
    phases: [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.45 }, label: '将军誓' }]
  }),
  // t7 赤炎火域
  e('e_firewolf', '赤炎狼', 7, 'beast', [1.05, 1.25, 0.9, 1.15], [heavy('炎爪', 1.6, 0.28)], { element: 'fire' }),
  e('e_golem', '火岩傀儡', 7, 'construct', [1.6, 1.0, 1.5, 0.7], [{ name: '熔岩护体', mult: 1.4, rate: 0.25, effect: 'shield' }], {
    element: 'fire'
  }),
  e('e_firelord', '炎狱魔君', 7, 'demon', [3.8, 2.2, 1.0, 1.2], [heavy('炎狱焚天', 2.1, 0.3)], { boss: true, element: 'fire', archetype: 'berserk', mods: { critRate: 0.15 }, phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.5 }, skillChanges: [{ name: '炎狱·焚天', mult: 2.6, rate: 0.4 }], label: '焚天' }] }),
  // t8 幽冥海
  e('e_shark', '幽冥鬼鲛', 8, 'piscine', [1.15, 1.25, 0.95, 1.2], [bite('鲛噬', 1.7, 0.28)], { element: 'water' }),
  e('e_corpse', '海底沉尸', 8, 'undead', [1.5, 1.0, 1.3, 0.75], [{ name: '尸毒', mult: 1.4, rate: 0.3, effect: 'bleed' }], {
    element: 'dark'
  }),
  e('e_seaking', '幽冥海皇', 8, 'aqueous', [5.0, 1.1, 1.4, 1.0], [{ name: '幽冥潮汐', mult: 1.2, rate: 0.5, effect: 'drain' }, { name: '潮汐回复', mult: 1.0, rate: 0.2, effect: 'drain' }], {
    boss: true,
    element: 'water',
    archetype: 'antiheal',
    mods: { lifesteal: 0.15 },
    phases: [{ hpThreshold: 0.5, modChanges: { lifesteal: 0.3, damageReduction: 0.15 }, label: '潮汐涌动' }]
  }),
  // t9 迷雾沼泽
  e('e_pyth2', '瘴毒巨蟒', 9, 'serpent', [1.3, 1.2, 1.0, 0.95], [{ name: '毒瘴', mult: 1.5, rate: 0.3, effect: 'bleed' }], {
    element: 'wood'
  }),
  e('e_mud', '沼泽泥怪', 9, 'aqueous', [1.7, 0.95, 1.4, 0.65], [{ name: '泥沼吞噬', mult: 1.5, rate: 0.25, effect: 'stun' }], {
    element: 'earth'
  }),
  e('e_poisonlord', '万毒老祖', 9, 'demon', [5.2, 1.2, 1.3, 0.95], [{ name: '万毒噬心', mult: 1.5, rate: 0.4, effect: 'bleed' }], {
    boss: true,
    element: 'wood',
    archetype: 'attrition',
    mods: { regenPerRound: 0.02, lifesteal: 0.12 },
    phases: [{ hpThreshold: 0.5, modChanges: { regenPerRound: 0.05, lifesteal: 0.25 }, label: '万毒沸腾' }]
  }),
  // t10 剑冢
  e('e_swordpuppet', '剑灵傀儡', 10, 'construct', [1.1, 1.35, 1.0, 1.15], [heavy('剑气纵横', 1.8, 0.3)], { element: 'metal' }),
  e('e_brokensword', '断剑残魂', 10, 'blade', [0.95, 1.45, 0.85, 1.25], [{ name: '残剑一斩', mult: 1.6, rate: 0.3, effect: 'pierce' }], {
    element: 'metal'
  }),
  e('e_swordlord', '剑冢之主', 10, 'blade', [4.2, 1.7, 1.4, 1.05], [{ name: '万剑归一', mult: 1.8, rate: 0.35, effect: 'pierce' }], { boss: true, element: 'metal', archetype: 'truedmg', mods: { critDamage: 0.5 }, phases: [{ hpThreshold: 0.6, skillChanges: [{ name: '万剑·贯体', mult: 2.7, rate: 0.35, effect: 'pierce' }], label: '万剑贯体' }] }),
  // t11 雷泽
  e('e_leijiao', '雷泽妖蛟', 11, 'dragon', [1.25, 1.3, 1.05, 1.1], [{ name: '雷吻', mult: 1.8, rate: 0.28, effect: 'stun' }], {
    element: 'thunder'
  }),
  e('e_zeagle', '紫雷鹰', 11, 'winged', [0.95, 1.15, 0.9, 1.35], [{ name: '雷羽连击', mult: 1.2, rate: 0.4, effect: 'multi' }], {
    element: 'thunder',
    mods: { dodgeRate: 0.1 }
  }),
  e('e_leidi', '雷帝残念', 11, 'ghost', [4.6, 2.3, 0.85, 1.2], [{ name: '九霄神雷', mult: 2.4, rate: 0.3, effect: 'stun' }], {
    boss: true,
    element: 'thunder',
    archetype: 'berserk',
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.5 }, skillChanges: [{ name: '九霄·灭世', mult: 2.8, rate: 0.4, effect: 'stun' }], label: '灭世' }]
  }),
  // t12 昆仑雪岭
  e('e_iceape', '雪岭冰猿', 12, 'beast', [1.4, 1.2, 1.25, 0.9], [heavy('冰锤', 1.8, 0.25)], { element: 'ice' }),
  e('e_frostwolf', '霜狼', 12, 'beast', [1.1, 1.3, 1.0, 1.2], [bite('霜牙', 1.7, 0.3)], { element: 'ice' }),
  e('e_icefairy', '堕落冰魄仙子', 12, 'immortal', [4.8, 1.5, 1.2, 1.3], [{ name: '冰魄寒光', mult: 1.7, rate: 0.35, effect: 'pierce' }], {
    boss: true,
    element: 'ice',
    archetype: 'evasive',
    mods: { dodgeRate: 0.3 },
    phases: [{ hpThreshold: 0.5, modChanges: { dodgeRate: 0.5 }, label: '冰魄化身' }]
  }),
  // t13 荒古妖庭
  e('e_guard', '妖庭卫士', 13, 'armored', [1.3, 1.3, 1.2, 1.0], [heavy('妖庭戟法', 1.9, 0.28)]),
  e('e_hydra', '九头妖蛇', 13, 'serpent', [1.6, 1.05, 1.1, 0.9], [{ name: '九首齐噬', mult: 1.1, rate: 0.45, effect: 'multi' }]),
  e('e_yaosheng', '荒古妖圣', 13, 'demon', [6.0, 1.3, 1.5, 1.0], [heavy('妖圣威压', 2.5, 0.3)], { boss: true, archetype: 'attrition', mods: { regenPerRound: 0.02 }, phases: [{ hpThreshold: 0.5, modChanges: { regenPerRound: 0.05, damageBonus: 0.3 }, label: '妖圣临世' }] }),
  // t14 沉沙古城
  e('e_sandzombie', '沙化行尸', 14, 'undead', [1.5, 1.15, 1.3, 0.8], [{ name: '沙暴撕扯', mult: 1.7, rate: 0.28, effect: 'bleed' }], {
    element: 'earth'
  }),
  e('e_gargoyle', '石像鬼', 14, 'construct', [1.4, 1.3, 1.4, 0.95], [{ name: '石化凝视', mult: 1.8, rate: 0.25, effect: 'stun' }], {
    element: 'earth'
  }),
  e('e_citylord', '古城域主', 14, 'demon', [5.2, 1.5, 1.9, 1.0], [{ name: '黄沙百战', mult: 1.3, rate: 0.4, effect: 'pierce' }], {
    boss: true,
    element: 'earth',
    archetype: 'threshold',
    mods: { shieldOnStart: 0.3 },
    phases: [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.5, damageReduction: 0.2 }, label: '黄沙壁垒' }]
  }),
  // t15 蜃楼幻海
  e('e_shen', '蜃妖', 15, 'mirage', [1.3, 1.4, 1.1, 1.15], [{ name: '幻境迷心', mult: 1.9, rate: 0.3, effect: 'stun' }], {
    element: 'water'
  }),
  e('e_rakshasa', '幻海罗刹', 15, 'demon', [1.2, 1.25, 1.0, 1.25], [{ name: '罗刹血爪', mult: 1.15, rate: 0.4, effect: 'multi' }], {
    element: 'dark',
    mods: { dodgeRate: 0.12 }
  }),
  e('e_shenlord', '蜃楼之主', 15, 'mirage', [5.4, 1.6, 1.3, 1.35], [{ name: '海市蜃楼', mult: 1.3, rate: 0.4, effect: 'multi' }], { boss: true, element: 'water', archetype: 'evasive', mods: { dodgeRate: 0.35 }, phases: [{ hpThreshold: 0.5, modChanges: { dodgeRate: 0.55 }, label: '蜃楼幻境' }] }),
  // t16 九幽魔渊
  e('e_devil', '魔渊恶鬼', 16, 'ghost', [1.35, 1.45, 1.15, 1.1], [{ name: '恶鬼噬魂', mult: 2.0, rate: 0.3, effect: 'drain' }], {
    element: 'dark'
  }),
  e('e_demongen', '噬魂魔将', 16, 'demon', [1.5, 1.5, 1.25, 1.05], [{ name: '魔刀断岳', mult: 1.7, rate: 0.28, effect: 'pierce' }], {
    element: 'dark'
  }),
  e('e_demonlord', '九幽魔尊', 16, 'demon', [6.4, 1.2, 1.5, 1.05], [{ name: '九幽噬天', mult: 2.7, rate: 0.32, effect: 'drain' }], {
    boss: true,
    element: 'dark',
    archetype: 'antiheal',
    mods: { lifesteal: 0.2 },
    phases: [{ hpThreshold: 0.5, modChanges: { lifesteal: 0.35, damageReduction: 0.15 }, label: '九幽归一' }]
  }),
  // t17 星陨荒原
  e('e_starpuppet', '星陨傀儡', 17, 'construct', [1.5, 1.4, 1.4, 0.9], [{ name: '星辉贯穿炮', mult: 1.6, rate: 0.3, effect: 'pierce' }], {
    element: 'light'
  }),
  e('e_meteorbeast', '陨铁兽', 17, 'beast', [1.7, 1.35, 1.5, 0.85], [heavy('陨铁冲撞', 2.0, 0.28)], { element: 'metal' }),
  e('e_starbeast', '星空古兽', 17, 'beast', [6.0, 2.4, 1.0, 1.1], [heavy('吞星', 2.8, 0.3)], { boss: true, element: 'light', archetype: 'berserk', mods: { armorPen: 0.2 }, phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.6 }, skillChanges: [{ name: '吞星·爆裂', mult: 3.2, rate: 0.4 }], label: '爆裂' }] }),
  // t18 天外天
  e('e_outsider', '天外来客', 18, 'outsider', [1.4, 1.55, 1.25, 1.2], [heavy('域外神通', 2.3, 0.3)]),
  e('e_voidfish', '虚空游鱼', 18, 'piscine', [1.2, 1.6, 1.1, 1.4], [{ name: '虚空穿梭', mult: 2.2, rate: 0.3, effect: 'stun' }], {
    mods: { dodgeRate: 0.25 }
  }),
  e('e_voidgod', '虚空古神', 18, 'deity', [5.8, 1.8, 1.4, 1.1], [{ name: '湮灭之瞳', mult: 2.2, rate: 0.35, effect: 'pierce' }], { boss: true, archetype: 'truedmg', phases: [{ hpThreshold: 0.6, skillChanges: [{ name: '湮灭·贯穿', mult: 3.4, rate: 0.35, effect: 'pierce' }], label: '贯穿' }] }),
  // t19 仙人遗府
  e('e_xiangui', '守府仙傀', 19, 'construct', [1.6, 1.5, 1.5, 1.0], [{ name: '仙法禁制', mult: 2.3, rate: 0.3, effect: 'shield' }], {
    element: 'light'
  }),
  e('e_shilin', '仙府石麟', 19, 'dragon', [1.8, 1.45, 1.6, 0.9], [heavy('麒麟踏天', 2.4, 0.28)], { element: 'light' }),
  e('e_fuling', '仙府之灵', 19, 'spirit', [6.2, 1.5, 1.9, 1.05], [{ name: '仙府万法', mult: 3.0, rate: 0.32, effect: 'shield' }], {
    boss: true,
    element: 'light',
    archetype: 'threshold',
    mods: { shieldOnStart: 0.35 },
    phases: [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.55, damageReduction: 0.25 }, label: '仙府结界' }]
  }),
  // t20 鸿蒙裂隙
  e('e_hmbeast', '鸿蒙残兽', 20, 'beast', [1.7, 1.6, 1.4, 1.1], [heavy('鸿蒙撕咬', 2.5, 0.3)], { element: 'chaos' }),
  e('e_chaosshadow', '混沌魔影', 20, 'ghost', [1.5, 1.7, 1.3, 1.25], [{ name: '混沌侵蚀', mult: 2.4, rate: 0.32, effect: 'drain' }], {
    element: 'chaos'
  }),
  e('e_hmdemon', '鸿蒙古魔', 20, 'demon', [6.6, 2.6, 1.1, 1.2], [heavy('开天魔焰', 3.2, 0.32)], { boss: true, element: 'chaos', archetype: 'berserk', phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.7 }, skillChanges: [{ name: '开天·灭世', mult: 3.6, rate: 0.4, effect: 'pierce' }], label: '灭世' }] }),

  // ============ 仙界(t21-25)============
  // t21 云海仙门
  e('e_imm_guard', '云海仙卫', 21, 'armored', [1.3, 1.35, 1.25, 1.05], [heavy('仙门戟', 2.0, 0.3)], { element: 'metal' }),
  e('e_imm_crane', '接引仙鹤', 21, 'winged', [1.0, 1.3, 0.95, 1.35], [{ name: '鹤唳长空', mult: 1.1, rate: 0.45, effect: 'multi' }], {
    element: 'wind',
    mods: { dodgeRate: 0.12 }
  }),
  e('e_imm_gate', '仙门执事', 21, 'armored', [5.0, 1.5, 1.5, 1.1], [{ name: '仙门禁制', mult: 2.6, rate: 0.3, effect: 'shield' }], {
    boss: true,
    element: 'metal',
    archetype: 'threshold',
    mods: { shieldOnStart: 0.3 },
    phases: [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.5, damageReduction: 0.2 }, label: '仙门紧闭' }]
  }),
  // t22 金阙玉京
  e('e_imm_jade', '玉京天兵', 22, 'armored', [1.4, 1.4, 1.3, 1.0], [heavy('金阙戟法', 2.1, 0.3)], { element: 'metal' }),
  e('e_imm_spear', '金阙枪灵', 22, 'blade', [1.1, 1.5, 1.0, 1.25], [{ name: '枪出如龙', mult: 2.0, rate: 0.32, effect: 'pierce' }], {
    element: 'metal'
  }),
  e('e_imm_general', '金阙仙将', 22, 'armored', [5.2, 1.8, 1.4, 1.1], [heavy('仙将镇岳', 2.6, 0.32)], {
    boss: true,
    element: 'metal',
    archetype: 'berserk',
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.5 }, skillChanges: [{ name: '仙将·裂天', mult: 3.0, rate: 0.42 }], label: '裂天' }]
  }),
  // t23 瑶池仙苑
  e('e_imm_fairy', '瑶池仙娥', 23, 'immortal', [1.1, 1.4, 1.05, 1.25], [{ name: '仙乐摄魂', mult: 1.9, rate: 0.3, effect: 'stun' }], {
    element: 'wood'
  }),
  e('e_imm_beast', '守苑仙兽', 23, 'beast', [1.7, 1.2, 1.4, 0.9], [{ name: '仙藤缠噬', mult: 2.0, rate: 0.3, effect: 'bleed' }], {
    element: 'wood'
  }),
  e('e_imm_queen', '瑶池仙后', 23, 'immortal', [5.5, 1.6, 1.35, 1.2], [{ name: '瑶池甘露', mult: 2.2, rate: 0.3, effect: 'drain' }], {
    boss: true,
    element: 'wood',
    archetype: 'attrition',
    mods: { regenPerRound: 0.02, lifesteal: 0.12 },
    phases: [{ hpThreshold: 0.5, modChanges: { regenPerRound: 0.16, lifesteal: 0.25 }, label: '仙苑复苏' }]
  }),
  // t24 太乙雷池
  e('e_tai_thunder', '雷池仙灵', 24, 'spirit', [1.3, 1.55, 1.1, 1.2], [{ name: '太乙雷芒', mult: 2.2, rate: 0.3, effect: 'stun' }], {
    element: 'thunder'
  }),
  e('e_tai_light', '太乙仙光', 24, 'spirit', [1.0, 1.6, 0.95, 1.35], [{ name: '仙光贯体', mult: 2.1, rate: 0.32, effect: 'pierce' }], {
    element: 'light'
  }),
  e('e_tai_zun', '太乙雷尊', 24, 'immortal', [5.4, 2.2, 0.95, 1.25], [{ name: '太乙神雷', mult: 2.9, rate: 0.32, effect: 'stun' }], {
    boss: true,
    element: 'thunder',
    archetype: 'berserk',
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.55 }, skillChanges: [{ name: '太乙·灭世雷', mult: 3.3, rate: 0.42, effect: 'pierce' }], label: '灭世雷' }]
  }),
  // t25 大罗天阙
  e('e_luo_star', '大罗星君', 25, 'astral', [1.35, 1.6, 1.25, 1.15], [heavy('星沉一击', 2.5, 0.3)], { element: 'light' }),
  e('e_luo_void', '虚空仙将', 25, 'armored', [1.15, 1.5, 1.05, 1.35], [{ name: '虚空裂斩', mult: 2.3, rate: 0.32 }], {
    element: 'wind',
    mods: { dodgeRate: 0.22 }
  }),
  e('e_luo_lord', '大罗天主', 25, 'deity', [6.0, 2.0, 1.5, 1.2], [{ name: '大罗神通', mult: 2.8, rate: 0.32 }], {
    boss: true,
    element: 'light',
    archetype: 'evasive',
    mods: { dodgeRate: 0.3 },
    phases: [{ hpThreshold: 0.5, modChanges: { dodgeRate: 0.48 }, label: '大罗化身' }]
  }),

  // ============ 神界(t26-29)============
  // t26 神域边陲
  e('e_god_scout', '神域斥候', 26, 'armored', [1.2, 1.5, 1.15, 1.35], [heavy('神风探路', 2.3, 0.3)], { element: 'wind' }),
  e('e_god_beast', '神界凶兽', 26, 'beast', [1.8, 1.3, 1.4, 0.95], [{ name: '凶兽撕裂', mult: 2.4, rate: 0.3, effect: 'bleed' }], {
    element: 'earth'
  }),
  e('e_god_border', '边陲神将', 26, 'armored', [5.6, 2.0, 1.45, 1.15], [{ name: '神威镇守', mult: 2.9, rate: 0.32, effect: 'shield' }], {
    boss: true,
    element: 'wind',
    archetype: 'threshold',
    mods: { damageReduction: 0.2 },
    phases: [{ hpThreshold: 0.5, modChanges: { damageReduction: 0.35, shieldOnStart: 0.4 }, label: '神域封锁' }]
  }),
  // t27 神兵天关
  e('e_god_soldier', '神兵卫', 27, 'armored', [1.5, 1.6, 1.5, 1.05], [heavy('神兵重斩', 2.6, 0.3)], { element: 'metal' }),
  e('e_god_chariot', '战车神兽', 27, 'beast', [2.0, 1.35, 1.5, 0.9], [{ name: '神车碾踏', mult: 1.3, rate: 0.5, effect: 'multi' }], {
    element: 'earth'
  }),
  e('e_god_general', '神将统领', 27, 'armored', [6.2, 2.1, 1.5, 1.15], [{ name: '神兵天罚', mult: 3.0, rate: 0.32 }], {
    boss: true,
    element: 'metal',
    archetype: 'berserk',
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.6 }, skillChanges: [{ name: '天罚·神兵阵', mult: 1.4, rate: 0.5, effect: 'multi' }], label: '神兵阵' }]
  }),
  // t28 神王圣殿
  e('e_god_priest', '圣殿神官', 28, 'deity', [1.3, 1.7, 1.2, 1.2], [{ name: '神言噬魂', mult: 2.5, rate: 0.3, effect: 'drain' }], {
    element: 'light'
  }),
  e('e_god_light', '圣光神使', 28, 'deity', [1.25, 1.6, 1.25, 1.3], [{ name: '圣光贯世', mult: 2.6, rate: 0.32, effect: 'pierce' }], {
    element: 'light'
  }),
  e('e_god_king', '神王', 28, 'deity', [6.6, 2.2, 1.6, 1.2], [{ name: '神王法谕', mult: 3.1, rate: 0.32 }], {
    boss: true,
    element: 'light',
    archetype: 'spellbane',
    mods: { damageReduction: 0.2 },
    phases: [{ hpThreshold: 0.5, modChanges: { damageReduction: 0.38 }, label: '法谕加身' }]
  }),
  // t29 神帝天宫
  e('e_god_guard', '天宫神卫', 29, 'armored', [1.7, 1.7, 1.6, 1.1], [heavy('天宫镇守', 2.9, 0.3)], { element: 'metal' }),
  e('e_god_law', '法则神兽', 29, 'beast', [1.5, 1.8, 1.35, 1.25], [{ name: '法则崩灭', mult: 2.9, rate: 0.32, effect: 'pierce' }], {
    element: 'chaos'
  }),
  e('e_god_emperor', '神帝', 29, 'deity', [7.0, 2.4, 1.6, 1.25], [{ name: '神帝一念', mult: 3.3, rate: 0.32, effect: 'pierce' }], {
    boss: true,
    element: 'chaos',
    archetype: 'threshold',
    mods: { critRate: 0.15 },
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.5, critDamage: 0.5 }, label: '神帝临尘' }]
  }),

  // ============ 混沌海(t30-32)============
  // t30 混沌之滨
  e('e_chaos_wisp', '混沌游灵', 30, 'spirit', [1.3, 1.7, 1.15, 1.4], [{ name: '混沌游弋', mult: 2.6, rate: 0.3 }], {
    element: 'chaos',
    mods: { dodgeRate: 0.2 }
  }),
  e('e_chaos_beast', '混沌异兽', 30, 'beast', [2.0, 1.5, 1.5, 1.05], [{ name: '本源噬体', mult: 2.7, rate: 0.3, effect: 'drain' }], {
    element: 'chaos'
  }),
  e('e_chaos_lord', '混沌真灵', 30, 'spirit', [6.8, 2.3, 1.55, 1.25], [{ name: '真灵噬道', mult: 3.2, rate: 0.32 }], {
    boss: true,
    element: 'chaos',
    archetype: 'evasive',
    mods: { dodgeRate: 0.28 },
    phases: [{ hpThreshold: 0.5, modChanges: { dodgeRate: 0.45, critRate: 0.2 }, label: '真灵无相' }]
  }),
  // t31 神魔渊
  e('e_chaos_demon', '混沌神魔', 31, 'demon', [1.9, 1.9, 1.6, 1.15], [heavy('开天神魔斩', 3.1, 0.32)], { element: 'chaos' }),
  e('e_chaos_void', '虚无凶影', 31, 'ghost', [1.4, 1.8, 1.2, 1.4], [{ name: '虚无侵蚀', mult: 2.8, rate: 0.32, effect: 'pierce' }], {
    element: 'dark'
  }),
  e('e_chaos_king', '混沌神魔王', 31, 'demon', [7.4, 2.5, 1.6, 1.25], [{ name: '神魔开天', mult: 3.5, rate: 0.32 }], {
    boss: true,
    element: 'chaos',
    archetype: 'berserk',
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.7 }, skillChanges: [{ name: '开天·神魔怒', mult: 4.0, rate: 0.42, effect: 'pierce' }], label: '开天' }]
  }),
  // t32 鸿蒙本源
  e('e_chaos_origin', '鸿蒙本源', 32, 'spirit', [2.2, 2.0, 1.7, 1.15], [{ name: '本源演进', mult: 3.3, rate: 0.32, effect: 'pierce' }], {
    element: 'chaos'
  }),
  e('e_chaos_shadow', '大道残影', 32, 'ghost', [1.6, 2.1, 1.35, 1.45], [{ name: '大道千重', mult: 1.5, rate: 0.5, effect: 'multi' }], {
    element: 'chaos'
  }),
  e('e_chaos_zu', '混沌道祖', 32, 'immortal', [8.0, 2.7, 1.7, 1.3], [{ name: '道祖一斩', mult: 3.8, rate: 0.32, effect: 'pierce' }], {
    boss: true,
    element: 'chaos',
    archetype: 'threshold',
    mods: { damageReduction: 0.25, critRate: 0.15 },
    phases: [{ hpThreshold: 0.5, modChanges: { damageReduction: 0.4, damageBonus: 0.5 }, label: '道祖临世' }]
  }),

  // ============ 第二处界域地界(t21-32,与同层正区同难度带)============
  // t21 谪仙古渡
  e('e_banished', '谪仙守卫', 21, 'armored', [1.4, 1.35, 1.3, 1.0], [heavy('谪仙戟', 2.0, 0.3)], { element: 'metal' }),
  e('e_duchuan', '渡厄仙槎', 21, 'aqueous', [1.2, 1.3, 1.1, 1.15], [{ name: '渡厄浪', mult: 1.2, rate: 0.45, effect: 'multi' }], {
    element: 'water'
  }),
  e('e_duweng', '渡人仙翁', 21, 'immortal', [5.1, 1.6, 1.45, 1.1], [{ name: '引渡长生', mult: 2.5, rate: 0.3, effect: 'drain' }], {
    boss: true,
    element: 'water',
    archetype: 'attrition',
    mods: { regenPerRound: 0.02, lifesteal: 0.1 },
    phases: [{ hpThreshold: 0.5, modChanges: { regenPerRound: 0.16, lifesteal: 0.25 }, label: '渡尽苦海' }]
  }),
  // t22 星陨仙台
  e('e_meteorguard', '星陨仙傀', 22, 'construct', [1.35, 1.45, 1.2, 1.05], [heavy('陨星锤', 2.1, 0.3)], { element: 'light' }),
  e('e_ziqi', '紫气仙灵', 22, 'spirit', [1.05, 1.5, 1.0, 1.3], [{ name: '紫气贯顶', mult: 2.0, rate: 0.32, effect: 'pierce' }], {
    element: 'light'
  }),
  e('e_xingtai', '星台仙主', 22, 'immortal', [5.3, 1.9, 1.35, 1.15], [{ name: '星坠一击', mult: 2.7, rate: 0.32, effect: 'pierce' }], {
    boss: true,
    element: 'light',
    archetype: 'truedmg',
    mods: { critDamage: 0.5, critRate: 0.1 },
    phases: [{ hpThreshold: 0.55, skillChanges: [{ name: '星陨·贯天', mult: 3.1, rate: 0.36, effect: 'pierce' }], label: '星陨贯天' }]
  }),
  // t23 不朽金渊
  e('e_goldbeast', '金渊仙兽', 23, 'beast', [1.7, 1.3, 1.5, 0.95], [{ name: '金噬', mult: 2.2, rate: 0.3, effect: 'bleed' }], {
    element: 'metal'
  }),
  e('e_ironbody', '不坏金卫', 23, 'armored', [1.5, 1.2, 1.6, 0.85], [{ name: '不朽壁', mult: 1.8, rate: 0.3, effect: 'shield' }], {
    element: 'metal'
  }),
  e('e_jinyuanzhu', '金渊之主', 23, 'deity', [5.6, 1.7, 1.7, 1.0], [{ name: '不朽金身', mult: 2.6, rate: 0.3, effect: 'shield' }], {
    boss: true,
    element: 'metal',
    archetype: 'threshold',
    mods: { shieldOnStart: 0.3, damageReduction: 0.1 },
    phases: [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.5, damageReduction: 0.2 }, label: '金渊封锁' }]
  }),
  // t24 玄机道场
  e('e_qitong', '玄机道童', 24, 'immortal', [1.1, 1.5, 1.05, 1.3], [{ name: '玄机印', mult: 1.9, rate: 0.3, effect: 'stun' }]),
  e('e_puppet', '机关仙傀', 24, 'construct', [1.6, 1.35, 1.45, 1.0], [{ name: '机括连击', mult: 1.25, rate: 0.5, effect: 'multi' }], {
    element: 'metal'
  }),
  e('e_daozun', '道场仙尊', 24, 'immortal', [5.5, 1.9, 1.3, 1.2], [{ name: '玄机反照', mult: 1.1, rate: 0.55, effect: 'multi' }], {
    boss: true,
    archetype: 'counter',
    mods: { counterRate: 0.2, critDamage: 0.3 },
    phases: [{ hpThreshold: 0.5, modChanges: { counterRate: 0.4 }, skillChanges: [{ name: '玄机·反照', mult: 1.4, rate: 0.5, effect: 'multi' }], label: '玄机反照' }]
  }),
  // t25 罗天星海
  e('e_sealing', '星海仙灵', 25, 'spirit', [1.2, 1.5, 1.1, 1.35], [{ name: '星屑乱舞', mult: 1.3, rate: 0.5, effect: 'multi' }], {
    element: 'light'
  }),
  e('e_meteorbeast', '陨星仙兽', 25, 'beast', [1.8, 1.4, 1.4, 1.0], [heavy('陨星冲撞', 2.5, 0.3)], { element: 'earth' }),
  e('e_xinghaizhu', '星海之主', 25, 'astral', [6.1, 2.0, 1.4, 1.3], [{ name: '星海乱流', mult: 1.3, rate: 0.5, effect: 'multi' }], {
    boss: true,
    element: 'light',
    archetype: 'evasive',
    mods: { dodgeRate: 0.28 },
    phases: [{ hpThreshold: 0.5, modChanges: { dodgeRate: 0.46 }, label: '星海无形' }]
  }),
  // t26 神迹荒原
  e('e_miraclepuppet', '神迹傀儡', 26, 'construct', [1.5, 1.5, 1.5, 1.0], [heavy('神迹重击', 2.4, 0.3)]),
  e('e_wildbeast', '荒原神兽', 26, 'beast', [1.8, 1.35, 1.4, 1.0], [{ name: '荒神撕咬', mult: 2.4, rate: 0.3, effect: 'bleed' }], {
    element: 'earth'
  }),
  e('e_miraclekeeper', '神迹守者', 26, 'armored', [5.7, 2.0, 1.5, 1.1], [{ name: '神迹镇压', mult: 2.9, rate: 0.32 }], {
    boss: true,
    archetype: 'spellbane',
    mods: { damageReduction: 0.2, critRate: 0.12 },
    phases: [{ hpThreshold: 0.5, modChanges: { damageReduction: 0.38 }, label: '神迹不破' }]
  }),
  // t27 陨神战场
  e('e_deadgod', '陨神残魂', 27, 'ghost', [1.4, 1.7, 1.3, 1.1], [{ name: '陨神之噬', mult: 2.5, rate: 0.3, effect: 'drain' }], {
    element: 'dark'
  }),
  e('e_wargod', '神战幽影', 27, 'ghost', [1.3, 1.8, 1.2, 1.25], [{ name: '神战裂影', mult: 2.6, rate: 0.32, effect: 'pierce' }], {
    element: 'dark'
  }),
  e('e_battlelord', '战场主宰', 27, 'deity', [6.3, 2.2, 1.4, 1.2], [heavy('主宰一击', 3.1, 0.32)], {
    boss: true,
    element: 'dark',
    archetype: 'berserk',
    mods: { critRate: 0.15, critDamage: 0.3 },
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.6 }, skillChanges: [{ name: '主宰·屠神', mult: 3.5, rate: 0.42 }], label: '屠神' }]
  }),
  // t28 万神殿堂
  e('e_idol', '神像卫', 28, 'construct', [1.7, 1.6, 1.6, 1.0], [{ name: '神像壁垒', mult: 2.3, rate: 0.3, effect: 'shield' }], {
    element: 'light'
  }),
  e('e_hymn', '颂神使', 28, 'deity', [1.2, 1.7, 1.2, 1.3], [{ name: '颂神光', mult: 2.6, rate: 0.32, effect: 'pierce' }], {
    element: 'light'
  }),
  e('e_pantheonlord', '万神殿主', 28, 'deity', [6.7, 2.1, 1.6, 1.15], [{ name: '万神加护', mult: 3.0, rate: 0.3, effect: 'shield' }], {
    boss: true,
    element: 'light',
    archetype: 'threshold',
    mods: { shieldOnStart: 0.35, critRate: 0.12 },
    phases: [{ hpThreshold: 0.5, modChanges: { shieldOnStart: 0.55, damageReduction: 0.2 }, label: '万神同殿' }]
  }),
  // t29 帝阙天阶
  e('e_tianjiewei', '天阶神卫', 29, 'armored', [1.6, 1.7, 1.55, 1.1], [{ name: '阶前反戈', mult: 1.1, rate: 0.55, effect: 'multi' }], {
    element: 'metal'
  }),
  e('e_royalseal', '帝印神兽', 29, 'treasure', [1.5, 1.8, 1.35, 1.2], [{ name: '帝印镇落', mult: 2.9, rate: 0.32, effect: 'pierce' }], {
    element: 'chaos'
  }),
  e('e_tianjiekeeper', '帝阙守者', 29, 'armored', [7.1, 2.3, 1.6, 1.2], [{ name: '帝阙噬灵', mult: 3.2, rate: 0.3, effect: 'drain' }], {
    boss: true,
    element: 'chaos',
    archetype: 'antiheal',
    mods: { lifesteal: 0.15, critRate: 0.1 },
    phases: [{ hpThreshold: 0.5, modChanges: { lifesteal: 0.38 }, label: '帝阙绝生' }]
  }),
  // t30 真灵幽滩
  e('e_lingying', '真灵游影', 30, 'spirit', [1.35, 1.7, 1.15, 1.4], [{ name: '真灵游噬', mult: 2.6, rate: 0.3, effect: 'drain' }], {
    element: 'chaos'
  }),
  e('e_mudbeast', '幽滩异兽', 30, 'beast', [2.0, 1.5, 1.5, 1.0], [{ name: '幽滩缠噬', mult: 2.7, rate: 0.3, effect: 'bleed' }], {
    element: 'water'
  }),
  e('e_youtanling', '幽滩真灵', 30, 'spirit', [6.9, 2.2, 1.5, 1.25], [heavy('真灵归寂', 3.2, 0.3)], {
    boss: true,
    element: 'chaos',
    archetype: 'attrition',
    mods: { regenPerRound: 0.02, lifesteal: 0.12 },
    phases: [{ hpThreshold: 0.5, modChanges: { regenPerRound: 0.16, lifesteal: 0.28 }, label: '真灵不灭' }]
  }),
  // t31 神魔古祭
  e('e_altar', '古祭神魔', 31, 'demon', [1.9, 1.9, 1.6, 1.15], [heavy('古祭魔斩', 3.1, 0.32)], { element: 'chaos' }),
  e('e_riteshadow', '祭影', 31, 'ghost', [1.4, 1.85, 1.2, 1.4], [{ name: '祭影侵蚀', mult: 2.8, rate: 0.32, effect: 'pierce' }], {
    element: 'dark'
  }),
  e('e_jitanlord', '古祭之主', 31, 'deity', [7.5, 2.4, 1.6, 1.2], [heavy('开祭一击', 3.5, 0.32)], {
    boss: true,
    element: 'chaos',
    archetype: 'berserk',
    mods: { critDamage: 0.4, armorPen: 0.1 },
    phases: [{ hpThreshold: 0.5, modChanges: { damageBonus: 0.7 }, skillChanges: [{ name: '古祭·神魔怒', mult: 4.0, rate: 0.42, effect: 'pierce' }], label: '神魔同祭' }]
  }),
  // t32 道祖悟道崖
  e('e_cliffshadow', '悟道残影', 32, 'ghost', [1.6, 2.0, 1.35, 1.45], [{ name: '道影千重', mult: 1.5, rate: 0.5, effect: 'multi' }], {
    element: 'chaos'
  }),
  e('e_wordbeast', '道文神兽', 32, 'beast', [2.1, 1.9, 1.7, 1.15], [heavy('道文压顶', 3.3, 0.32)], { element: 'chaos' }),
  e('e_daoyalord', '悟道崖主', 32, 'immortal', [8.1, 2.6, 1.7, 1.3], [{ name: '崖前一斩', mult: 3.8, rate: 0.32, effect: 'pierce' }], {
    boss: true,
    element: 'chaos',
    archetype: 'truedmg',
    mods: { critDamage: 0.5, armorPen: 0.1 },
    phases: [{ hpThreshold: 0.55, skillChanges: [{ name: '悟道·斩念', mult: 4.2, rate: 0.36, effect: 'pierce' }], label: '斩念' }]
  })
]

const BY_ID = new Map(ENEMIES.map(x => [x.id, x]))

export function enemyDef(id: string): EnemyDef | undefined {
  return BY_ID.get(id)
}
