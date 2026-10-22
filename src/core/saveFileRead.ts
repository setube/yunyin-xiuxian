/**
 * 读取用户选择的存档文件。
 *
 * FileReader 是异步的:玩家选完文件就切走页面时,回调仍可能在组件卸载后到达。
 * 这里把「是否已取消」收在读取句柄内,abort 后不再调用任何回调;调用方只需在
 * 卸载时撤销句柄,不必各自记一份 FileReader 状态。
 */
export interface SaveFileReadHandle {
  abort(): void
}

export function readSaveFile(
  file: File,
  onLoad: (text: string) => void,
  onError: () => void,
  createReader: () => FileReader = () => new FileReader()
): SaveFileReadHandle {
  const reader = createReader()
  let settled = false

  reader.onload = () => {
    if (settled) return
    settled = true
    onLoad(String(reader.result ?? ''))
  }
  reader.onerror = () => {
    if (settled) return
    settled = true
    onError()
  }
  reader.readAsText(file)

  return {
    abort() {
      if (settled) return
      settled = true
      try {
        reader.abort()
      } catch {
        // 已进入完成态的读取无法中止;settled 已挡住后续回调
      }
    }
  }
}
