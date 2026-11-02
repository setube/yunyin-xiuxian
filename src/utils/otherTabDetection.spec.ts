/**
 * 「另一页在写档」的判定范围。
 *
 * storage 事件在别的标签页写入时触发,本页自己的写入不回调 —— 正好用来判重。
 * 但判定一开始写的是 `key.startsWith('yunyin.')`,把 `yunyin.__theme`(首帧主题小键)
 * 也算成了「在写档」。
 *
 * 实测后果:A 页开着,另一页切一次主题 → A 页置上 otherTab;
 * 而 otherTab 只在心跳超时时复位(复位路径只有 watchOtherTabSave(false) 一处),
 * 于是它一直挂着,下次真开两页时那条提示已经被去重掉了。
 *
 * 判据落在源码上:判定必须用分片键集合,不能用前缀。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, './storage.ts'), 'utf-8')

describe('另一页在写档 · 判定范围', () => {
  it('只认存档分片,不用 yunyin. 前缀一刀切', () => {
    expect(SRC, '判定用了前缀,会把 __theme / __live 之外的辅助键也算进来').not.toMatch(
      /e\.key\.startsWith\(SAVE_PREFIX\)\s*&&/
    )
    expect(SRC, '缺分片键集合').toContain('const SAVE_SLICE_KEYS = new Set(PERSISTED_STORES.map(id => SAVE_PREFIX + id))')
    expect(SRC, '判重没有走分片键集合').toContain('if (SAVE_SLICE_KEYS.has(e.key)) setOtherTab(true)')
  })

  it('心跳键仍单独处理(按时间戳判新鲜度)', () => {
    expect(SRC).toContain('if (e.key === LIVE_KEY)')
    expect(SRC).toContain('Date.now() - at < LIVE_STALE_MS')
    // 心跳必须在分片判定之前 return,否则会落到分片分支
    const liveIdx = SRC.indexOf('if (e.key === LIVE_KEY)')
    const sliceIdx = SRC.indexOf('if (SAVE_SLICE_KEYS.has(e.key))')
    expect(liveIdx, '心跳判定应排在分片判定之前').toBeLessThan(sliceIdx)
  })

  it('首帧主题键不在分片清单里(否则判定又把它算进来)', () => {
    // PERSISTED_STORES 是导出的常量,这里用源码断言避免把整个 store 链拉进单测
    const list = /export const PERSISTED_STORES = \[([\s\S]*?)\] as const/.exec(SRC)
    expect(list, 'PERSISTED_STORES 变了形状,判据要跟着改').toBeTruthy()
    expect(list![1]!, '首帧主题键不该进分片清单 —— 它不是进度').not.toContain('__theme')
    expect(list![1]!, '心跳键不该进分片清单').not.toContain('__live')
  })
})
