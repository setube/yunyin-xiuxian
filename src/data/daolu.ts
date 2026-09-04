/**
 * 道侣(Phase 33.8)
 *
 * ## 核心定义
 *
 * **道侣不是让你变强的人,而是让这一世变得不一样的人。**
 *
 * 她不是装备、不是灵兽、不是 Buff,而是一个拥有自己目标、性格、
 * 修行道路和选择权的角色。玩家不是「获得一个道侣」,而是
 * **这一世遇到了一个人,决定要不要和她一同修行**。
 *
 * ## 硬约束:绝不进入效率链
 *
 * 前面的审计已经证明:任何进入 StatMods 的永久出口,最终都能
 * 找到通往 cultivationSpeed 的路径(见 core/fruitOutlets.ts ——
 * 45 个属性键全部可达)。故道侣的关系值**只转化为事件概率与选项资格**,
 * 不转化为任何数值加成:
 *
 *   不进 StatMods · 不兑换资源 · 不产道果 · 不产宿慧 · 不碰修炼速度
 *
 * `daoluService.spec.ts` 用源码扫描强制这五条。
 *
 * ## 三维关系,不是一根好感度
 *
 * 单一 affection 会退化成送礼数值条。三维各管一件事,且可以背离:
 *
 *   缘分  你们是否真正建立了关系(相遇与共历的累积)
 *   信任  她愿不愿意把自己的事交给你
 *   契合  两人对修行道路的根本理解是否一致
 *
 * 「缘分深、信任高、契合低」是完全合法的状态 ——
 * 两人依然可以结契,但会在重大选择上冲突。
 */
import type { ElementId } from '@/types'

/** 道途倾向 —— 决定她在共同选择上偏向什么 */
export type DaoLean =
  /** 以杀证道 */
  | 'slaughter'
  /** 长生久视 */
  | 'longevity'
  /** 剑心通明 */
  | 'sword'
  /** 丹鼎济世 */
  | 'alchemy'
  /** 器道格物 */
  | 'artifice'
  /** 问心求真 */
  | 'truth'

export const LEAN_NAMES: Record<DaoLean, string> = {
  slaughter: '杀伐',
  longevity: '长生',
  sword: '剑心',
  alchemy: '丹鼎',
  artifice: '器道',
  truth: '问心'
}

/** 行为倾向 —— 共同历练时她会建议什么 */
export type Temperament =
  /** 谨慎:遇险主张绕行 */
  | 'cautious'
  /** 激进:更愿挑战高危 */
  | 'bold'
  /** 惜物:主张保存丹药灵材 */
  | 'frugal'
  /** 好奇:偏向未知与秘境 */
  | 'curious'

export const TEMPER_NAMES: Record<Temperament, string> = {
  cautious: '谨慎',
  bold: '激进',
  frugal: '惜物',
  curious: '好奇'
}

/**
 * 一个道侣角色。
 *
 * 注意这里**没有任何 mods 字段** —— 这是刻意的结构性约束:
 * 类型上就不给「顺手加个属性」留位置
 */
export interface DaoluDef {
  id: string
  name: string
  /** 一句人物速写 */
  brief: string
  /** 性格 */
  temper: Temperament
  /** 道途倾向 */
  lean: DaoLean
  /** 灵根本源(影响相遇地界的偏好) */
  element: ElementId
  /** 初见时的境界(大境界序号) */
  startMajor: number
  /** 她自己要做的事 —— 与玩家无关,但玩家可以介入 */
  pursuit: string
  /** 她不肯越过的线;玩家逼近时契合下降 */
  taboo: string
  /** 相遇偏好的地貌轴;空表示随处可遇 */
  terrains: readonly string[]
}

function d(
  id: string,
  name: string,
  brief: string,
  temper: Temperament,
  lean: DaoLean,
  element: ElementId,
  startMajor: number,
  pursuit: string,
  taboo: string,
  terrains: readonly string[] = []
): DaoluDef {
  return { id, name, brief, temper, lean, element, startMajor, pursuit, taboo, terrains }
}

/**
 * 第一版十位。
 *
 * 刻意不做「最优对象」:每一位在不同世界、不同道途、不同命题下
 * 各有各的合适与不合适(见 daoluFit.spec.ts 的唯一最优检测)
 */
export const DAOLU: DaoluDef[] = [
  d(
    'dl_qingli',
    '沈青璃',
    '寡言的女修,袖口常沾着药渣',
    'cautious',
    'alchemy',
    'wood',
    1,
    '寻找十年前失踪的师尊',
    '不喜杀伐,见人滥杀则远之',
    ['林泽', '山岳']
  ),
  d(
    'dl_zhaoyan',
    '赵砚',
    '背一柄未开锋的铁剑,说要等它自己认主',
    'bold',
    'sword',
    'metal',
    2,
    '把那柄铁剑养到出鞘',
    '不肯用丹药抄近路',
    ['废墟', '山岳']
  ),
  d(
    'dl_muyan',
    '慕烟',
    '走到哪里都在记录草木,笔比剑用得勤',
    'curious',
    'truth',
    'wood',
    1,
    '走遍此世每一处地界,把它记下来',
    '不愿为赶路而毁掉见到的东西',
    []
  ),
  d(
    'dl_hanzheng',
    '韩峥',
    '旧战场上活下来的人,袖中永远有三把匕首',
    'bold',
    'slaughter',
    'dark',
    3,
    '找到当年灭他满门的那个人',
    '受人恩惠必偿,欠债则寝食难安',
    ['废墟', '幽冥']
  ),
  d(
    'dl_yunshu',
    '云舒',
    '总在打盹的散修,醒着的时候话很准',
    'frugal',
    'longevity',
    'water',
    2,
    '活得够久,久到看见一件事的结局',
    '厌恶把命押在一次豪赌上',
    ['林泽', '天象']
  ),
  d(
    'dl_ligu',
    '厉孤',
    '独来独往的炼器师,十指有旧烫痕',
    'frugal',
    'artifice',
    'fire',
    2,
    '复原一件残缺的古器',
    '不许他人碰他未成的器胚',
    ['火域', '废墟']
  ),
  d(
    'dl_baiwei',
    '白薇',
    '医修出身,救人时手很稳,收钱时也很稳',
    'cautious',
    'alchemy',
    'water',
    1,
    '把一门失传的疗伤方子补全',
    '见死不救是她的底线',
    ['林泽', '山岳']
  ),
  d(
    'dl_zhongli',
    '钟离越',
    '前宗门执法,如今只信自己那一套规矩',
    'cautious',
    'truth',
    'earth',
    3,
    '查清当年宗门覆灭的真相',
    '不与背信者同行',
    ['废墟', '山岳']
  ),
  d(
    'dl_xuewu',
    '雪无痕',
    '雪岭里长大的剑修,话少,出手更少但更狠',
    'bold',
    'sword',
    'ice',
    3,
    '在有生之年递出一剑无悔的剑',
    '不受嗟来之食',
    ['山岳', '天象']
  ),
  d(
    'dl_cangming',
    '苍冥',
    '来历不明的修士,自称只是路过',
    'curious',
    'longevity',
    'chaos',
    4,
    '弄清自己为何会在这里醒来',
    '不谈来处,问急了便走',
    ['幽冥', '天象']
  )
]

export function daoluDef(id: string): DaoluDef | undefined {
  return DAOLU.find(x => x.id === id)
}

// ============ 关系阶段 ============

/**
 * 关系阶段 —— 每一步靠**行为条件**推进,不是把数字刷满。
 */
export type BondStage =
  /** 素昧平生 */
  | 'none'
  /** 遇见:打过照面 */
  | 'met'
  /** 熟识:多次相遇 */
  | 'known'
  /** 同行:共历过一次险 */
  | 'together'
  /** 知交:替她了结过一桩事 */
  | 'confidant'
  /** 结契:立过共同的道 */
  | 'pledged'
  /** 道侣 */
  | 'daolv'

export const STAGE_NAMES: Record<BondStage, string> = {
  none: '素昧平生',
  met: '萍水相逢',
  known: '相识',
  together: '同行',
  confidant: '知交',
  pledged: '结契',
  daolv: '道侣'
}

export const STAGE_ORDER: readonly BondStage[] = ['none', 'met', 'known', 'together', 'confidant', 'pledged', 'daolv']

export function stageIndex(s: BondStage): number {
  return STAGE_ORDER.indexOf(s)
}

/** 推进到某阶所需的条件 */
export interface StageGate {
  stage: BondStage
  /** 最低缘分 */
  fate: number
  /** 最低信任 */
  trust: number
  /** 最低契合 */
  accord: number
  /** 需要的共历次数 */
  shared: number
  /** 条件的可读表述 */
  desc: string
}

/**
 * 阶段门槛。
 *
 * 注意契合(accord)只在结契一步成为硬条件 ——
 * 「缘分深、信任高、契合低」的两人可以同行、可以知交,
 * 却走不到立下共同的道那一步
 */
export const STAGE_GATES: readonly StageGate[] = [
  { stage: 'met', fate: 0, trust: 0, accord: 0, shared: 0, desc: '打过照面' },
  { stage: 'known', fate: 20, trust: 0, accord: 0, shared: 0, desc: '数次相遇,记住了彼此' },
  { stage: 'together', fate: 35, trust: 20, accord: 0, shared: 1, desc: '共历一次险境' },
  { stage: 'confidant', fate: 50, trust: 45, accord: 0, shared: 2, desc: '替她了结过一桩事' },
  { stage: 'pledged', fate: 65, trust: 60, accord: 55, shared: 3, desc: '道心相印,立下共同的道' },
  { stage: 'daolv', fate: 80, trust: 75, accord: 65, shared: 4, desc: '结为道侣' }
]

export function gateOf(stage: BondStage): StageGate | undefined {
  return STAGE_GATES.find(g => g.stage === stage)
}

/** 关系结局 —— 一世走完之后留下的那句话 */
export type BondEnding =
  /** 一同走到了这一世的尽头 */
  | 'accompanied'
  /** 半途分道 */
  | 'parted'
  /** 她死在了这一世 */
  | 'perished'
  /** 终究只是错过 */
  | 'missed'

export const ENDING_NAMES: Record<BondEnding, string> = {
  accompanied: '相伴终老',
  parted: '分道扬镳',
  perished: '中道陨落',
  missed: '缘悭一面'
}
