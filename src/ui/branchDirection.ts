import type { AnyStatKey, StatMods } from '@/types'

/**
 * 悟道分支的方向形制。
 *
 * 分支是「一经选择不可更改、转世不失」的一次抉择 —— 而分支卡上此前只有一行
 * `modsText`,列出两三个词条键与数值。玩家要在三条之间挑一条时,
 * 得先把三行词条逐字读完,再在心里把「会心 + 破甲」与「防御 + 生命」折成同一个问题:
 * **这一条是往哪个方向走**。
 *
 * 这一层只回答那一个问题,不看分支名。
 *
 * 为什么按词条而不按名字:分支名是风味名(「杀伐」「归一」「淬体」),会重名
 * (「化形」在两条分支上、「开天」在三条上),而且没有稳定的字面规律 ——
 * 按名字归类是给文案立法,改一个名字就要回来改表。词条键则是有语义的稳定集合。
 *
 * 四类方向取自词条本身的用途,不新造游戏概念:
 *   攻(attack):伤敌 —— 攻击、会心、破甲、连击、吸命
 *   守(guard) :护身 —— 防御、生命、减伤、回复、反震、护盾
 *   修(growth):长线 —— 修炼、灵气、破境、寿元、天劫抗、气运
 *   疾(fate)  :行止 —— 速度、行程、灵气上限
 *
 * 一条分支若同时落在两类以上,报「合」(blend):那本身就是信息 ——
 * 「这一条两头都沾,样样不精」与「这一条专精一处」是两种抉择。
 */

/** 分支方向 */
export type BranchDirection = 'attack' | 'guard' | 'growth' | 'fate' | 'blend'

export const BRANCH_DIRECTION_NAMES: Record<BranchDirection, string> = {
  attack: '攻',
  guard: '守',
  growth: '修',
  fate: '疾',
  blend: '合'
}

/** 词条键 → 方向。未登记的键不计入任何方向(它们仍会显示在词条行里) */
const KEY_DIRECTION: Partial<Record<AnyStatKey, Exclude<BranchDirection, 'blend'>>> = {
  // 攻
  attackPct: 'attack',
  critRate: 'attack',
  critDamage: 'attack',
  armorPen: 'attack',
  damageBonus: 'attack',
  fullHpDamage: 'attack',
  lowHpDamage: 'attack',
  executeDamage: 'attack',
  comboRate: 'attack',
  comboDamage: 'attack',
  firstStrike: 'attack',
  lifesteal: 'attack',
  // 守
  defensePct: 'guard',
  maxHpPct: 'guard',
  damageReduction: 'guard',
  regenPerRound: 'guard',
  shieldOnStart: 'guard',
  shieldPower: 'guard',
  overhealShield: 'guard',
  lowHpReduction: 'guard',
  counterRate: 'guard',
  counterDamage: 'guard',
  dodgeRate: 'guard',
  accuracy: 'guard',
  stunRate: 'guard',
  // 修
  cultivationSpeed: 'growth',
  qiRegen: 'growth',
  breakthroughRate: 'growth',
  expGain: 'growth',
  lifespanPct: 'growth',
  tribulationResist: 'growth',
  luck: 'growth',
  eventLuck: 'growth',
  dropRate: 'growth',
  spiritStoneGain: 'growth',
  doubleDropRate: 'growth',
  breakRefund: 'growth',
  forgeDiscount: 'growth',
  // 疾
  speed: 'fate',
  explorationSpeed: 'fate',
  qiCapPct: 'fate'
}

export interface BranchDirectionMark {
  /** 方向;`blend` 表示跨两类以上 */
  direction: BranchDirection
  /** 方向的中文单字 */
  name: string
  /** 这一条落在哪几类上(按 攻/守/修/疾 的固定次序),用于读屏与 title */
  hits: Exclude<BranchDirection, 'blend'>[]
  /** 读屏与 title 的说法 */
  label: string
}

/**
 * 一条分支的方向。
 *
 * 只看**方向种类数**:落在一类上就报那一类,落在两类以上报「合」。
 * 不按词条数量加权 —— 加权要挑一套权重,而那正是本模块不该有的东西。
 */
export function branchDirectionMark(mods: StatMods | undefined): BranchDirectionMark {
  const hits: Exclude<BranchDirection, 'blend'>[] = []
  for (const key of Object.keys(mods ?? {})) {
    const dir = KEY_DIRECTION[key as AnyStatKey]
    if (dir && !hits.includes(dir)) hits.push(dir)
  }
  // 固定次序,不随 Object.keys 的插入序变 —— 否则同一份数据能报出两种读法
  const order: Exclude<BranchDirection, 'blend'>[] = ['attack', 'guard', 'growth', 'fate']
  hits.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const direction: BranchDirection = hits.length === 1 ? hits[0]! : 'blend'
  return {
    direction,
    name: BRANCH_DIRECTION_NAMES[direction],
    hits,
    label: hits.length === 0 ? '' : hits.length === 1 ? nameOf(hits[0]!) : `合 · ${hits.map(nameOf).join('')}`
  }
}

function nameOf(d: Exclude<BranchDirection, 'blend'>): string {
  return BRANCH_DIRECTION_NAMES[d]
}

/** 全部方向取值,按固定次序;界面逐类列图例时读它,不另抄一份 */
export function allBranchDirections(): BranchDirection[] {
  return Object.keys(BRANCH_DIRECTION_NAMES) as BranchDirection[]
}
