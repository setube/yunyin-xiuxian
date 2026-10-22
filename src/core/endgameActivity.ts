/**
 * 终局「同一时刻只走一条路」的唯一判据。
 *
 * 远征、秘境、历练与付费终局战斗(挑战书/试炼/变数/重写)都押真资源、都要玩家在场;
 * 若允许两处在途,战报、携带气血与扣费会互相串线。入口各自查一遍很容易漏一处,
 * 故核心与界面共用这一份判据,拒绝文案也只写在这里。
 *
 * 这里只做纯判定:在途状态由调用方传入,core 不反向 import store。
 */

export interface EndgameBusy {
  kind: 'expedition' | 'secretRealm' | 'exploration'
  reason: string
}

/** 当前是否已有在途终局活动;没有则返回 null */
export function endgameBusy(worldRun: unknown, secretRealm: unknown, adventureSession: unknown): EndgameBusy | null {
  if (worldRun) {
    return { kind: 'expedition', reason: '远征在途,须先了结眼前的路' }
  }
  if (secretRealm) {
    return { kind: 'secretRealm', reason: '身在秘境之中,须先出了秘境' }
  }
  if (adventureSession) {
    return { kind: 'exploration', reason: '历练在途,须先结束这一程' }
  }
  return null
}
