/**
 * 存档导出平台抽象 —— Web/Electron 走浏览器下载,Android 走 SAF 保存面板,
 * 其他 Capacitor 原生端写 Documents。
 *
 * 背景:SettingsView 原把导出/导入整体用 `!Capacitor.isNativePlatform()` 藏起,
 * 因为 Capacitor WebView 没有 DownloadListener,`saveAs` 触发的下载在安卓上
 * 根本没着落。但存档只存本地、无法备份,卸载/清数据即永久丢失 —— 导出能力
 * 恰恰是移动端最需要的一环。
 *
 * Android 不能继续写公共 Documents:新安装时 Export 父目录不存在,而
 * @capacitor/filesystem 的 writeFile 默认不建父目录;Android 10 的 legacy
 * storage 与 Android 11+ 的分区存储又让公共目录权限变得不可靠。故改由
 * SaveTransfer 原生插件打开 ACTION_CREATE_DOCUMENT,让系统保存面板选择位置,
 * 再用 ContentResolver 写入,既不需要存储权限,也能确认文件真的落盘。
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { saveAs } from 'file-saver'
import { exportSaveText } from './save'
import { useUiStore } from '@/stores/ui'

interface SaveTransferPlugin {
  save(options: { text: string; fileName: string }): Promise<{ saved?: boolean }>
}

/** Android 的 SAF 导出桥;只在 Android 分支取用,避免 Web 端注册一个不存在的原生插件 */
function saveTransferPlugin(): SaveTransferPlugin {
  return Capacitor.registerPlugin<SaveTransferPlugin>('SaveTransfer')
}

function exportFileName(): string {
  return `yunyin-xiuxian-${new Date().toISOString().slice(0, 10)}.save`
}

async function exportSaveOnAndroid(text: string, file: string): Promise<string | null> {
  try {
    const result = await saveTransferPlugin().save({ text, fileName: file })
    if (result?.saved === true) {
      useUiStore().toast(`已导出「${file}」`, 'success')
      return null
    }
    const reason = result?.saved === false ? '已取消导出' : '存档导出失败:原生桥返回了无法识别的结果'
    useUiStore().toast(reason, 'warn')
    return reason
  } catch (error) {
    const detail = error instanceof Error && error.message ? `:${error.message}` : ''
    const reason = `存档导出失败${detail}`
    useUiStore().toast(reason, 'warn')
    return reason
  }
}

/**
 * 本机存档导出:按平台落到可被用户取走的地方。
 *
 * 返回 `null` 表示存档真的落盘成功;返回字符串表示未形成持久备份,
 * 内容为给玩家看的失败/退路说明。两条路都会给 toast 回执。
 */
export async function exportSaveToDevice(): Promise<string | null> {
  const text = exportSaveText()
  if (Capacitor.getPlatform() === 'android') {
    return exportSaveOnAndroid(text, exportFileName())
  }
  if (Capacitor.isNativePlatform()) {
    try {
      // Documents 在部分 Android 上需运行时授权,先问一句,被拒就如实告知
      const perm = await Filesystem.requestPermissions()
      if (perm.publicStorage === 'denied') {
        const reason = '存储权限被拒绝,无法导出存档'
        useUiStore().toast(reason, 'warn')
        return reason
      }
      const file = exportFileName()
      await Filesystem.writeFile({
        path: `Export/${file}`,
        data: text,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        // 首次导出时 Documents/Export 还不存在;不递归建目录会报 missing parent
        recursive: true
      })
      useUiStore().toast(`已导出到「文档/Export/${file}」`, 'success')
      return null
    } catch {
      // 写盘失败(存储不可用/权限异常)明确告知,不静默
      useUiStore().toast('存档导出失败,请检查存储空间后重试', 'warn')
      return '导出失败'
    }
  }
  /*
   * Web 端靠 `saveAs`(Blob + a[download]) + **剪贴板兜底**。
   *
   * 下载本身不是处处都通:受限 WebView、应用内浏览器(taptap 也是其一)里
   * a[download] 常被**静默吞掉** —— 不抛错、也没文件,旧实现于是像点了空气。
   * 故在挂下载之外,一律把存档文本写进剪贴板:无论下载成不成,玩家都拿得走。
   * 提示语把这条退路讲明,不再假装「已导出」。
   *
   * 成功语义:真落盘的下载才算数(返回 null → 记账「上次导出」);
   * 只有剪贴板时返回提示(不记账 —— 文本躺在剪贴板里不算持久备份)。
   */
  const file = exportFileName()

  // 剪贴板先行:写它要有用户手势 + secure context,导出按钮的单击正好给足。
  // 剪贴板不可用(非安全上下文/被禁)不影响下载那条路。
  let clipped = false
  try {
    await navigator.clipboard.writeText(text)
    clipped = true
  } catch {
    /* 剪贴板不可用,静默 —— 下载路还在 */
  }

  let downloaded = false
  try {
    saveAs(new Blob([text], { type: 'application/json' }), file)
    downloaded = true
  } catch {
    /* 下载被拦,看剪贴板 */
  }

  if (downloaded && clipped) {
    useUiStore().toast(`已导出「${file}」(存档文本也已复制到剪贴板备用)`, 'success')
    return null
  }
  if (downloaded) {
    useUiStore().toast(`已导出「${file}」`, 'success')
    return null
  }
  if (clipped) {
    useUiStore().toast('浏览器没能下载 —— 存档文本已复制到剪贴板,新建文本粘贴并另存为 .save 即可导入', 'warn')
    return '存档已复制到剪贴板'
  }
  useUiStore().toast('浏览器既不能下载也复制不了存档,请换一个浏览器打开后再导出', 'warn')
  return '浏览器不支持导出'
}
