/**
 * 历练三档触发 —— 际遇 / 机缘 / 奇缘
 *
 * 这三种东西都会在历练途中弹同一个窗,从前它们**长得一模一样**:
 * 标题一律「际遇」,没有档位、没有稀有度、没有概率,玩家根本不知道自己撞上的是
 * 日常小事、一个稀有到千分之几的大机遇,还是自己那条缘的下一程。
 * 于是「机缘」这个低概率高价值的内容在体感上等于普通事件 —— 白做了一套稀有度。
 *
 * 本文件是这三档的**唯一口径**:谁属于哪一档、每档叫什么、稀到什么程度、
 * 界面该染什么色,全部从这里取。事件引擎(选谁)、弹窗(怎么讲)、审计(梯级对不对)
 * 都读同一份,不许在别处再写一份「ft_ 开头是机缘」的判据。
 *
 * 触发顺序(见 core/eventEngine.pickEventFor)决定了一个天然稀度梯级:
 *   一次遭遇先掷「是否出事」→ 出事才在奇缘 / 机缘 / 际遇池里取一个。
 * 所以三档的每程期望次数是**乘出来的**,不是三个独立数字:
 *   际遇 = 1 / p(出事)
 *   奇缘 = 1 / (p(出事) × p(缘起))
 *   机缘 = 1 / (p(出事) × p(奇遇))
 * 这条乘法关系写在 tierEncountersPerTrigger 里,由 eventTier.spec 守着梯级不许倒挂。
 */
import { CHAIN_STAGE_CHANCE, EXPLORE_EVENT_CHANCE, FORTUNE_CHANCE } from '@/data/constants'
import { chainOfEvent } from '@/data/chains'

export type EventTier = 'jingyu' | 'jiyuan' | 'qiyuan'

export interface EventTierDef {
  id: EventTier
  name: string
  /** 一句话:这一档是什么 */
  brief: string
  /** 这一档凭什么来(与代码里的触发口径同源) */
  source: string
  /** 界面用的颜色 token */
  color: string
  /** 稀有度序:数字越大越罕见。际遇 0 → 奇缘 1 → 机缘 2 */
  rarity: number
}

export const EVENT_TIERS: EventTierDef[] = [
  {
    id: 'jingyu',
    name: '际遇',
    brief: '路上撞见的事,常来',
    source: '每次遭遇都可能出事',
    color: 'var(--color-ink-soft)',
    rarity: 0
  },
  {
    id: 'qiyuan',
    name: '奇缘',
    brief: '你这条缘的下一程 —— 缘起了才会再来',
    source: '出事后取当时该走的那一程',
    color: 'var(--color-violet-ink)',
    rarity: 1
  },
  {
    id: 'jiyuan',
    name: '机缘',
    brief: '千载难逢的大机遇,取或不取都要付代价',
    source: '出事后极小概率撞上',
    color: 'var(--color-gold-ink)',
    rarity: 2
  }
]

const BY_ID = new Map(EVENT_TIERS.map(t => [t.id, t]))

export function eventTierDef(id: EventTier): EventTierDef {
  return BY_ID.get(id) ?? EVENT_TIERS[0]!
}

/**
 * 这个事件属于哪一档 —— 判据只有两条,且都取自各自的真相源:
 *   奇缘:链条表认得它(core/chains.chainOfEvent)
 *   机缘:机缘池登记的 ft_ 前缀(id 前缀是这批事件自己的身份,见 data/events)
 * 其余一律是际遇。
 */
export function eventTierOf(eventId: string): EventTier {
  if (chainOfEvent(eventId)) return 'qiyuan'
  if (eventId.startsWith('ft_')) return 'jiyuan'
  return 'jingyu'
}

/**
 * 一次遭遇里各档的触发概率 —— **逐字复刻引擎的掷法**(eventEngine.pickEventFor):
 *
 *   1. 先看这一程出不出事:EXPLORE_EVENT_CHANCE。不出事就什么都没有。
 *   2. 出事后先掷奇缘:CHAIN_STAGE_CHANCE 的闸门,**且必须真有该走的下一程**
 *      (缘未起 / 已走完时这扇门是关的)—— 这时 chain 取 0。
 *   3. 没走奇缘才掷机缘:FORTUNE_CHANCE,且该区域的机缘池非空。
 *   4. 剩下的都是际遇。
 *
 * 从前这里写成「三档各自 = 出事概率 × 各自的数」,把三档当成互斥抽取 ——
 * 于是三档概率之和 0.211 大于「出事」本身的 0.16,数学上就不可能成立:
 * 公告的「际遇约每 6 程」实际是「每 6.4 程会出一次事」,出的事里还有三成是奇缘。
 * 现在按闸门顺序算,并且**把"有没有缘在续"当成入参**(它本来就改变答案):
 *   无缘在续 → 际遇 ≈ 每 6.4 程 · 机缘 ≈ 每 319 程 · 奇缘 不出现
 *   有缘在续 → 际遇 ≈ 每 9.1 程 · 奇缘 ≈ 每 20.8 程 · 机缘 ≈ 每 446 程
 * 判据 eventTier.spec 用真引擎做蒙特卡洛对账,两边不许分叉。
 */
export function tierChances(stagePending: boolean, anyChance = EXPLORE_EVENT_CHANCE): Record<EventTier, number> {
  const any = anyChance
  const chain = stagePending ? CHAIN_STAGE_CHANCE : 0
  return {
    qiyuan: any * chain,
    jiyuan: any * (1 - chain) * FORTUNE_CHANCE,
    jingyu: any * (1 - chain) * (1 - FORTUNE_CHANCE)
  }
}

/** 折成「平均多少程遭遇才见一次」—— 玩家真正读得懂的量级(0 = 这一档此刻不出现) */
export function tierEncountersPerTrigger(tier: EventTier, stagePending: boolean, anyChance = EXPLORE_EVENT_CHANCE): number {
  const p = tierChances(stagePending, anyChance)[tier]
  return p > 0 ? 1 / p : Number.POSITIVE_INFINITY
}

/** 界面用的一句话:「约每 6 程一次」;奇缘无缘在续时说明它为什么不来 */
export function tierOddsText(tier: EventTier, stagePending: boolean, anyChance = EXPLORE_EVENT_CHANCE): string {
  const n = tierEncountersPerTrigger(tier, stagePending, anyChance)
  if (!Number.isFinite(n)) return tier === 'qiyuan' ? '缘起之后才来' : '不出现'
  if (n < 20) return `约每 ${Math.round(n)} 程一次`
  return `约每 ${Math.round(n / 10) * 10} 程一次`
}
