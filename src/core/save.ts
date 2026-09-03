/**
 * 存档服务 —— 导出 / 导入 / 重置 / 迁移
 */
import {
  applyImportPayload,
  buildExportPayload,
  clearAllSave,
  migrateInventorySlice,
  SAVE_VERSION,
  validateImportPayload,
  type ExportPayload
} from '@/utils/storage'
import { encryptSave, readSaveText } from '@/utils/crypto'
import { useGameStore } from '@/stores/game'
import { engine } from './engine'
import { saveAs } from 'file-saver'

/** 迁移旧版本存档(链式) */
function migrate(payload: ExportPayload): ExportPayload {
  const migrated = { ...payload, data: { ...payload.data } }
  if (migrated.version < 2 && typeof migrated.data.inventory === 'object' && migrated.data.inventory !== null) {
    migrated.data.inventory = migrateInventorySlice(migrated.data.inventory as Record<string, unknown>)
  }
  migrated.version = SAVE_VERSION
  return migrated
}

export function exportSaveText(): string {
  // 导出为密文,防手改;导入时兼容旧版明文 JSON
  return encryptSave(JSON.stringify(buildExportPayload()))
}

/** 触发浏览器下载存档文件 */
export function downloadSave(): void {
  const text = exportSaveText()
  const blob = new Blob([text], { type: 'application/json' })
  const stamp = new Date().toISOString().slice(0, 10)
  saveAs(blob, `yunyin-xiuxian-${stamp}.save`)
}

/** 导入存档文本(密文或旧版明文皆可);成功返回 null,失败返回错误信息 */
export function importSaveText(text: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readSaveText(text.trim()))
  } catch {
    return '文件内容无法解析(既非本游戏密文,也非有效 JSON)'
  }
  const error = validateImportPayload(parsed)
  if (error) return error
  try {
    applyImportPayload(migrate(parsed as ExportPayload))
  } catch {
    return '写入存档失败,浏览器存储可能不可用'
  }
  return null
}

/**
 * 封存写盘:页面即将卸载时,丢弃一切后续 localStorage 写入。
 * persist 插件的 $subscribe 走 Vue 调度器(微任务批量刷盘)——清档/导入之后、卸载之前,
 * 排队中的持久化仍会执行并把内存状态回写进 localStorage(实测栈:persistState → flushJobs)。
 * 拦截 mutation 源头不可穷尽,直接在写盘层截断
 * 注意:必须在「导入写盘完成之后」调用——它会把 setItem 置为 noop,先调用会吞掉导入的写入
 */
export function sealStorageWrites(): void {
  const noop = (): undefined => undefined
  // 主路径:改写 Storage.prototype。它是普通 JS 对象,defineProperty 行为可预期,
  // 且对所有 Storage 实例生效
  try {
    Object.defineProperty(Storage.prototype, 'setItem', { value: noop, configurable: true, writable: true })
  } catch {
    // 原型被冻结时降级到下面的实例路径
  }
  // 备用路径:直接改实例。仅在原型改写失败时才有意义——
  // Storage 是 WebIDL legacy platform object,带命名属性 setter,部分 WebView
  // (实测 Android WebView 91)会把这次 defineProperty 解释成「存一条 key 为
  // setItem 的记录」,原方法毫发无损,封存静默失效。因此它不能作为唯一手段
  try {
    Object.defineProperty(window.localStorage, 'setItem', { value: noop, configurable: true })
  } catch {
    // 存储不可用时无事可做
  }
}

/**
 * 清空全部存档并回到欢迎页。
 * 顺序:停引擎(去掉 beforeunload 写档)→ 封存写盘(丢弃排队刷盘)→ 清档 → 重载
 *
 * 不碰 location.hash:改 hash 会先触发一次 SPA 路由导航,守卫与新页面挂载期间
 * 内存里的 store 仍是旧状态,persist 订阅会把刚清掉的分片回写。实测 Android
 * WebView 上封存失效时,game 分片被写回 started:true 而 player 分片没被写回,
 * 重载后就卡在主页、角色是默认的无名散修。清档后 game.started 为 false,
 * 守卫会把任何路由都弹回 welcome,目标页无需在这里指定
 */
export function resetGame(): void {
  engine.stop()
  sealStorageWrites()
  clearAllSave()
  // 内存兜底:reload 是异步的,卸载前页面仍在跑。万一两条封存路径都失效,
  // 排队刷盘写回的也是 started:false,守卫照样把人送回 welcome
  try {
    useGameStore().started = false
  } catch {
    // Pinia 未激活时(理论上不会走到)忽略
  }
  window.location.reload()
}

/**
 * 重载(导入存档后调用)。封存写盘,防止排队刷盘在卸载前覆盖刚导入的分片。
 * 同样不碰 hash:导入只写了 localStorage,内存 store 还是旧存档,
 * 一旦触发 SPA 导航引发回写,覆盖的正是刚导入的数据
 */
export function reloadGame(): void {
  engine.stop()
  sealStorageWrites()
  window.location.reload()
}
