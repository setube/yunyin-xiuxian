import { SECRET_REALMS, type SecretRealmDef } from '@/data/secretRealms'

/**
 * 秘境双轴形制。
 *
 * 五处秘境在「进哪一处」这张清单上此前只差名字与代价,而玩家要比较的其实是两个量:
 *   **层间回血**(healBetweenPct):能撑几层 —— 少回甚至倒扣,走三层就难;
 *   **战利倍率**(rewardMult):值得走多远。
 *
 * 这两个量数据里本来就有,只是从未画出来。这一层把它们各画成一根轴,
 * 共用五处秘境的最小与最大,任意两处可以横向比。
 *
 * 为什么不把两根轴合成一根「险」:试过一个版本,用「层间回血越低越险」做归一,
 * 结果枯荣(每层倒扣,但治疗翻倍)被判成最凶、归墟(敌人体量 + 敌方减伤)反而居中 ——
 * 那是**受伤**这一个量在冒充**凶险**,而凶险其实分散在 rules 的多个字段里。
 * 与其折算成一个假数,不如两根轴各说各的真话。
 */
function extents(): { healMin: number; healMax: number; rewardMin: number; rewardMax: number } {
  const heals = SECRET_REALMS.map(r => r.healBetweenPct)
  const rewards = SECRET_REALMS.map(r => r.rewardMult)
  return {
    healMin: Math.min(...heals),
    healMax: Math.max(...heals),
    rewardMin: Math.min(...rewards),
    rewardMax: Math.max(...rewards)
  }
}

/** 回血轴:0(五处里回得最少)~ 1(回得最多)。倒扣那一处落在 0 */
export function healPosOf(def: Pick<SecretRealmDef, 'healBetweenPct'>): number {
  const { healMin, healMax } = extents()
  if (!Number.isFinite(def.healBetweenPct) || healMax <= healMin) return 0
  const t = (def.healBetweenPct - healMin) / (healMax - healMin)
  return Math.max(0, Math.min(1, t))
}

/** 战利轴:0(最少)~ 1(最多) */
export function gainOf(def: Pick<SecretRealmDef, 'rewardMult'>): number {
  const { rewardMin, rewardMax } = extents()
  if (!Number.isFinite(def.rewardMult) || rewardMax <= rewardMin) return 0
  const t = (def.rewardMult - rewardMin) / (rewardMax - rewardMin)
  return Math.max(0, Math.min(1, t))
}

export interface RealmMark {
  /** 回血位置 0~1 */
  heal: number
  /** 战利位置 0~1 */
  gain: number
  /** 读屏与 title 的说法:原值照写,不折算 */
  label: string
}

/** 回血档的说法:层间回血按「扣 / 少回 / 多回」三态,不写百分比(卡面已有原值) */
function healWord(healBetweenPct: number): string {
  if (!Number.isFinite(healBetweenPct)) return '不明'
  if (healBetweenPct < 0) return '每层倒扣'
  if (healBetweenPct <= 0.3) return '层间少回'
  return '层间多回'
}

/** 一处秘境的双轴形制;坏值一律夹在 0~1,不抛错 */
export function realmMark(def: SecretRealmDef): RealmMark {
  const heal = healPosOf(def)
  const gain = gainOf(def)
  return {
    heal,
    gain,
    /*
     * 两轴在卡面上各有名字:「回血」「战利」。label 里只写「每层倒扣」是没有主语的 ——
     * 读屏听到的是一个形容词,不知道它在说哪一根轴。带上轴名,与卡面文字对得上
     * (WAI label-in-name:可访问名须含可见文本)。
     */
    label: `${def.name} · 回血${healWord(def.healBetweenPct)} · 战利 ×${def.rewardMult}`
  }
}

/** 五处全部形制;用于判据核对每一处都算得出来 */
export function realmMarks(): RealmMark[] {
  return SECRET_REALMS.map(realmMark)
}

/** 战利最丰的那一处:只给它多一层形制(与「最上档才给」同一条理) */
export function isTopGain(mark: RealmMark): boolean {
  return mark.gain >= 1
}

export { healWord }

/**
 * 秘境入口卡的可访问名。
 *
 * `realmMark().label` 只报形制(名字 · 回血档 · 战利倍率),而同一张卡上还印着两样东西:
 * **入场所需的代价**(灵石 / 道源)与**此刻为什么进不去**。眼睛看得到,读屏读不到 ——
 * 一件「要付 4.468 亿灵石」的事,读屏用户听不到价钱就做了决定。
 *
 * 名字只出现一次:`label` 本就以名字起头,拒因与代价往后接。
 * (原先直接把拒因前插到 label 前面,读出来是「枯荣古境 · 入 境 · 枯荣古境 · 每层倒扣…」——
 *  名字念了两遍,代价仍然缺席。)
 *
 * @param mark  这一处的形制(label 里已含名字)
 * @param cost  入场代价的现成读数(「灵石 4.468亿」/「道源 15」),由 core 算好传进来
 * @param block 拒因;可进入时为 null
 */
export function realmEntryLabel(mark: RealmMark, cost: string, block: string | null): string {
  const parts = [mark.label, `入 境 · ${cost}`]
  if (block) parts.push(block)
  return parts.join(' · ')
}
