/**
 * 安卓返回键的处置顺序。
 *
 * 这段逻辑此前只写在 ExitConfirmDialog 的 onBackButton 里,没有任何判据 ——
 * 而它是 APK 里退出游戏的**唯一路径**(注册 backButton 监听后 Capacitor 不再自己 goBack)。
 * 顺序错了两种后果都要命:要么一次返回就退游戏(丢掉「再想想」那层确认),
 * 要么退不出去(玩家以为卡死)。
 *
 * 判据钉三件事:弹窗栈优先、不在根页先回根页、在根页才问退出;
 * 以及组件确实走这个纯函数(不是又抄了一份在组件里)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decideBackAction } from './backButton'

const DIALOG = readFileSync(resolve(__dirname, '../components/common/ExitConfirmDialog.vue'), 'utf-8')

describe('安卓返回键 · 三支的先后', () => {
  it('弹窗开着时只关弹窗,不回页也不问退出', () => {
    expect(decideBackAction(true, false)).toBe('close-overlay')
    // 在根页也一样:先关弹窗
    expect(decideBackAction(true, true)).toBe('close-overlay')
  })

  it('不在根页时先回根页,不问退出', () => {
    expect(decideBackAction(false, false)).toBe('go-root')
  })

  it('在根页且没有弹窗时,才问退出', () => {
    expect(decideBackAction(false, true)).toBe('confirm-exit')
  })

  it('弹窗优先于「回根页」—— 顺序反了会吞掉一次关窗', () => {
    // 若把两支写反(先看 onRoot 再看 overlay),这里会得到 go-root / confirm-exit
    expect(decideBackAction(true, false), '弹窗分支必须排在回根页之前').not.toBe('go-root')
    expect(decideBackAction(true, true), '弹窗分支必须排在退出确认之前').not.toBe('confirm-exit')
  })
})

describe('组件确实走这个纯函数', () => {
  it('onBackButton 读 decideBackAction 的结果', () => {
    expect(DIALOG, '组件又自己写了一遍分支').toContain('decideBackAction(handleEscape(),')
    expect(DIALOG, '没接上 go-root 分支').toContain("action === 'go-root'")
    expect(DIALOG, '没接上 close-overlay 分支').toContain("action === 'close-overlay'")
  })

  it('保留了「退出前先刷盘」—— 这是既有判据,抽取时不许弄丢', () => {
    expect(DIALOG, 'flushSaveWrites 不见了').toContain('flushSaveWrites()')
    expect(DIALOG, 'exitApp 不见了').toContain('CapacitorApp.exitApp()')
  })

  it('返回键监听仍只在原生壳里注册', () => {
    expect(DIALOG, '非原生平台不该注册 backButton').toContain('if (!Capacitor.isNativePlatform()) return')
  })
})
