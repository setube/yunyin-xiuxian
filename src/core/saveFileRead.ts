/**
 * 读取用户选择的存档文件。
 * 回调可能在组件卸载后到达;调用方卸载时 abort 句柄,之后不再回调。
 */

/**
 * 存档文件大小上限:8 MB。
 *
 * 实测最坏的真实存档 —— 400 件神品满词条装备 —— 密文约 282 KB,
 * 故这个上限是真实体量的三十倍上下,正常存档碰不到。
 * 它的作用不是「限制存档」,而是挡住误选:文件选择器上玩家可能点到一个几百 MB 的视频,
 * `readAsText` 会把它整个读进 WebView 内存 —— 安卓低端机上直接卡死或被系统杀掉。
 * 判据见 saveFileRead.spec「文件过大」。
 */
export const MAX_SAVE_FILE_BYTES = 8 * 1024 * 1024

export interface SaveFileReadHandle {
  abort(): void
}

export interface SaveFileReadOptions {
  /** 注入 FileReader(测试用);省略则用真的 */
  createReader?: () => FileReader
  /**
   * 文件超过 MAX_SAVE_FILE_BYTES 时的回执;省略则并入 onError。
   * 与「读不出」分开报,是因为玩家能做的事不同:一个是选错了文件,一个是文件坏了。
   */
  onTooLarge?: () => void
}

/**
 * @param file.size 取不到(部分测试夹具、个别 WebView)时按「未知」放行,不误拒正常存档。
 */
export function readSaveFile(
  file: File,
  onLoad: (text: string) => void,
  onError: () => void,
  options: SaveFileReadOptions = {}
): SaveFileReadHandle {
  const size = file?.size
  if (typeof size === 'number' && Number.isFinite(size) && size > MAX_SAVE_FILE_BYTES) {
    // 不读就回执:读进内存才是伤害所在
    ;(options.onTooLarge ?? onError)()
    return { abort: () => undefined }
  }

  const reader = (options.createReader ?? (() => new FileReader()))()
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
        // 已完成的读取无法中止;settled 已挡住后续回调
      }
    }
  }
}
