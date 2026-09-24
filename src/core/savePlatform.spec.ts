/**
 * 存档导出平台抽象 —— 单测钉住「平台分叉」：
 *
 * - Web/Electron:isNativePlatform()=false,必须走 saveAs 浏览器下载
 * - Capacitor 原生:isNativePlatform()=true,必须走 Filesystem.writeFile 写文档
 *
 * 测试环境 isNativePlatform()=false,故导出应走 Web 分支:
 * 永不触碰 Filesystem(那正是旧实现用 v-if 把按钮藏起来的根因),
 * 且成功返回 null。
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
  requestPermissions: vi.fn().mockResolvedValue({ publicStorage: 'granted' })
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
      isNativePlatform: () => false
    }
  }
})

import { Capacitor } from '@capacitor/core'

describe('savePlatform(Web 分支)', () => {
  beforeEach(() => {
    // Web 成功路径现在也会 toast(旧的只是静默返回),给足 Pinia
    setActivePinia(createPinia())
    mocks.writeFile.mockClear()
    mocks.requestPermissions.mockClear()
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
  })
})
