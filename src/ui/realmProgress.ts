import { SECRET_LAYERS, SECRET_MAX_LOSSES } from '@/data/secretRealms'

/**
 * 秘境进度形制。
 *
 * 秘境是「出则散」的一次性内容:三层、败两次即被逐出。
 * 而界面上这两样都只是数字:「第 2/3 层」一行、「已败 1 场 · 再败 1 场逐出」一行。
 * 要不要再入一层,取决于「还差几层见底」与「还能败几次」——
 * 两个都该是可数的形制,而不是要自己去减的两个数。
 *
 * 门槛全部取自 data/secretRealms 的既有常量,不另立。
 */

/** 层数刻度:已过几层 / 共几层 */
export interface RealmProgress {
  /** 已过层数,夹到 0~总层 */
  layer: number
  /** 总层数 */
  layers: number
  /** 是否已至最深层 */
  deepest: boolean
  /** 还差几层见底;已至最深层为 0 */
  toEnd: number
  /** 还能败几次;已用尽为 0 */
  livesLeft: number
  /** 已用掉几次败场 */
  losses: number
  /** 败场上限 */
  maxLosses: number
}

/**
 * 一层秘境的进度形制。
 *
 * @param layer 当前层
 * @param losses 已败场数
 */
export function realmProgress(layer: number, losses: number): RealmProgress {
  const total = Math.max(1, Math.floor(SECRET_LAYERS))
  const lv = Number.isFinite(layer) ? Math.max(0, Math.min(total, Math.floor(layer))) : 0
  const lost = Number.isFinite(losses) ? Math.max(0, Math.min(SECRET_MAX_LOSSES, Math.floor(losses))) : 0
  return {
    layer: lv,
    layers: total,
    deepest: lv >= total,
    toEnd: total - lv,
    livesLeft: Math.max(0, SECRET_MAX_LOSSES - lost),
    losses: lost,
    maxLosses: SECRET_MAX_LOSSES
  }
}

/** 门槛常量转发:卡片径直接它,而不必再 import 一次 data(两处写同一个数才会分叉) */
export { SECRET_LAYERS, SECRET_MAX_LOSSES }

/** 层数刻度:已过的格为 true。格数随 SECRET_LAYERS 变,模板不再自己数 */
export function realmLayerPips(mark: RealmProgress): boolean[] {
  return Array.from({ length: mark.layers }, (_, i) => i < mark.layer)
}

/**
 * 败场刻度:还能败几次就几颗实心。
 * 与层数反过来 —— 这是**剩余**,不是**已得**:实心越少越危险。
 */
export function realmLifePips(mark: RealmProgress): boolean[] {
  return Array.from({ length: mark.maxLosses }, (_, i) => i < mark.livesLeft)
}
