/** 存档服务:导出 / 导入 / 重置 / 迁移 */
import {
  applyImportPayload,
  buildExportPayload,
  clearAllSave,
  clearCorrupted,
  migrateHerbSlice,
  migrateInventorySlice,
  SAVE_VERSION,
  validateImportPayload,
  type ExportPayload
} from '@/utils/storage'
import { encryptSave, readSaveText } from '@/utils/crypto'
import { realmLabel } from '@/data/realms'
import { useGameStore } from '@/stores/game'
import { engine } from './engine'

/** 迁移旧版本存档(链式) */
function migrate(payload: ExportPayload): ExportPayload {
  const migrated = { ...payload, data: { ...payload.data } }
  if (migrated.version < 2 && typeof migrated.data.inventory === 'object' && migrated.data.inventory !== null) {
    migrated.data.inventory = migrateInventorySlice(migrated.data.inventory as Record<string, unknown>)
  }
  // 灵草五品:旧档单标量 herb 按当前境界折算成品阶分账(同版本形状迁移,恒执行)
  if (typeof migrated.data.resources === 'object' && migrated.data.resources !== null) {
    migrated.data.resources = migrateHerbSlice(migrated.data.resources as Record<string, unknown>)
  }
  /*
   * game 分片里的 saveVersion 也要跟着升。
   *
   * 信封上的 version 是导入闸门用的那一份,而 game 分片里另存了一份 ——
   * 界面「存档版本 v{{ SAVE_VERSION }}」读的是常量,档内那份此前只写不读,
   * 于是导入一份 v1 旧档之后:信封已升到 2,档内还写着 1,界面印 v2。
   * 实测磁盘 game 分片仍是 {"saveVersion":1},水合后 store 也是 1。
   * 三处版本号各说各话,下次要按档内版本判断「这份档升级到哪一步」就无从判断。
   */
  if (migrated.data.game && typeof migrated.data.game === 'object') {
    migrated.data.game = {
      ...(migrated.data.game as Record<string, unknown>),
      // lastActiveAt 重戳为现在:沿用导出时刻会被算成缺勤数月(离线资源按 8h 封顶、年龄却按全程流,先死)
      lastActiveAt: Date.now(),
      saveVersion: SAVE_VERSION
    }
  }
  migrated.version = SAVE_VERSION
  return migrated
}

export function exportSaveText(): string {
  // 导出为密文,防手改;导入时兼容旧版明文 JSON
  return encryptSave(JSON.stringify(buildExportPayload()))
}

/**
 * 导出,并报出「有哪几片没装进去」。
 *
 * 导出原先只有 `exportSaveText`,调用方拿不到缺片信息:分片解不出时少装一片,
 * 导出照报「已导出」。调用方(见 core/savePlatform)据 `missing` 把结果降级成警告。
 */
export function exportSaveTextWithReport(): { text: string; missing: string[] } {
  const payload = buildExportPayload()
  return { text: encryptSave(JSON.stringify(payload)), missing: payload.missing ?? [] }
}

/** 导入存档文本(密文或旧版明文皆可);成功返回 null,失败返回错误信息 */
export function importSaveText(text: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readSaveText(text.trim()))
  } catch {
    return '文件无法解析'
  }
  const error = validateImportPayload(parsed)
  if (error) return error
  try {
    applyImportPayload(migrate(parsed as ExportPayload))
  } catch (e) {
    // 原子导入已回滚旧档,错误信息写明「原档已保留」
    return e instanceof Error ? e.message : '存档写入失败'
  }
  return null
}

export interface ImportInspect {
  name: string
  realmLabel: string
  version: number
  /**
   * 导出时刻;文件里没写、或写了非有限值时是 null。
   * 原先是 `number`,而检视函数要求它必须是 number —— 缺这一格就整份返回 null,
   * 于是确认框既摊不开身份、也摊不开版本,`tooNew` 的置灰一并失效(拒因拖到点了确认才出现)。
   * 而 `exportedAt` 只是文件自带的展示字段,`validateImportPayload` 从不要求它 —— 合法存档可以没有。
   */
  exportedAt: number | null
  /** 备份版本高于当前游戏(确认前展示) */
  tooNew: boolean
}

/** 只读检视待导入的存档(不落库),供确认框展示;解析失败返回 null(交由导入路径报具体错) */
export function inspectImportText(text: string): ImportInspect | null {
  try {
    const parsed = JSON.parse(readSaveText(text.trim())) as Partial<
      ExportPayload & { data?: { player?: { name?: unknown; major?: unknown; sub?: unknown } } }
    >
    if (typeof parsed !== 'object' || parsed === null) return null
    // 版本是导入闸门真正要的那一项;缺它就没有可摊开的东西
    if (typeof parsed.version !== 'number' || !Number.isFinite(parsed.version)) return null
    const player = parsed.data?.player
    const major = typeof player?.major === 'number' && Number.isFinite(player.major) ? player.major : 0
    const sub = typeof player?.sub === 'number' && Number.isFinite(player.sub) ? player.sub : 0
    const at = parsed.exportedAt
    return {
      name: typeof player?.name === 'string' && player.name ? player.name : '无名散修',
      realmLabel: realmLabel(major, sub),
      version: parsed.version,
      exportedAt: typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : null,
      tooNew: parsed.version > SAVE_VERSION
    }
  } catch {
    return null
  }
}

/**
 * 封存写盘:页面即将卸载时,丢弃一切后续 localStorage 写入。
 * persist 插件经 Vue 调度器微任务批量刷盘,清档/导入之后、卸载之前排队的持久化仍会回写(persistState → flushJobs)。
 * 在写盘层截断(拦截 mutation 源头不可穷尽)。
 * 须在导入写盘完成之后调用:setItem 被置为 noop,先调用会吞掉导入的写入。
 */
export function sealStorageWrites(): void {
  const noop = (): undefined => undefined
  // 主路径:改写 Storage.prototype(对所有 Storage 实例生效)
  try {
    Object.defineProperty(Storage.prototype, 'setItem', { value: noop, configurable: true, writable: true })
  } catch {
    // 原型被冻结时降级到下面的实例路径
  }
  // 备用路径:直接改实例。不能作为唯一手段:Storage 带命名属性 setter,
  // 部分 WebView(实测 Android WebView 91)会把这次 defineProperty 存成一条 key 为 setItem 的记录,封存静默失效
  try {
    Object.defineProperty(window.localStorage, 'setItem', { value: noop, configurable: true })
  } catch {
    // 存储不可用时无事可做
  }
}

/**
 * 清空全部存档并回到欢迎页。
 * 顺序:停引擎(去掉 beforeunload 写档)→ 封存写盘(丢弃排队刷盘)→ 清档 → 重载。
 * 不碰 location.hash:改 hash 触发 SPA 导航,persist 订阅会把刚清掉的分片回写
 * (实测 Android WebView 封存失效时 game 分片被写回 started:true,重载后卡在主页);清档后守卫自会弹回 welcome。
 */
export function resetGame(): void {
  engine.stop()
  sealStorageWrites()
  clearAllSave()
  /*
   * 清空存档连隔离出来的坏档一起清 —— 导入不这么做(那边是换档,本机的坏档仍要留给玩家),
   * 清空则是「本机不留上一份任何东西」。两者语义不同,故 clearCorrupted 单开一支。
   */
  clearCorrupted()
  // 内存兜底:reload 异步,卸载前页面仍在跑;两条封存路径都失效时,排队刷盘写回的也是 started:false
  try {
    useGameStore().started = false
  } catch {
    // Pinia 未激活时忽略
  }
  window.location.reload()
}

/**
 * 重载(导入存档后调用)。封存写盘,防排队刷盘在卸载前覆盖刚导入的分片。
 * 不碰 hash:内存 store 还是旧存档,SPA 导航引发的回写会覆盖刚导入的数据。
 */
export function reloadGame(): void {
  engine.stop()
  sealStorageWrites()
  window.location.reload()
}
