/**
 * 导出存档的重入保护。
 *
 * 导出的结果由平台异步给出(安卓拉起 SAF 保存面板、Web 先写剪贴板)，而按钮在结果回来前
 * 一直可点。实测修复前连点三次会下载三个同名 .save(浏览器自己加 (1)/(2) 后缀)，
 * 玩家拿到三份重复备份；安卓那一路每次点击都拉起一次系统保存面板。
 *
 * 导入那一路早有 `saveRead?.abort()` 防重入，导出这侧此前一条都没有 —— 这份 spec 把
 * 「两侧都要防」这件事钉住，同时钉住按钮在导出期间转成状态词。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, './SettingsSaveSection.vue'), 'utf-8')

describe('导出存档 · 重入保护', () => {
  it('onExport 开头就挡住第二次进入', () => {
    const fn = /function onExport\(\): void \{([\s\S]*?)\n  \}/.exec(SRC)?.[1]
    expect(fn, '找不到 onExport —— 判据要跟着改').toBeTruthy()
    // 第一句判空 + 置位,须在调用 exportSaveToDevice 之前
    expect(fn!, 'onExport 缺重入判空').toContain('if (exporting.value) return')
    const guardAt = fn!.indexOf('if (exporting.value) return')
    const callAt = fn!.indexOf('exportSaveToDevice()')
    expect(guardAt, '导出入口没找到 exportSaveToDevice()').toBeGreaterThanOrEqual(0)
    expect(guardAt, '置位应在真正导出之前').toBeLessThan(callAt)
  })

  it('结束时无论成败都要复位,否则按钮会永久禁用', () => {
    expect(SRC, '没有 finally 复位:导出失败后按钮再也点不动').toMatch(/\.finally\(\(\) => \{\s*exporting\.value = false/)
  })

  it('导出中按钮转成状态词并禁用', () => {
    expect(SRC, '按钮缺禁用态').toMatch(/:disabled="exporting"/)
    expect(SRC, '按钮没写出「正在导出」').toContain("exporting ? '正在导出' : '导出存档'")
  })
})
