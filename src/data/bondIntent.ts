/**
 * 道侣的意图(Phase 34.1)
 *
 * ## 34.0 留下的架构问题
 *
 * 34.0 的链路是「世界情境 → 事件出现 → 她在事件里说话」——
 * 这是**世界安排了两个人同时遇到某件事**。
 *
 * 而「她忽然停下,说想去看看前面的路」属于另一件事:
 * **NPC 自己产生意图,然后主动制造接触。**
 *
 * 两者不能共用 triggers,否则会做出假主动:
 *
 *   世界检测到她有个想法 → 世界找一个合适情境 → 她开口
 *
 * 玩家看着像主动,实际仍是引擎主动。
 *
 * ## 真主动的判据:意图的产生不依赖世界情境
 *
 * 意图只由**她自己的经历**催生:共历了什么、你怎么对她、
 * 她未了的事有没有进展。世界情境不决定她有没有这个想法,
 * 只有她自己决定。她想说的时候就会说 —— 不必等世界给位置。
 *
 * ## 不用阈值
 *
 * `trust >= 50 → 主动事件` 会把人重新塞回数值数据库。
 * 这里的酝酿度由**发生了什么**累加,不看当前关系值:
 * 同样的信任,经历不同,她未必开口;经历对了,信任不高她也可能说。
 */
import type { BondStage, DaoluDef, Temperament } from '@/data/daolu'

/** 催生意图的经历类型 —— 全是「发生了什么」,不是「现在是什么状态」 */
export type IntentSpark =
  /** 又一次并肩走过险路 */
  | 'shared'
  /** 你在关键处站在她那边 */
  | 'supported'
  /** 你越过了她的底线 */
  | 'crossed'
  /** 与她未了之事相关的东西出现了 */
  | 'omen'

export const SPARK_NAMES: Record<IntentSpark, string> = {
  shared: '又一次同行',
  supported: '你站在她那边',
  crossed: '你越过了她的线',
  omen: '与她未了之事有关的东西出现了'
}

/**
 * 各类经历对酝酿度的推动。
 *
 * 注意 `crossed` 是负的:被辜负之后,话会咽回去。
 * 这不是「信任下降所以不触发」,而是「这件事让她不想说了」
 */
export const SPARK_WEIGHT: Record<IntentSpark, number> = {
  shared: 0.12,
  supported: 0.22,
  crossed: -0.3,
  omen: 0.35
}

/** 性格决定她多久才肯开口 —— 谨慎的人憋得更久 */
export const TEMPER_RESERVE: Record<Temperament, number> = {
  cautious: 1.35,
  frugal: 1.15,
  curious: 0.85,
  bold: 0.75
}

/** 一个正在酝酿或已提出的意图 */
export interface BondIntent {
  /** 由哪个道侣产生 */
  daoluId: string
  /** 她想做的那件事(由 pursuit 生成) */
  wish: string
  /** 她说出口时的那句话 */
  line: string
  /** 酝酿度 0~1;满了她就会开口 */
  ripeness: number
  /** 催生它的那些经历,按发生顺序 */
  sparks: IntentSpark[]
  /** 已开口几次 */
  raised: number
  /** 玩家历次回应 */
  responses: IntentResponse[]
  /** 已了结:她做成了、放弃了,或你替她了了 */
  settled: boolean
}

/** 玩家的三种回应 —— 「忽略」不是「拒绝」 */
export type IntentResponse =
  /** 应下 */
  | 'accept'
  /** 明确回绝 */
  | 'refuse'
  /** 不作声 */
  | 'ignore'

export const RESPONSE_NAMES: Record<IntentResponse, string> = {
  accept: '应下',
  refuse: '回绝',
  ignore: '不作声'
}

/**
 * 由她的所求生成这一世的意图。
 *
 * 每个人的意图来自 DaoluDef.pursuit —— 那本就是「她自己要做的事」,
 * 33.8 起就写在数据里,只是一直没有机制读它
 */
export function intentFor(def: DaoluDef): { wish: string; line: string } {
  const lines: Record<string, string> = {
    dl_qingli: '她忽然停下:「往北那条路……我想去看看。」',
    dl_zhaoyan: '他把剑横在膝上:「这柄铁剑，我想带它去个地方。」',
    dl_muyan: '她合上册子:「还有一处我没记过。你愿不愿意绕一趟?」',
    dl_hanzheng: '他盯着远处很久:「我听说那个人往这边来过。」',
    dl_yunshu: '她难得没有打盹:「有件事,我想趁还来得及去看一眼。」',
    dl_ligu: '他摊开那件残器:「差最后一味。你陪我去取?」',
    dl_baiwei: '她把药囊系紧:「那张方子还缺一截,我想去找。」',
    dl_zhongli: '他沉默了一路,忽然开口:「当年的事,我想弄清楚。」',
    dl_xuewu: '她握了握剑柄:「有一剑,我想在那个地方递出去。」',
    dl_cangming: '他罕见地认真起来:「我大概知道自己是从哪儿来的了。」'
  }
  return {
    wish: def.pursuit,
    line: lines[def.id] ?? `${def.name}似乎有话想说。`
  }
}

/**
 * 她此刻会不会开口。
 *
 * **不看关系值** —— 只看酝酿够不够、有没有已经在说的、是否已了结。
 * 这是「她自己是事件的来源」的技术含义:
 * 提出与否只由她自己的状态决定,不需要世界给一个情境位
 */
export function willSpeak(intent: BondIntent | null, temper: Temperament): boolean {
  if (!intent || intent.settled) return false
  // 被忽略过之后,她开口的门槛会提高 —— 说了没人应,下次就更难开口
  const ignored = intent.responses.filter(r => r === 'ignore').length
  const bar = TEMPER_RESERVE[temper] * (1 + ignored * 0.4)
  return intent.ripeness >= bar
}

/** 一次经历对酝酿度的推动(已计入性格) */
export function sparkDelta(spark: IntentSpark, temper: Temperament): number {
  const base = SPARK_WEIGHT[spark]
  // 谨慎的人正向推动更慢,负向打击更重
  if (base > 0) return base / TEMPER_RESERVE[temper]
  return base * TEMPER_RESERVE[temper]
}

/** 回应之后她怎么变 —— 结果反过来改变她的状态 */
export interface IntentAftermath {
  /** 关系三维的变化 */
  fate: number
  trust: number
  accord: number
  /** 意图是否就此了结 */
  settled: boolean
  /** 她的反应 */
  text: string
}

export function respondTo(def: DaoluDef, intent: BondIntent, response: IntentResponse): IntentAftermath {
  const ignored = intent.responses.filter(r => r === 'ignore').length
  if (response === 'accept') {
    return {
      fate: 10,
      trust: 16,
      accord: 6,
      settled: true,
      text: `你们一同去了。${def.name}要找的东西未必在那里,但她说这一趟不算白走。`
    }
  }
  if (response === 'refuse') {
    // 回绝伤人,但她知道你听见了
    return {
      fate: 2,
      trust: -8,
      accord: -4,
      settled: false,
      text: `${def.name}点了点头:「也好。」她没有再提,但你知道她还惦记着。`
    }
  }
  // 忽略:第一次她当你没听见,再三之后她自己去了
  if (ignored >= 2) {
    return {
      fate: 0,
      trust: -14,
      accord: -2,
      settled: true,
      text: `${def.name}独自去了那里,回来时什么也没说。有些事她不再指望你。`
    }
  }
  return {
    fate: 1,
    trust: -4,
    accord: 0,
    settled: false,
    text: `你没有接话。${def.name}也就没有再说下去。`
  }
}

/** 意图能出现的最低关系阶 —— 不是阈值触发,只是「还不熟就不会说这种话」 */
export const INTENT_MIN_STAGE: BondStage = 'together'
