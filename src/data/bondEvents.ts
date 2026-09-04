/**
 * 道侣共同事件(Phase 33.9)
 *
 * ## 33.8 留下的缺口
 *
 * 上一版道侣只有「状态」,没有「关系中的事件与选择」。三个缺口
 * (accordShift 无调用点、诉求与底线只是展示文本、玩家做不了选择)
 * 其实是同一件事:**道侣还没有自己的意志。**
 *
 * ## 契合必须是行为结果,不是 API 参数
 *
 * 33.8 的 accordShift 需要调用方把玩家道途传进来,而玩家道途根本
 * 没有系统字段 —— 等于开发者在喂数据。本版改为:
 *
 *   玩家行为计数 → playerLean()  推断玩家实际走的是哪条道
 *   + 道侣道途
 *   + 事件选择与她的诉求/底线是否相合
 *       ↓
 *   三维各自变化
 *
 * 玩家不会看到「accord +5」,只会看到她的反应。
 *
 * ## 三维吃不同类型的行为,不平均分配
 *
 *   缘分  你们一起经历过多少事      —— 共历本身
 *   信任  她敢不敢把事情交给你      —— 是否兑现、是否在危险中支持她
 *   契合  你们到底是不是同一种人    —— 价值观与道途的关键选择
 *
 * ## 边界照旧
 *
 * 共同事件可以改变关系、结局、她是否离开,但**不产出任何**
 * StatMods / 资源 / 道果 / 宿慧。刚拆干净的跨世正反馈不能从这里接回来。
 */
import type { CounterKey } from '@/types'
import { type DaoLean, type DaoluDef } from '@/data/daolu'

/** 关系冲突的类型 —— 六个事件各代表一种,不做重复 */
export type ConflictKind =
  /** 资源冲突:只有一份 */
  | 'resource'
  /** 道途冲突:救还是杀 */
  | 'path'
  /** 风险冲突:陪她冒险还是拦住她 */
  | 'risk'
  /** 价值观冲突:拿到它要伤及无辜 */
  | 'value'
  /** 人生目标:她要离开这条路线 */
  | 'pursuit'
  /** 共同承担:她救你要折损自己 */
  | 'sacrifice'

/** 一个选项对三维的影响 —— 由「与她是谁相合与否」决定,不是固定数值 */
export interface BondOutcome {
  /** 缘分:共历本身带来的深度 */
  fate: number
  /** 信任:她敢不敢把事交给你 */
  trust: number
  /** 契合:你们是不是同一种人 */
  accord: number
  /** 她因此离开 */
  leaves?: boolean
  /** 事件后的叙述 */
  text: string
}

export interface BondChoice {
  id: string
  label: string
  /**
   * 这个选项体现的道途 —— 与她的道途比对后决定契合走向。
   * null 表示这个选项不涉及道途判断(如「两者都不取」)
   */
  lean: DaoLean | null
  /** 是否触碰她的底线 */
  crossesTaboo?: boolean
  /** 是否兑现了对她的支持 */
  supportsHer?: boolean
  /** 是否有风险 */
  risky?: boolean
  outcome: Omit<BondOutcome, 'text'> & { text: string }
}

/**
 * 事件发生的时机 —— 由历练情境决定,不是定时器。
 *
 * 33.9 的事件只在打开道侣弹窗时抽取,内容是真的但**时机是假的**。
 * 34.0 把每个事件挂到它天然属于的那一刻:
 *
 *   进入新地界 → 线索 / 岔路      眼前是没走过的路
 *   首胜之后   → 刀下              刀已经落下,人还跪着
 *   通关首领   → 遗府 / 代价       打开了本不该开的地方
 *   濒死       → 重伤              她手里有能救你的东西
 *
 * 这样共同事件属于「这一段旅程中发生的事」,
 * 而不是「系统随机弹了一个关系窗口」
 */
export type BondTrigger =
  /** 踏入一处新地界 */
  | 'enterPlace'
  /** 在该地界首次获胜 */
  | 'firstVictory'
  /** 击破该地界首领 */
  | 'bossDefeated'
  /** 濒死或败退 */
  | 'nearDeath'

export const TRIGGER_NAMES: Record<BondTrigger, string> = {
  enterPlace: '踏入新地界',
  firstVictory: '首胜之后',
  bossDefeated: '击破首领',
  nearDeath: '濒死之际'
}

export interface BondEventDef {
  id: string
  kind: ConflictKind
  title: string
  /** 事件背景 */
  text: string
  /** 她的诉求 —— 由 DaoluDef.pursuit 填充语气,此处是本事件的具体要求 */
  herWish: string
  /** 她的底线 */
  herLimit: string
  /** 至少到这一阶才会发生 */
  minStageIndex: number
  /** 这件事会在什么时候发生 —— 空数组等于「随时」,那正是要避免的 */
  triggers: readonly BondTrigger[]
  choices: BondChoice[]
  /**
   * 她自己的决定 —— 并非每次都由玩家拍板。
   * 满足条件时她先表态,玩家只能在「尊重/说服/独行」之间选
   */
  sheDecides?: { when: 'lowTrust' | 'lowAccord' | 'cautious'; line: string }
}

function c(
  id: string,
  label: string,
  lean: DaoLean | null,
  outcome: BondChoice['outcome'],
  opts: Partial<Pick<BondChoice, 'crossesTaboo' | 'supportsHer' | 'risky'>> = {}
): BondChoice {
  return { id, label, lean, outcome, ...opts }
}

/**
 * 六个共同事件,各代表一种关系冲突。
 *
 * 刻意不做几十个 —— 类型齐比数量多重要
 */
export const BOND_EVENTS: BondEventDef[] = [
  {
    id: 'be_relic',
    kind: 'resource',
    title: '遗府',
    text: '你与她循着塌了半边的石阶下到底层。案上一卷丹方,更深处的石匣里另有一件法宝,机关将合,只够取走一样。',
    herWish: '她想要那卷丹方——那是她找了很久的东西',
    herLimit: '她不会为了法宝眼睁睁看你去死',
    minStageIndex: 2,
    triggers: ['bossDefeated'],
    choices: [
      c('take_recipe', '取丹方,依她所愿', 'alchemy', {
        fate: 4,
        trust: 12,
        accord: 6,
        text: '她把丹方收进袖中,没有说谢,但那之后你说的话她都听得很认真。'
      }),
      c(
        'take_artifact',
        '取法宝,丹方作罢',
        'artifice',
        {
          fate: 3,
          trust: -14,
          accord: -8,
          text: '她看着石匣合上,什么也没说。回程路上她一直走在你身后半步。'
        },
        { crossesTaboo: true }
      ),
      c(
        'take_both',
        '两样都要',
        null,
        {
          fate: 6,
          trust: -4,
          accord: -2,
          text: '机关落下时她替你挡了一记。丹方到手,法宝碎了半边,她的左臂三日不能抬。'
        },
        { risky: true }
      )
    ]
  },
  {
    id: 'be_spare',
    kind: 'path',
    title: '刀下',
    text: '一名重伤的散修跪在你们面前。他方才还在设伏,如今只求活命。',
    herWish: '她希望留他一条命',
    herLimit: '她不看着人被杀',
    minStageIndex: 2,
    triggers: ['firstVictory'],
    choices: [
      c('spare', '放他走', 'longevity', {
        fate: 3,
        trust: 6,
        accord: 8,
        text: '那人踉跄着消失在林子里。她说:「不是每个人都该死在今天。」'
      }),
      c(
        'kill',
        '斩草除根',
        'slaughter',
        {
          fate: 2,
          trust: -8,
          accord: -12,
          text: '你收剑时她已经转过身去。这一路她再没主动开口。'
        },
        { crossesTaboo: true }
      ),
      c('leave', '不管他,径自离去', null, {
        fate: 1,
        trust: 0,
        accord: -1,
        text: '你们谁也没回头。那人是死是活,后来都无人提起。'
      })
    ]
  },
  {
    id: 'be_lead',
    kind: 'risk',
    title: '线索',
    text: '她在一处断碑上认出了旧年的刻痕。往深处走或许有她要找的东西,那里的凶险却不好说。',
    herWish: '她想进去看看',
    herLimit: '她不愿因自己的事把别人拖下水',
    minStageIndex: 2,
    triggers: ['enterPlace'],
    choices: [
      c(
        'accompany',
        '陪她进去',
        null,
        {
          fate: 8,
          trust: 15,
          accord: 4,
          text: '深处什么也没有,只有一面塌了的墙。她在墙前站了很久,出来时说:「多谢。」'
        },
        { supportsHer: true, risky: true }
      ),
      c('dissuade', '劝她别去', 'longevity', {
        fate: 2,
        trust: -6,
        accord: -3,
        text: '她点头说好,但你知道她记住了那个位置。'
      }),
      c(
        'alone',
        '你自己进去,让她在外面等',
        null,
        {
          fate: 3,
          trust: 4,
          accord: -4,
          text: '你带回半块碑文。她道了谢,却没接过去看:「这是我该自己走的一段。」'
        },
        { risky: true }
      )
    ]
  },
  {
    id: 'be_price',
    kind: 'value',
    title: '代价',
    text: '要取得那味药引,须惊动山下一整座村子的地脉。药引能救她的伤,村子会因此薄收三年。',
    herWish: '她宁可自己扛着伤',
    herLimit: '她不肯让别人替她付代价',
    minStageIndex: 3,
    triggers: ['bossDefeated'],
    choices: [
      c('forgo', '作罢,另寻他法', 'truth', {
        fate: 4,
        trust: 8,
        accord: 14,
        text: '她笑了一下,说这是她认识你以来最像你的一次。'
      }),
      c(
        'take',
        '取药引,救她要紧',
        'alchemy',
        {
          fate: 5,
          trust: 6,
          accord: -16,
          text: '伤是好了。她后来常望着山下的方向出神,没再提过这件事。'
        },
        { crossesTaboo: true }
      ),
      c('ask', '让她自己决定', null, {
        fate: 3,
        trust: 10,
        accord: 5,
        text: '她想了很久,说不要。你尊重了她的选择——她记住了这一点。'
      })
    ]
  },
  {
    id: 'be_depart',
    kind: 'pursuit',
    title: '岔路',
    text: '她说她要往北去了。那是与你这一世的路线相反的方向,而她要找的人可能在那里。',
    herWish: '她想去完成自己的事',
    herLimit: '她不肯让人为她改道',
    minStageIndex: 3,
    triggers: ['enterPlace'],
    sheDecides: { when: 'lowAccord', line: '她已经收好了行囊,像是不打算商量。' },
    choices: [
      c(
        'follow',
        '陪她走这一趟',
        null,
        {
          fate: 12,
          trust: 18,
          accord: 8,
          text: '你们绕了很远。她要找的人不在那里,但她说这趟路她记一辈子。'
        },
        { supportsHer: true, risky: true }
      ),
      c(
        'stop',
        '拦下她',
        null,
        {
          fate: 2,
          trust: -12,
          accord: -10,
          text: '她留下了,却不再提北边的事。有些话一旦没说出口,就再也不会说了。'
        },
        { crossesTaboo: true }
      ),
      c('part_ways', '各走各的路', null, {
        fate: 0,
        trust: -2,
        accord: 6,
        leaves: true,
        text: '她说:「你我本就不是一条道上的人,这样也好。」然后头也不回地走了。'
      })
    ]
  },
  {
    id: 'be_rescue',
    kind: 'sacrifice',
    title: '重伤',
    text: '你伤得很重。她手里有一枚能救你的丹,那是她攒了三年、准备用来突破的东西。',
    herWish: '她已经把丹药握在手里了',
    herLimit: '她不喜欢欠人情,也不喜欢别人欠她',
    minStageIndex: 3,
    triggers: ['nearDeath'],
    sheDecides: { when: 'lowTrust', line: '她犹豫了一下,把丹药收了回去。' },
    choices: [
      c('accept', '受了她这枚丹', null, {
        fate: 10,
        trust: 12,
        accord: 2,
        text: '她的境界因此停在原处两年。这件事你们谁都没再提。'
      }),
      c(
        'refuse',
        '推开她的手',
        'longevity',
        {
          fate: 6,
          trust: -4,
          accord: 10,
          text: '你自己熬了过来。她说:「你这个人,真是。」语气里听不出是气还是别的。'
        },
        { supportsHer: true }
      ),
      c('trade', '要她记下这份人情', null, {
        fate: 4,
        trust: -10,
        accord: -6,
        text: '她把丹给了你,也把这句话记下了。此后她待你客气了许多。'
      })
    ]
  }
]

export function bondEventDef(id: string): BondEventDef | undefined {
  return BOND_EVENTS.find(e => e.id === id)
}

// ============ 玩家道途:由行为推断,不是设定 ============

/**
 * 各道途对应的行为计数。
 *
 * 玩家没有「选择道途」的按钮 —— 他走的是哪条道,由他做过什么决定。
 * 这样契合才是**行为的结果**,而不是喂进来的参数
 */
export const LEAN_COUNTERS: Record<DaoLean, readonly CounterKey[]> = {
  slaughter: ['kills', 'bossKills'],
  longevity: ['breakthroughs', 'tribulations'],
  sword: ['battles', 'upgrades'],
  alchemy: ['pillsCrafted', 'pillsUsed'],
  artifice: ['equipsGained', 'decomposed'],
  truth: ['gongfaLearned', 'events']
}

/** 各道途的行为量级差异很大,故按典型量纲归一 */
const LEAN_SCALE: Record<DaoLean, number> = {
  slaughter: 300,
  longevity: 30,
  sword: 400,
  alchemy: 40,
  artifice: 60,
  truth: 40
}

/**
 * 由行为计数推断玩家实际在走的道。
 *
 * 取归一后最高的一条;都很低时返回 null(还没走出自己的路)
 */
export function leanFromCounters(counter: (k: CounterKey) => number): DaoLean | null {
  let best: DaoLean | null = null
  let bestScore = 0
  for (const [lean, keys] of Object.entries(LEAN_COUNTERS) as [DaoLean, readonly CounterKey[]][]) {
    const raw = keys.reduce((s, k) => s + counter(k), 0)
    const score = raw / LEAN_SCALE[lean]
    if (score > bestScore) {
      bestScore = score
      best = lean
    }
  }
  // 阈值:行为量太少时不判定道途
  return bestScore >= 0.15 ? best : null
}

// ============ 选择的后果 ============

/**
 * 结算一个选择。
 *
 * 三维各吃不同来源:
 *   缘分  选项自带(共历本身)
 *   信任  选项自带 + 是否支持她 + 是否触碰底线
 *   契合  选项自带 + **玩家道途与她道途的关系**
 *
 * 最后一项正是 33.8 缺失的那条链:契合终于由「你是谁」决定
 */
export function resolveChoice(
  def: DaoluDef,
  choice: BondChoice,
  playerLean: DaoLean | null
): BondOutcome & { leanShift: number } {
  const o = choice.outcome
  // 选项体现的道途与她的道途是否相合
  const tension: Partial<Record<DaoLean, DaoLean>> = {
    slaughter: 'longevity',
    longevity: 'slaughter',
    sword: 'alchemy',
    alchemy: 'sword'
  }
  let leanShift = 0
  if (choice.lean) {
    if (choice.lean === def.lean) leanShift = 6
    else leanShift = tension[def.lean] === choice.lean ? -8 : -2
  }
  /**
   * 玩家一贯的道途也参与判断 —— 这是契合成为「行为结果」的关键一环。
   *
   * 三档都要有区别,否则「杀伐玩家」与「丹鼎玩家」做同一个选择会拿到
   * 完全相同的契合,那就退回了 33.8「接口存在但玩家无关」的状态
   */
  if (playerLean) {
    if (playerLean === def.lean) leanShift += 3
    else if (tension[def.lean] === playerLean) leanShift -= 5
    else leanShift -= 1
  }
  return {
    fate: o.fate,
    trust: o.trust + (choice.supportsHer ? 4 : 0) + (choice.crossesTaboo ? -6 : 0),
    accord: o.accord + leanShift,
    leaves: o.leaves,
    text: o.text,
    leanShift
  }
}

/** 她是否会自己先做决定 */
export function sheDecidesNow(
  def: BondEventDef,
  bond: { trust: number; accord: number },
  temper: string
): string | null {
  if (!def.sheDecides) return null
  const w = def.sheDecides.when
  if (w === 'lowTrust' && bond.trust < 40) return def.sheDecides.line
  if (w === 'lowAccord' && bond.accord < 45) return def.sheDecides.line
  if (w === 'cautious' && temper === 'cautious') return def.sheDecides.line
  return null
}
