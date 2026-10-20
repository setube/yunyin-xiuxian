/**
 * Phase 28 前期玩法数据 —— 悟道顿悟/突破准备/历练路线/洞府巡游
 */
import type { EnlightenmentOption, BreakthroughPrepOption } from '@/types'

/** 悟道顿悟选项池(修炼时随机触发,三选一) */
export const ENLIGHTENMENT_OPTIONS: EnlightenmentOption[] = [
  // 修炼加速
  {
    type: 'cultivation',
    label: '静心凝神',
    desc: '修炼速度 +20%',
    buffId: 'enlighten_cult',
    duration: 600
  },
  {
    type: 'cultivation',
    label: '道心通明',
    desc: '修炼速度 +35%',
    buffId: 'enlighten_cult_strong',
    duration: 300
  },
  // 战斗增强
  {
    type: 'combat',
    label: '锤炼筋骨',
    desc: '战斗伤害 +15%',
    buffId: 'enlighten_dmg',
    duration: 600
  },
  {
    type: 'combat',
    label: '凝气护体',
    desc: '受到伤害 -12%',
    buffId: 'enlighten_def',
    duration: 600
  },
  // 突破相关
  {
    type: 'breakthrough',
    label: '悟透瓶颈',
    desc: '下次进阶成功率 +8%',
    buffId: 'enlighten_bt',
    duration: 1800
  },
  // 灵气相关
  {
    type: 'qi',
    label: '吐纳有序',
    desc: '灵气回复速度 +25%',
    buffId: 'enlighten_qi',
    duration: 600
  },
  // 悟道点 —— 悟道产出没有速率词条可挂,走即时奖励(文案与实发一致)
  {
    type: 'insight',
    label: '灵机一动',
    desc: '立即获得 5 悟道点',
    duration: 0,
    reward: { type: 'wudao', value: 5 }
  }
]

/** 突破准备选项 */
export const BREAKTHROUGH_PREP_OPTIONS: BreakthroughPrepOption[] = [
  {
    id: 'direct',
    label: '直接突破',
    desc: '无额外准备',
    bonusRate: 0,
    duration: 0
  },
  {
    id: 'meditate',
    label: '静坐调息',
    desc: '耗时3分钟,进阶成功率 +8%',
    bonusRate: 0.08,
    duration: 180
  },
  {
    id: 'pill',
    label: '服用聚气丹',
    desc: '消耗80灵石,进阶成功率 +5%',
    cost: { stone: 80 },
    bonusRate: 0.05,
    duration: 0
  }
]

/** 洞府巡游事件池(location → 事件列表) */
export const CAVE_EVENT_POOL = {
  field: [
    {
      id: 'field_1',
      title: '灵田异象',
      desc: '灵田中灵气波动异常',
      options: [
        { label: '疏导灵气', effect: '获得少量修为', reward: { type: 'exp' as const, secs: 60 } },
        { label: '强行吸收', effect: '获得更多修为,但短时间修炼速度下降', reward: { type: 'exp' as const, secs: 120 }, penalty: { type: 'cultivationSpeed' as const, value: -0.15, duration: 300 } },
        { label: '观察记录', effect: '获得悟道点', reward: { type: 'wudao' as const, value: 3 } }
      ]
    }
  ],
  furnace: [
    {
      id: 'furnace_1',
      title: '丹炉余温',
      desc: '丹炉中残留灵药气息',
      options: [
        { label: '提炼残渣', effect: '获得少量灵石', reward: { type: 'stone' as const, value: 30 } },
        { label: '吸纳药气', effect: '获得临时修炼加速', reward: { type: 'buff' as const, value: 'cave_furnace_cult' } },
        { label: '清理炉体', effect: '获得 2 悟道点', reward: { type: 'wudao' as const, value: 2 } }
      ]
    }
  ],
  library: [
    {
      id: 'library_1',
      title: '藏经阁尘封古籍',
      desc: '书架深处有卷残破古籍',
      options: [
        { label: '研读', effect: '获得悟道点', reward: { type: 'wudao' as const, value: 5 } },
        { label: '抄录', effect: '获得大量悟道点但耗时', reward: { type: 'wudao' as const, value: 12 } },
        { label: '略过', effect: '无事发生', reward: { type: 'stone' as const, value: 0 } }
      ]
    }
  ],
  array: [
    {
      id: 'array_1',
      title: '聚灵阵灵气逸散',
      desc: '聚灵阵中灵气不稳',
      options: [
        { label: '修复阵法', effect: '提升灵气上限', reward: { type: 'buff' as const, value: 'cave_array_qicap' } },
        { label: '导出灵气', effect: '立即获得修为', reward: { type: 'exp' as const, secs: 90 } },
        { label: '任其自然', effect: '无事发生', reward: { type: 'stone' as const, value: 0 } }
      ]
    }
  ],
  garden: [
    {
      id: 'garden_1',
      title: '灵兽园异动',
      desc: '灵兽园中传来奇异鸣叫',
      options: [
        { label: '查看', effect: '发现灵草', reward: { type: 'herb' as const, value: 3 } },
        { label: '安抚灵兽', effect: '提升灵兽效果', reward: { type: 'buff' as const, value: 'cave_garden_pet' } },
        { label: '离开', effect: '无事发生', reward: { type: 'stone' as const, value: 0 } }
      ]
    }
  ]
}

/** 连胜奖励阈值与奖励 */
export const WIN_STREAK_REWARDS = [
  { streak: 3, stone: 20, wudao: 1 },
  { streak: 5, stone: 40, wudao: 2 },
  { streak: 10, stone: 100, wudao: 5 }
]

/**
 * Phase 29 前期机制生命周期衰减
 *
 * 不是"全体降频",而是按事件的打断价值分级:
 * - 顿悟:高价值、高打断 → 保留弹窗,但后期降低频率
 * - 闭关:高价值、低打断 → 保留,后期仍可自由选择
 * - 巡游:低价值、高打断 → 后期降为通知,不再弹窗
 * - 连胜:低价值、高频   → 只在关键节点弹
 *
 * 数值表示"该机制在不同阶段的主动存在感"(0 = 完全退出,1 = 全频)
 */
export const EARLY_EVENT_DECAY = {
  /** 修炼顿悟:前期高,金丹后大幅降低,真仙后退出 */
  enlightenment: {
    lianqi: 1.0,
    zhuji: 0.7,
    jindan: 0.35,
    yuanying: 0.1,
    later: 0
  },
  /** 短时闭关:到中期仍是自由选择,不做强制衰减 */
  shortRetreat: {
    lianqi: 1.0,
    zhuji: 0.9,
    jindan: 0.8,
    yuanying: 0.7,
    later: 0.6
  },
  /** 洞府巡游:前期提活跃,后期让位给更重要的系统 */
  cavePatrol: {
    lianqi: 1.0,
    zhuji: 0.6,
    jindan: 0.25,
    yuanying: 0,
    later: 0
  },
  /** 连胜奖励:保留至元婴,但奖励渐弱 */
  streakBonus: {
    lianqi: 1.0,
    zhuji: 0.85,
    jindan: 0.6,
    yuanying: 0.4,
    later: 0.2
  }
} as const

/**
 * 根据境界获取某机制的衰减系数
 * 境界 0=炼气, 1=筑基, 2=金丹, 3=元婴, 4=化神, 5+=后期
 */
export function earlyEventDecay(mechanism: keyof typeof EARLY_EVENT_DECAY, major: number): number {
  const stage = EARLY_EVENT_DECAY[mechanism]
  if (major <= 0) return stage.lianqi
  if (major === 1) return stage.zhuji
  if (major === 2) return stage.jindan
  if (major === 3) return stage.yuanying
  return stage.later
}
