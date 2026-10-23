/**
 * 存档导出平台抽象 —— 单测钉住「平台分叉」：
 *
 * - Web/Electron:isNativePlatform()=false,必须走 saveAs 浏览器下载
 * - Android:getPlatform()=android,必须走 SaveTransfer 的 SAF 保存面板
 * - 其他 Capacitor 原生:保留 Filesystem.writeFile 文档目录退路
 *
 * Android 回归重点:
 *   一 不再请求公共存储权限,也不直接写 Documents;
 *   二 只有原生桥回报 saved=true 才返回 null(设置页才记「上次导出」);
 *   三 用户取消与写入失败都要有明确回执,不能假装成功。
 *
 * 故障注入:把 Android 分支改回 requestPermissions + writeFile,
 * 或把 saved=false 当成功,下列用例会红。
 */
import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** node 测试环境无 localStorage,导出路径内部(buildExportPayload)要读它,补一个最小桩 */
class MemStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true })

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue({ uri: 'out.save' }),
  requestPermissions: vi.fn().mockResolvedValue({ publicStorage: 'granted' }),
  isNativePlatform: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
  saveTransfer: vi.fn().mockResolvedValue({ saved: true }),
  registerPlugin: vi.fn()
}))

// 替换 @capacitor/filesystem 为可追踪桩:断言 Web 端绝不调用它
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: mocks.writeFile, requestPermissions: mocks.requestPermissions },
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' }
}))

// 钉死 Capacitor 原生判定为 false(与 vitest/node 环境一致),再导入被测模块
vi.mock('@capacitor/core', async () => {
  const actual = await vi.importActual<typeof import('@capacitor/core')>('@capacitor/core')
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isNativePlatform: mocks.isNativePlatform,
      getPlatform: mocks.getPlatform,
      registerPlugin: mocks.registerPlugin
    }
  }
})

import { Capacitor } from '@capacitor/core'

describe('savePlatform(Web 分支)', () => {
  beforeEach(() => {
    // Web 成功路径现在也会 toast(旧的只是静默返回),给足 Pinia
    setActivePinia(createPinia())
    mocks.writeFile.mockClear()
    mocks.requestPermissions.mockReset()
    mocks.requestPermissions.mockResolvedValue({ publicStorage: 'granted' })
    mocks.isNativePlatform.mockReset()
    mocks.isNativePlatform.mockReturnValue(false)
    mocks.getPlatform.mockReset()
    mocks.getPlatform.mockReturnValue('web')
    mocks.saveTransfer.mockReset()
    mocks.saveTransfer.mockResolvedValue({ saved: true })
    mocks.registerPlugin.mockReset()
    mocks.registerPlugin.mockReturnValue({ save: mocks.saveTransfer })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Web 端(非原生):导出成功返回 null,且绝不触碰 Filesystem', async () => {
    // 环境断言:被测分支确实是 Web 分支
    expect(Capacitor.isNativePlatform()).toBe(false)

    const { exportSaveToDevice } = await import('./savePlatform')
    const result = await exportSaveToDevice()

    expect(result).toBeNull()
    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(mocks.saveTransfer).not.toHaveBeenCalled()
  })

  it('Android 走 SAF:不请求存储权限、不写 Documents,保存成功后返回 null', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')

    const { exportSaveToDevice } = await import('./savePlatform')
    const { useUiStore } = await import('@/stores/ui')
    const result = await exportSaveToDevice()

    expect(result, '系统保存面板写完文件后才算成功').toBeNull()
    expect(mocks.registerPlugin, '要取用 Android 原生 SAF 桥').toHaveBeenCalledWith('SaveTransfer')
    expect(mocks.saveTransfer, '存档文本与 .save 文件名都要交给原生桥').toHaveBeenCalledWith({
      text: expect.any(String),
      fileName: expect.stringMatching(/^yunyin-xiuxian-\d{4}-\d{2}-\d{2}\.save$/)
    })
    expect(mocks.requestPermissions, 'SAF 不需要公共存储权限').not.toHaveBeenCalled()
    expect(mocks.writeFile, 'Android 不得再直接写公共 Documents').not.toHaveBeenCalled()
    expect(useUiStore().toasts).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('已导出「yunyin-xiuxian-'), kind: 'success' })
    )
  })

  it('Android 用户在保存面板取消:不假装成功,设置页不记上次导出', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')
    mocks.saveTransfer.mockResolvedValue({ saved: false })

    const { exportSaveToDevice } = await import('./savePlatform')
    const { useUiStore } = await import('@/stores/ui')
    const result = await exportSaveToDevice()

    expect(result, '取消不是持久备份,必须返回非 null').toBe('已取消导出')
    expect(useUiStore().toasts).toContainEqual(expect.objectContaining({ text: '已取消导出', kind: 'warn' }))
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('Android 原生桥回包缺少 saved 字段:报协议失败,不冒充已导出或用户取消', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')
    mocks.saveTransfer.mockResolvedValue({})

    const { exportSaveToDevice } = await import('./savePlatform')
    const { useUiStore } = await import('@/stores/ui')
    const result = await exportSaveToDevice()

    expect(result, '未知回包不是持久备份,也不能甩锅给玩家').toContain('无法识别的结果')
    expect(useUiStore().toasts).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('无法识别的结果'), kind: 'warn' })
    )
  })

  it('Android 原生写入失败:把真实原因带给玩家,不冒充已导出', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('android')
    mocks.saveTransfer.mockRejectedValue(new Error('目标文件不可写'))

    const { exportSaveToDevice } = await import('./savePlatform')
    const { useUiStore } = await import('@/stores/ui')
    const result = await exportSaveToDevice()

    expect(result).toContain('存档导出失败')
    expect(result).toContain('目标文件不可写')
    expect(useUiStore().toasts).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('目标文件不可写'), kind: 'warn' })
    )
  })

  it('其他原生端存储权限被拒:不写盘,并给玩家明确警告回执', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('ios')
    mocks.requestPermissions.mockResolvedValue({ publicStorage: 'denied' })

    const { exportSaveToDevice } = await import('./savePlatform')
    const { useUiStore } = await import('@/stores/ui')
    const result = await exportSaveToDevice()

    expect(result, '失败原因仍要返回,设置页据此不记「上次导出」').toBe('存储权限被拒绝,无法导出存档')
    expect(mocks.writeFile, '权限被拒时不该继续尝试写 Documents').not.toHaveBeenCalled()
    expect(useUiStore().toasts, '玩家点了导出后必须看到为什么没成').toContainEqual(
      expect.objectContaining({ text: '存储权限被拒绝,无法导出存档', kind: 'warn' })
    )
    expect(mocks.saveTransfer, '非 Android 不该调用 Android SAF 桥').not.toHaveBeenCalled()
  })

  it('其他原生端首次导出递归创建 Export 父目录', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getPlatform.mockReturnValue('ios')

    const { exportSaveToDevice } = await import('./savePlatform')
    const result = await exportSaveToDevice()

    expect(result).toBeNull()
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(/^Export\/yunyin-xiuxian-\d{4}-\d{2}-\d{2}\.save$/),
        directory: 'DOCUMENTS',
        encoding: 'utf8',
        recursive: true
      })
    )
  })
})
