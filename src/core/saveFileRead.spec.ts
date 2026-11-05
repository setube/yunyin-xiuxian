/**
 * 存档文件读取:abort 后 load / error 回调都不再执行。
 * 迟到回调会 engine.pause() 并写已销毁组件的 ref,resume 不到则游戏永久暂停。
 * 故障注入:把 abort 改回只调 reader.abort() 而不置 settled,「卸载时 abort」用例红。
 */
import { describe, expect, it } from 'vitest'
import { MAX_SAVE_FILE_BYTES, readSaveFile } from './saveFileRead'

class FakeFileReader {
  result: string | ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  aborted = false

  readAsText(): void {}

  abort(): void {
    this.aborted = true
  }

  finish(text: string): void {
    this.result = text
    this.onload?.()
  }

  fail(): void {
    this.onerror?.()
  }
}

describe('存档文件读取 · 取消即失效', () => {
  it('读取完成回调拿到文件文本', () => {
    const reader = new FakeFileReader()
    const loaded: string[] = []
    readSaveFile({ name: 'save.json' } as File, text => loaded.push(text), () => undefined, { createReader: () => reader as unknown as FileReader })
    reader.finish('{"game":"yunyin-xiuxian"}')
    expect(loaded).toEqual(['{"game":"yunyin-xiuxian"}'])
  })

  it('卸载时 abort:迟到的 load 与 error 都不再回调', () => {
    const reader = new FakeFileReader()
    let loads = 0
    let errors = 0
    const handle = readSaveFile(
      { name: 'save.json' } as File,
      () => {
        loads += 1
      },
      () => {
        errors += 1
      },
      { createReader: () => reader as unknown as FileReader }
    )
    handle.abort()
    expect(reader.aborted, '取消应真的中止底层读取').toBe(true)
    reader.finish('迟到内容')
    reader.fail()
    expect(loads, '取消后不该再暂停引擎/写已销毁组件').toBe(0)
    expect(errors, '取消后不该再弹读取失败回执').toBe(0)
  })

  /**
   * 文件选择器上玩家可能点到一个几百 MB 的视频:readAsText 会把它整个读进 WebView 内存,
   * 安卓低端机上直接卡死或被系统杀掉。故超过上限就不读,当场回执。
   * 故障注入:去掉开头的 size 判定,「超大文件不读」那条红。
   */
  it('超大文件不读进内存,当场报「文件过大」', () => {
    const reader = new FakeFileReader()
    let loads = 0
    let tooLarge = 0
    readSaveFile(
      { name: 'video.mp4', size: MAX_SAVE_FILE_BYTES + 1 } as File,
      () => {
        loads += 1
      },
      () => undefined,
      {
        createReader: () => reader as unknown as FileReader,
        onTooLarge: () => {
          tooLarge += 1
        }
      }
    )
    expect(tooLarge, '超大文件应当场回执').toBe(1)
    expect(loads, '超大文件不该被读进内存').toBe(0)
    expect(reader.aborted, '连读都不该开始').toBe(false)
    // 边界:刚好等于上限仍照常读
    expect(reader.result).toBeNull()
  })

  it('取不到 size 时按未知放行,不误拒正常存档', () => {
    const reader = new FakeFileReader()
    const loaded: string[] = []
    readSaveFile({ name: 'save.json' } as File, text => loaded.push(text), () => undefined, { createReader: () => reader as unknown as FileReader })
    reader.finish('{"game":"yunyin-xiuxian"}')
    expect(loaded, 'size 未知不该被当成超大').toEqual(['{"game":"yunyin-xiuxian"}'])
  })

  it('先完成再 abort 是幂等的:不会重复回调,也不抛', () => {
    const reader = new FakeFileReader()
    let loads = 0
    const handle = readSaveFile(
      { name: 'save.json' } as File,
      () => {
        loads += 1
      },
      () => undefined,
      { createReader: () => reader as unknown as FileReader }
    )
    reader.finish('ok')
    expect(() => handle.abort()).not.toThrow()
    reader.finish('again')
    expect(loads).toBe(1)
  })
})
