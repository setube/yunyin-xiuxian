/**
 * Android 存档导入/导出接线审计。
 *
 * 这里没有 Android SDK,无法在单测里启动系统文件选择器;但两条最容易回退的接线
 * 可以静态钉住:
 *   一 MainActivity 必须在 super.onCreate 前注册 SaveTransfer,否则 JS 根本看不到插件;
 *   二 原生导出必须走 ACTION_CREATE_DOCUMENT + ContentResolver,不能回到公共 Documents;
 *   三 两个导入入口都不能再用 MIME 过滤掉 .save。
 *
 * 故障注入:删掉 registerPlugin、把 ACTION_CREATE_DOCUMENT 改回 Documents、
 * 或把 accept 改回 application/json,.save,对应用例必红。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(__dirname, path), 'utf8')

describe('Android 存档传输 · 接线', () => {
  const main = read('../../android/app/src/main/java/com/games/wenzi/yunyin/MainActivity.java')
  const plugin = read('../../android/app/src/main/java/com/games/wenzi/yunyin/SaveTransferPlugin.java')
  const manifest = read('../../android/app/src/main/AndroidManifest.xml')

  it('MainActivity 在 Bridge 创建前注册 SaveTransfer 插件', () => {
    const registerAt = main.indexOf('registerPlugin(SaveTransferPlugin.class)')
    const superAt = main.indexOf('super.onCreate(savedInstanceState)')
    expect(registerAt, '没有注册原生 SAF 插件').toBeGreaterThan(-1)
    expect(superAt, '找不到 super.onCreate').toBeGreaterThan(-1)
    expect(registerAt, '注册晚于 Bridge 创建时插件不会进 PluginHeaders').toBeLessThan(superAt)
  })

  it('原生导出走 SAF,并用 ContentResolver 写入', () => {
    expect(plugin).toContain('Intent.ACTION_CREATE_DOCUMENT')
    expect(plugin).toContain('Intent.EXTRA_TITLE')
    expect(plugin).toContain('getContentResolver().openOutputStream(uri, "wt")')
    expect(plugin).toContain('saved", true')
    expect(plugin).toContain('saved", false')
    expect(plugin, '大存档写入必须离开主线程').toContain('execute(() -> writeSave(call, uri, text))')
    expect(plugin, '原生回包必须投回主线程').toContain('executeOnMainThread')
    expect(plugin, 'Android 存档导出不得回退到公共 Documents').not.toContain('Directory.Documents')
  })

  it('不再声明公共存储写权限', () => {
    expect(manifest).not.toContain('WRITE_EXTERNAL_STORAGE')
    expect(manifest).not.toContain('requestLegacyExternalStorage')
  })

  it('两个导入入口都放行 .save,由存档内容校验兜底', () => {
    for (const path of [
      '../../src/components/settings/SettingsSaveSection.vue',
      '../../src/views/WelcomeView.vue'
    ]) {
      const view = read(path)
      expect(view, `${path} 会过滤掉 .save`).toContain('accept="application/octet-stream,.save"')
      expect(view, `${path} 不得恢复旧 MIME 过滤`).not.toContain('accept="application/json,.save"')
    }
  })
})
