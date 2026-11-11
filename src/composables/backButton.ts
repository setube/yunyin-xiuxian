/**
 * 安卓实体返回键的处置顺序。
 *
 * 返回键在原生壳里整个交给 ExitConfirmDialog 的 backButton 监听
 * (注册后 Capacitor 不再自己 goBack,见 AppPlugin.java)。三个分支的先后
 * 是有讲究的,而这段逻辑此前只写在组件里、没有任何判据 —— 而它是 APK 里
 * 退出游戏的唯一路径:顺序错了,要么一次返回就退游戏,要么退不出去。
 *
 * 抽成纯函数是为了让它可测:组件只负责把三个输入递进来、把结果执行掉。
 *
 * 顺序:
 *   1. **弹窗栈优先** —— Esc 与返回键同一条规矩,先关栈顶一层;
 *      栈顶不可关时连根页也不回(与 handleEscape 的「吞掉」同义)。
 *   2. **不在根页先回根页** —— 各页是并列标签页,不逐条回溯历史。
 *   3. **在根页** 才开退出确认。
 *
 * @param overlayClosed 这一次返回是否已被弹窗栈消费(handleEscape() 的返回值)
 * @param onRoot        当前是否已在根页
 */
export type BackAction = 'close-overlay' | 'go-root' | 'confirm-exit'

export function decideBackAction(overlayClosed: boolean, onRoot: boolean): BackAction {
  if (overlayClosed) return 'close-overlay'
  if (!onRoot) return 'go-root'
  return 'confirm-exit'
}
