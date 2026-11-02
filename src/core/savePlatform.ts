/**
 * 存档导出:Web/Electron 走浏览器下载,Android 走 SAF 保存面板,其他 Capacitor 原生端写 Documents。
 * Capacitor WebView 无 DownloadListener,`saveAs` 在安卓上无效。
 * Android 不写公共 Documents(Android 10 legacy storage 与 11+ 分区存储下公共目录权限不可靠):
 * SaveTransfer 原生插件开 ACTION_CREATE_DOCUMENT,ContentResolver 写入,无需存储权限且能确认落盘。
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { saveAs } from 'file-saver'
import { exportSaveText } from './save'
import { useUiStore } from '@/stores/ui'

interface SaveTransferPlugin {
  save(options: { text: string; fileName: string }): Promise<{ saved?: boolean }>
}

/** Android SAF 导出桥;只在 Android 分支取用,Web 端不注册 */
function saveTransferPlugin(): SaveTransferPlugin {
  return Capacitor.registerPlugin<SaveTransferPlugin>('SaveTransfer')
}

/**
 * 导出文件名:本地日期,补零到 `YYYY-MM-DD`。
 *
 * 原先是 `new Date().toISOString().slice(0, 10)` —— 那是 **UTC 日**。
 * 中国的玩家在本地 08:00 之前导出,文件名会写成前一天:
 * 实测本地 11 月 3 日 06:00 导出的文件叫 `...-2026-11-02.save`。
 * 全站其他日期(今日任务重置、修习日号)一律走本地日,这里也跟本地。
 */
function exportFileName(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `yunyin-xiuxian-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.save`
}

async function exportSaveOnAndroid(text: string, file: string): Promise<string | null> {
  try {
    const result = await saveTransferPlugin().save({ text, fileName: file })
    if (result?.saved === true) {
      useUiStore().toast(`已导出「${file}」`, 'success')
      return null
    }
    // 返回值留真实原因(只判成败、不显示);toast 只报状态
    const reason = result?.saved === false ? '已取消导出' : '存档导出失败:原生桥返回了无法识别的结果'
    useUiStore().toast(result?.saved === false ? '已取消导出' : '导出失败', 'warn')
    return reason
  } catch (error) {
    const detail = error instanceof Error && error.message ? `:${error.message}` : ''
    const reason = `存档导出失败${detail}`
    useUiStore().toast('导出失败', 'warn')
    return reason
  }
}

/** 本机存档导出。返回 null 表示已落盘(记「上次导出」);返回字符串表示未形成持久备份。各路均 toast。 */
export async function exportSaveToDevice(): Promise<string | null> {
  const text = exportSaveText()
  if (Capacitor.getPlatform() === 'android') {
    return exportSaveOnAndroid(text, exportFileName())
  }
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await Filesystem.requestPermissions()
      if (perm.publicStorage === 'denied') {
        const reason = '存储权限被拒绝'
        useUiStore().toast(reason, 'warn')
        return reason
      }
      const file = exportFileName()
      await Filesystem.writeFile({
        path: `Export/${file}`,
        data: text,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        // 首次导出时 Documents/Export 不存在,不递归建目录会报 missing parent
        recursive: true
      })
      useUiStore().toast(`已导出到「文档/Export/${file}」`, 'success')
      return null
    } catch {
      useUiStore().toast('导出失败', 'warn')
      return '导出失败'
    }
  }
  /*
   * Web 端:saveAs(Blob + a[download])+ 剪贴板兜底。
   * 受限 WebView、应用内浏览器(如 taptap)会静默吞掉 a[download](不抛错、无文件),剪贴板须无条件写。
   * 只有剪贴板时不算持久备份,返回非 null。
   */
  const file = exportFileName()

  // 剪贴板先行:需用户手势 + secure context;不可用不影响下载
  let clipped = false
  try {
    await navigator.clipboard.writeText(text)
    clipped = true
  } catch {
    /* 剪贴板不可用 */
  }

  let downloaded = false
  try {
    saveAs(new Blob([text], { type: 'application/json' }), file)
    downloaded = true
  } catch {
    /* 下载被拦 */
  }

  if (downloaded && clipped) {
    useUiStore().toast(`已导出「${file}」· 已复制到剪贴板`, 'success')
    return null
  }
  if (downloaded) {
    useUiStore().toast(`已导出「${file}」`, 'success')
    return null
  }
  if (clipped) {
    useUiStore().toast('下载失败 · 已复制到剪贴板', 'warn')
    return '存档已复制到剪贴板'
  }
  useUiStore().toast('浏览器不支持导出', 'warn')
  return '浏览器不支持导出'
}
