/**
 * 短期秘境(Phase 31.0 S3)
 *
 * 一次性内容容器:进入一次、规则随机、结束后消失,不污染大地图。
 * 结构:进入 → 随机规则 → 3 层(事件/战斗/抉择)→ 最终宝藏。
 * 复用:resolveCombat / EventDef / loot,不新建数值体系。
 */
import { rng } from '@/utils/random'
import { usePlayerStore } from '@/stores/player'

export interface SecretRealmState {
  /** 秘境定义 id */
  realmId: string
  /** 进入时玩家境界上下文(存档) */
  enteredAt: number
  /** 当前层 1~3 */
  layer: number
  /** 已胜场 */
  wins: number
  /** 已失败次数(失败 2 次强制出) */
  losses: number
  /** 累计战利描述 */
  spoils: string[]
  /** 随机规则(最大 2 条) */
  rules: string[]
  /** 结束标记 */
  finished: boolean
}

export interface SecretRealmDef {
  id: string
  name: string
  desc: string
  /** 可进入的最低大境界 */
  minMajor: number
  /** 入口代价(道源,复用终局经济) */
  entryCost: number
  /** 可生成的规则池 */
  rulePool: string[]
  /** 层数:固定 3 */
}

/** 是否可以进入(元婴起可探秘境) */
export function realmUnlock(): boolean {
  return usePlayerStore().major >= 3
}

/** 生成一个新秘境状态(写入 player store;进入时调用) */
export function createSecretRealm(): SecretRealmState {
  const player = usePlayerStore()
  const now = Date.now()
  // 规则随机抽 1~2 条(不重复)
  const RULES = [
    '治疗减半',
    '敌方多一段追击',
    '每战结束损失 5% 最大生命',
    '回合上限 20',
    '妖兽狂化(攻击+20%)',
    '不得使用护盾',
    '灵力枯竭(每战首回合无灵气加成)'
  ]
  const n = rng.int(1, 2)
  const rules: string[] = []
  while (rules.length < n) {
    const r = rng.pick(RULES)
    if (!rules.includes(r)) rules.push(r)
  }
  const state: SecretRealmState = {
    realmId: `sr_${now}`,
    enteredAt: now,
    layer: 1,
    wins: 0,
    losses: 0,
    spoils: [],
    rules,
    finished: false
  }
  player.setSecretRealm(state)
  return state
}

/** 当前秘境(无则 null) */
export function currentRealm(): SecretRealmState | null {
  return usePlayerStore().secretRealm
}

/** 离开秘境(结束/放弃) */
export function abandonRealm(): void {
  usePlayerStore().setSecretRealm(null)
}

/** 秘境目录(固定 3 处,进入时随机:效果为主) */
export const SECRET_REALMS: Omit<SecretRealmDef, 'rulePool'>[] = [
  { id: 'sr_kurong', name: '枯荣古境', desc: '所有治疗+100%,但每场结束损失 10% 最大生命', minMajor: 3, entryCost: 40 },
  { id: 'sr_jianzhong', name: '剑冢幻境', desc: '剑意纵横,攻击+30%,防御-20%', minMajor: 3, entryCost: 60 },
  { id: 'sr_kuye', name: '苦海渡舟', desc: '每战只回 30% 气血,但道源收益+50%', minMajor: 4, entryCost: 80 }
]

export function secretRealmDef(id: string): (typeof SECRET_REALMS)[number] | undefined {
  return SECRET_REALMS.find(s => s.id === id)
}
