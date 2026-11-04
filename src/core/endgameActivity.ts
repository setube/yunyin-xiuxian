/**
 * 终局「同一时刻只走一条路」的唯一判据;核心与界面共用,拒绝文案只写在这里。
 * 远征、秘境、历练与付费终局战斗(挑战书/试炼/变数/重写)若两处在途,战报、携带气血与扣费会串线。
 * 纯判定:在途状态由调用方传入,core 不反向 import store。
 */

/**
 * 四个在途状态词。AGENTS.md 明文规定:这四种以本文件为准,新代码取 `.reason`,不另造说法。
 *
 * 导出成常量而不只写在返回值里 —— 有四处拒绝路径并不经过 endgameBusy
 * (闭关与历练互斥的另一半、秘境入口自己那道门、首页状态行),它们也要说同样的话。
 * 从前那些地方各自手抄一份字面量,改词就得全仓搜,漏一处就出现两套说法。
 */
export const BUSY_REASON = {
  retreat: '闭关中',
  expedition: '远征在途',
  secretRealm: '身在秘境',
  exploration: '历练在途'
} as const

export interface EndgameBusy {
  kind: 'expedition' | 'secretRealm' | 'exploration'
  reason: string
}

/** 当前是否已有在途终局活动;没有则返回 null */
export function endgameBusy(worldRun: unknown, secretRealm: unknown, adventureSession: unknown): EndgameBusy | null {
  if (worldRun) {
    return { kind: 'expedition', reason: BUSY_REASON.expedition }
  }
  if (secretRealm) {
    return { kind: 'secretRealm', reason: BUSY_REASON.secretRealm }
  }
  if (adventureSession) {
    return { kind: 'exploration', reason: BUSY_REASON.exploration }
  }
  return null
}
