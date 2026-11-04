import type { CultivatorIdentity, IdentityTraits } from '@/core/identityService'

/**
 * 修行画像的行为三录。
 *
 * 画像弹窗原先只有四行根因(师承 / 道途 / 流派 / 悟道)与一段叙事。
 * 而 core/identityService 算出来的 `traits` 整块**没有任何界面读过** ——
 *   行为特征词(adjective):玩家这一世被归纳成什么样;
 *   风险倾向(riskBias):以险求胜 / 稳扎稳打;
 *   三项计数(kills / explores / breakthroughs):这三个数才是上面两项的来路。
 *
 * 于是「此修士问剑之相已现」这句话,玩家读得到,却读不到它凭什么。
 * 这一层把那三个数摆出来,并标出风险倾向是由哪两项比出来的。
 *
 * 铁律:只转发 core 已算出的数,不另算一份 —— 画像与来路必须是同一份账。
 */

/** 一行计数 */
export interface TraitCounter {
  key: 'kills' | 'explores' | 'breakthroughs'
  label: string
  value: number
}

/** 行为三录 */
export interface TraitRecord {
  /** 三行计数,固定次序 */
  counters: TraitCounter[]
  /** 三项之和 —— 全 0 时整块不出(空态只报状态词) */
  total: number
  /** 行为特征词;空数组表示还没有 */
  adjectives: string[]
  /** 风险倾向的说法;未定时为 null */
  risk: { label: string; note: string } | null
}

const COUNTER_LABELS: Record<TraitCounter['key'], string> = {
  kills: '交手',
  explores: '历练',
  breakthroughs: '突破'
}

/**
 * 风险倾向的说法。
 *
 * 判据在 core(击杀 ≥ 历练 × 2 → 以险求胜,否则稳扎稳打),这里只给它起个名字,
 * 不重复判一次 —— 两处各判一次,阈值一改就会分叉。
 */
const RISK_TEXT: Record<NonNullable<IdentityTraits['riskBias']>, { label: string; note: string }> = {
  gamble: { label: '以险求胜', note: '交手远多于历练' },
  steady: { label: '稳扎稳打', note: '历练不输于交手' }
}

/** 由画像的 traits 排出行为三录 */
export function traitRecord(identity: CultivatorIdentity | null): TraitRecord | null {
  if (!identity) return null
  const t = identity.traits
  const counters: TraitCounter[] = (['kills', 'explores', 'breakthroughs'] as const).map(key => ({
    key,
    label: COUNTER_LABELS[key],
    value: Math.max(0, Math.floor(Number(t.counters?.[key]) || 0))
  }))
  const total = counters.reduce((n, c) => n + c.value, 0)
  return {
    counters,
    total,
    adjectives: Array.isArray(t.adjectives) ? t.adjectives.filter(x => typeof x === 'string' && x.length > 0) : [],
    risk: t.riskBias ? (RISK_TEXT[t.riskBias] ?? null) : null
  }
}

/**
 * 计数刻度的相对长度。
 *
 * 三格不必共用一把绝对尺 —— 三者量级差得远(交手常是历练的几倍),
 * 共尺会把最小的那一项压成一条看不见的短线。故以本组最大值为满格。
 *
 * @returns 每项占本组最大值的比例,0~1;全 0 时全给 0
 */
export function traitBars(record: TraitRecord): number[] {
  const peak = record.counters.reduce((m, c) => Math.max(m, c.value), 0)
  if (peak <= 0) return record.counters.map(() => 0)
  return record.counters.map(c => c.value / peak)
}

/** 是否值得出这一块:三项全 0 且没有特征词时不出 —— 空态只报状态词 */
export function hasTraitRecord(record: TraitRecord | null): boolean {
  if (!record) return false
  return record.total > 0 || record.adjectives.length > 0
}
