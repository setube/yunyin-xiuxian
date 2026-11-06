import type { WorldId } from '@/types'
import { REALMS, WORLDS, worldOf } from '@/data/realms'

/**
 * 界域印记:四个界域的「此地不同」。
 *
 * 现状:人间界 / 仙界 / 神界 / 混沌海在界面上只有一处身份 —— 界域名那串灰字,
 * 与「第几境」并列,字号比正文还小。境界谱与历练分组各写一遍,四处界域长得一模一样。
 * 而界域是这一局**最大的分层**:寿元跨一次界翻几十上百倍、内容 gate 全按界域切、
 * 飞升是整局最重的里程碑之一。
 *
 * 这一层只补两样,都不新增数据:
 *   印(seal):每界一个字 —— 凡 / 仙 / 神 / 沌;
 *   框(frame):每界的印框形制不同 —— 单线 / 双线 / 粗线带光 / 圆印。
 *     四界各取一种**形状**,不只靠色:灰度、色弱、小尺寸下照样分得开。
 * 色取既有语义 token,不新增色板项。
 *
 * 铁律:
 *   一 形制不吃指针事件(与其它形制同规,见 palette.spec 的「形制 · 不吃指针事件」);
 *   二 认不出就返回 undefined,不画一份假的;
 *   三 不新增事实源:界域名、界域序、寿元跃升全部从 data/realms 现算。
 */

/** 印框形制:单线方印 / 双线方印 / 粗线带光 / 圆印 */
export type WorldFrame = 'single' | 'double' | 'bold' | 'round'

export interface WorldMark {
  id: WorldId
  /** 界域名,原样转发 data/realms */
  name: string
  /** 印面单字:凡 / 仙 / 神 / 沌 */
  seal: string
  /** 印框形制 */
  frame: WorldFrame
  /** 印面与框的色:既有语义 token 的完整颜色 */
  tone: string
  /** 读屏与 title 的说法 */
  label: string
}

/**
 * 四界各一枚印、一种框、一色。
 *
 * 色只用既有语义色,不新增 token:
 *   人间界取墨(凡尘,最素) · 仙界取金(仙灵) · 神界取朱(神威) · 混沌海取紫(本源)。
 * 框与色两路并行:即便两色在某块底上分不开,方 / 双 / 粗 / 圆四种框也分得开。
 */
const MARKS: Record<WorldId, { seal: string; frame: WorldFrame; tone: string }> = {
  mortal: { seal: '凡', frame: 'single', tone: 'var(--color-ink)' },
  immortal: { seal: '仙', frame: 'double', tone: 'var(--color-gold-ink)' },
  god: { seal: '神', frame: 'bold', tone: 'var(--color-cinnabar)' },
  chaos: { seal: '沌', frame: 'round', tone: 'var(--color-violet-ink)' }
}

/** 界域印记;认不出就是 undefined(不挂形制,而不是挂一份假的) */
export function worldMark(id: WorldId | string): WorldMark | undefined {
  const def = WORLDS.find(w => w.id === id)
  if (!def) return undefined
  const mark = MARKS[def.id]
  if (!mark) return undefined
  return { id: def.id, name: def.name, seal: mark.seal, frame: mark.frame, tone: mark.tone, label: def.name }
}

/**
 * 一次跨界跃升的分量。
 *
 * 突破弹窗此前只写「已入神界。神域之中,法则凝形。」—— 那是文学,不是分量。
 * 玩家真正被打到的是那个数:入仙界寿元 ×102,入神界再 ×9.5。
 * 倍数从 REALMS 的寿元表现算,与「寿元增至」同一份数,不手写。
 */
export interface WorldLeap {
  /** 离开的界域 */
  from: WorldMark
  /** 进入的界域 */
  to: WorldMark
  /** 寿元跃升倍数(四舍五入;不足一倍按 1) */
  factor: number
}

/**
 * 某个大境界若是跨界入口,给出那一跃;否则 undefined。
 *
 * 只认**跨界那一境**:小进阶与同界域内的大关都不算 ——
 * 「跃升」这个词若每境都用,它就不再是跃升。
 */
export function worldLeap(major: number): WorldLeap | undefined {
  if (!Number.isFinite(major)) return undefined
  const m = Math.max(0, Math.min(REALMS.length - 1, Math.floor(major)))
  const world = worldOf(m)
  if (world.start !== m || m === 0) return undefined
  const from = worldMark(worldOf(m - 1).id)
  const to = worldMark(world.id)
  if (!from || !to) return undefined
  const before = REALMS[m - 1]?.lifespanYears ?? 0
  const after = REALMS[m]?.lifespanYears ?? 0
  if (!(before > 0) || !(after > 0)) return undefined
  return { from, to, factor: Math.max(1, Math.round(after / before)) }
}
