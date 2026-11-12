/**
 * 存档导出:Web/Electron 走浏览器下载,Android 走 SAF 保存面板,其他 Capacitor 原生端写 Documents。
 * Capacitor WebView 无 DownloadListener,`saveAs` 在安卓上无效。
 * Android 不写公共 Documents(Android 10 legacy storage 与 11+ 分区存储下公共目录权限不可靠):
 * SaveTransfer 原生插件开 ACTION_CREATE_DOCUMENT,ContentResolver 写入,无需存储权限且能确认落盘。
 */
import { SAVE_FILE_TEXT } from '@/ui/saveFileText'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { saveAs } from 'file-saver'
import { exportSaveTextWithReport } from './save'
import { useUiStore } from '@/stores/ui'
import { STORE_NAMES } from '@/utils/storage'

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

async function exportSaveOnAndroid(
  text: string,
  file: string,
  receipt: (ok: string) => void = ok => useUiStore().toast(ok, 'success')
): Promise<string | null> {
  try {
    const result = await saveTransferPlugin().save({ text, fileName: file })
    if (result?.saved === true) {
      receipt(`已导出「${file}」`)
      return null
    }
    /*
     * 返回值留真实原因(只判成败、不显示);toast 只报状态。
     *
     * 「已取消」走 info 不走 warn:取消是玩家自己按的,不是失败 ——
     * 报警色一级会让一次主动取消看起来像是出了岔子。整仓的非失败回执都走 info
     * (「今日已完成」「历练结束」等)。真正的协议不会回包才留 warn。
     */
    const cancelled = result?.saved === false
    if (cancelled) useUiStore().toast('已取消导出', 'info')
    else useUiStore().toast(SAVE_FILE_TEXT.exportFailed, 'warn')
    return cancelled ? '已取消导出' : '存档导出失败:原生桥返回了无法识别的结果'
  } catch (error) {
    const detail = error instanceof Error && error.message ? `:${error.message}` : ''
    const reason = `存档导出失败${detail}`
    useUiStore().toast(SAVE_FILE_TEXT.exportFailed, 'warn')
    return reason
  }
}

/**
 * 导出回执:装不全的档不许照报「已导出」。
 *
 * 导出原先只有一句成功 toast,而分片解不出时 buildExportPayload 会**少装一片**
 * (那个 catch 是空吞)—— 玩家以为备份好了,恢复时才发现少一截,且没有任何信号。
 * 现缺片时把结果降级成警告,并点名少了哪几片(分片名走 STORE_NAMES,与损坏提示同一张表)。
 *
 * @param ok 装全了本该说的那句
 * @param missing 没装进去的分片 id
 */
export function exportReceipt(ok: string, missing: readonly string[]): { text: string; kind: 'success' | 'warn' } {
  if (missing.length === 0) return { text: ok, kind: 'success' }
  const names = missing.map(id => STORE_NAMES[id] ?? id).join('、')
  return { text: `导出不全 · 缺${names}`, kind: 'warn' }
}

/** 本机存档导出。返回 null 表示已落盘(记「上次导出」);返回字符串表示未形成持久备份。各路均 toast。 */
export async function exportSaveToDevice(): Promise<string | null> {
  const { text, missing } = exportSaveTextWithReport()
  const receipt = (ok: string): void => {
    const r = exportReceipt(ok, missing)
    useUiStore().toast(r.text, r.kind)
  }
  // 缺片时即便落盘成功也不算「形成了完整备份」:调用方据此不记「上次导出」时间戳
  const incomplete = missing.length > 0 ? `导出不全 · 缺${missing.map(id => STORE_NAMES[id] ?? id).join('、')}` : null
  if (Capacitor.getPlatform() === 'android') {
    return exportSaveOnAndroid(text, exportFileName(), receipt) ?? incomplete
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
      receipt(`已导出到「文档/Export/${file}」`)
      return incomplete
    } catch {
      useUiStore().toast(SAVE_FILE_TEXT.exportFailed, 'warn')
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
    receipt(`已导出「${file}」· 已复制到剪贴板`)
    return incomplete
  }
  if (downloaded) {
    receipt(`已导出「${file}」`)
    return incomplete
  }
  if (clipped) {
    useUiStore().toast('下载失败 · 已复制到剪贴板', 'warn')
    return '存档已复制到剪贴板'
  }
  useUiStore().toast('浏览器不支持导出', 'warn')
  return '浏览器不支持导出'
}
