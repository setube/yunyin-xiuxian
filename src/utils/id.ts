/**
 * 唯一 ID 生成。
 *
 * 三种来源拼起来看的是**不撞**,不是随机性:
 *   时间戳(跨会话)+ 进程内递增(同毫秒内多次生成)+ 一小段扰动(同毫秒跨标签页)。
 *
 * **那一段扰动不能用 `Math.random()`。**
 * `utils/storage.ts` 的心跳键为此栽过一次:模块顶层调 `Math.random` 会占掉
 * 那些用 `mockReturnValueOnce` 精确控制随机序列的测试的一次配额,把整条序列往后挪
 * —— 当时 `earlyGameBuffs` 的「灵机一动」用例因此崩掉。
 *
 * `uid()` 也在模块顶层可达的路径上(`equipGen` / `soulForge` / `loadoutService` 的模块级
 * 初始化都可能走到),同一个坑不能踩第二遍。改用 `performance.now()` 的微秒部分做扰动:
 * 它与随机无关,不会干扰任何被测的随机序列。
 */

let counter = 0

export function uid(): string {
  counter = (counter + 1) % 46656
  /*
   * 扰动取 performance.now() 的亚毫秒部分:
   * 同一毫秒内连续生成时,counter 已经保证不同;跨标签页同时生成时,
   * 两个页面各自的 performance.now() 起点不同,微秒尾数大概率不同。
   * 非浏览器环境(单测的 node)下 performance.now 同样存在;都没有时退回 0。
   */
  const jitter = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? Math.floor((performance.now() % 1) * 1296)
    : 0
  return Date.now().toString(36) + counter.toString(36).padStart(3, '0') + jitter.toString(36)
}
