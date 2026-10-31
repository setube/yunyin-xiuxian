/**
 * 器魂与流派共用同一套 id 与印章单字:
 *   data/souls.ts 的 SOUL_TYPES[i].seal 注释写着「与 BUILD_STYLES 同源」
 *   core/buildDetect.ts 的 BUILD_STYLES[j].seal 是流派印章
 *
 * 两边分叉的后果:同一个「背水流」在器魂面板印「背」、在流派面板印别的字,
 * 玩家会以为是两套体系。运行时导入比对,不做源码字符串解析(格式一变就失效)。
 */
import { describe, expect, it } from 'vitest'
import { SOUL_TYPES } from '@/data/souls'
import { BUILD_STYLES } from '@/core/buildDetect'

describe('器魂与流派的 id/印章', () => {
  it('两边的 id 集合完全相同', () => {
    const souls = new Set(SOUL_TYPES.map(s => s.id))
    const styles = new Set(BUILD_STYLES.map(s => s.id))
    expect([...souls].sort(), '一方的 id 增删必须同步到另一方').toEqual([...styles].sort())
  })

  it('同 id 的印章单字相同', () => {
    const byId = new Map(BUILD_STYLES.map(s => [s.id, s.seal]))
    for (const soul of SOUL_TYPES) {
      expect(byId.get(soul.id), `「${soul.id}」在流派表里不存在`).toBeDefined()
      expect(soul.seal, `「${soul.id}」两边印章不一致`).toBe(byId.get(soul.id))
    }
  })

  it('印章是单个汉字(印章位放不下两个字)', () => {
    for (const s of [...SOUL_TYPES, ...BUILD_STYLES]) {
      expect(s.seal.length, `「${s.id}」的印章「${s.seal}」不是单字`).toBe(1)
    }
  })

  it('印章互不重复(否则两个流派看起来是同一个)', () => {
    const seals = BUILD_STYLES.map(s => s.seal)
    expect(new Set(seals).size, '印章单字必须两两不同').toBe(seals.length)
  })

  it('名称互不重复', () => {
    for (const list of [SOUL_TYPES, BUILD_STYLES] as { name: string }[][]) {
      const names = list.map(x => x.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})
