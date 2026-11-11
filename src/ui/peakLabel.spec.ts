/**
 * 「已圆满」只有一份出处。
 *
 * 同一种状态原先在四处各写一遍:
 *   建筑满级 (ui/buildingText.buildingPeakToast)
 *   功法满级 (ui/gongfaText.gongfaPeakLabel)
 *   功法行标签 (ui/gongfaMark 的 peakLabel 字段)
 *   建筑卡正文 (components/dongfu/BuildingCard 的内联三元)
 *
 * AGENTS.md「一个状态只说一个事实」:同一个事实在任何界面上该是同一个词。
 * 抄四份时改一处就漏三处 —— 上一轮「祭炼已至上限」在 toast / 标记 / 禁用钮
 * 三处各写一遍,就是同一种毛病被抓住的第一例。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PEAK_LABEL, peakLabel } from './peakLabel'
import { buildingPeakToast } from './buildingText'
import { gongfaPeakLabel } from './gongfaText'
import { gongfaMark } from './gongfaMark'
import { GONGFA } from '@/data/gongfa'

const ROOT = resolve(__dirname, '../..')
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf-8')

describe('圆满状态词 · 一份出处', () => {
  it('四个调用点说的是同一句', () => {
    expect(peakLabel()).toBe(PEAK_LABEL)
    expect(buildingPeakToast(), '建筑满级与共享词不一致').toBe(PEAK_LABEL)
    expect(gongfaPeakLabel(), '功法满级与共享词不一致').toBe(PEAK_LABEL)
    // 功法行标签:取一门真功法、把它练到上限
    const def = GONGFA[0]
    expect(def, 'GONGFA 为空,判据空转').toBeDefined()
    const maxed = gongfaMark(def, 99)
    expect(maxed.maxed, '练到 99 层还不算满 —— 判据前提不成立').toBe(true)
    expect(maxed.peakLabel, '功法行标签与共享词不一致').toBe(PEAK_LABEL)
    // 未满不许挂标签
    expect(gongfaMark(def, 0).peakLabel).toBeNull()
  })

  it('字面量只在 ui/peakLabel 写一次', () => {
    for (const p of ['src/ui/buildingText.ts', 'src/ui/gongfaText.ts', 'src/ui/gongfaMark.ts', 'src/components/dongfu/BuildingCard.vue']) {
      expect(read(p), `${p} 又手写了一遍「${PEAK_LABEL}」`).not.toContain(`'${PEAK_LABEL}'`)
    }
    expect(read('src/ui/peakLabel.ts'), '共享模块该定义它').toContain(`'${PEAK_LABEL}'`)
  })

  /**
   * 阴性对照:全仓不该再有第五处漏网。
   * 扫运行时源码(去掉注释),「已圆满」只许出现在共享模块里。
   */
  it('全仓运行时源码里只有一处', () => {
    const files = ['src/ui/buildingText.ts', 'src/ui/gongfaText.ts', 'src/ui/gongfaMark.ts', 'src/components/dongfu/BuildingCard.vue']
    const hits = files.filter(p => stripComments(read(p)).includes(PEAK_LABEL))
    expect(hits, '这些文件还直接写着「已圆满」').toEqual([])
  })
})

/** 剥掉注释:注释里提到这个词不算玩家可见文案 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}
