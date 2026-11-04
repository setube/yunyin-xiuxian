/**
 * 宿慧换来的能力清单。
 *
 * 转世弹窗原只写「宿慧 +40 / 共计 400 / 第四境地 / 尚差 120」——数都摆着,
 * 却从不说什么能力是这些宿慧换来的。core 的 INSIGHT_CONSUMERS 早有完整的那张表,
 * 至今只有 spec 在读。
 *
 * 判据:
 *   一 按 fromStage 分「已得 / 将至」,门槛取 core 的表不另算。
 *   二 排序:按生效阶序,同阶内生在前(内生是一次性的,更值得先看见)。
 *   三 坏阶序按零处理,不产出 NaN。
 *   四 界面接上了,且读的是同一份表。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INSIGHT_CONSUMERS } from '@/core/impactSurface'
import { POWER_KIND_LABEL, nextPower, powerTally, samaraPowers, upcomingPowers } from './samsaraPowers'

const ROOT = resolve(__dirname, '../..')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/character/ReincarnationDialog.vue'), 'utf-8')

describe('宿慧能力 · 一、按阶序分已得与将至', () => {
  it('阶序足够时全算已得', () => {
    const top = Math.max(...INSIGHT_CONSUMERS.map(c => c.fromStage))
    const { owned, pending } = samaraPowers(top)
    expect(pending).toEqual([])
    expect(owned.length).toBe(INSIGHT_CONSUMERS.length)
  })

  it('零阶时只算从零阶起的那几项', () => {
    const { owned, pending } = samaraPowers(0)
    const fromZero = INSIGHT_CONSUMERS.filter(c => c.fromStage === 0)
    expect(owned.length).toBe(fromZero.length)
    expect(owned.length + pending.length).toBe(INSIGHT_CONSUMERS.length)
  })

  it('门槛取 core 的 fromStage,本层不另算', () => {
    for (const stage of [0, 1, 2, 3, 4]) {
      const { owned } = samaraPowers(stage)
      const expectOwned = INSIGHT_CONSUMERS.filter(c => stage >= c.fromStage).length
      expect(owned.length, `阶序 ${stage} 的已得数对不上`).toBe(expectOwned)
    }
  })

  it('powerTally 报「已得几项 / 共几项」', () => {
    for (const stage of [0, 2, 4]) {
      const t = powerTally(stage)
      const { owned, pending } = samaraPowers(stage)
      expect(t.owned).toBe(owned.length)
      expect(t.total).toBe(owned.length + pending.length)
      expect(t.owned).toBeLessThanOrEqual(t.total)
    }
  })

  it('两项一档都算进总数', () => {
    const { owned, pending } = samaraPowers(2)
    expect(owned.length + pending.length).toBe(INSIGHT_CONSUMERS.length)
  })
})

describe('宿慧能力 · 二、排序', () => {
  it('按生效阶序升序', () => {
    const { owned, pending } = samaraPowers(4)
    for (const list of [owned, pending]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.fromStage, '阶序没排好').toBeGreaterThanOrEqual(list[i - 1]!.fromStage)
      }
    }
  })

  it('同阶内生在前 —— 一次性能力更值得先看见', () => {
    const { owned } = samaraPowers(9)
    for (let i = 1; i < owned.length; i++) {
      const prev = owned[i - 1]!
      const cur = owned[i]!
      if (prev.fromStage === cur.fromStage) {
        expect(prev.kind === 'opening' || cur.kind === 'standing', '同阶内生没排在前面').toBe(true)
      }
    }
  })

  it('最快将至的那项就是下一项', () => {
    const next = nextPower(0)
    const { pending } = samaraPowers(0)
    expect(next!.fromStage).toBe(Math.min(...pending.map(p => p.fromStage)))
  })

  it('全得之后没有下一项', () => {
    const top = Math.max(...INSIGHT_CONSUMERS.map(c => c.fromStage))
    expect(nextPower(top)).toBeNull()
  })
})

describe('宿慧能力 · 二之二、将至的前几项', () => {
  it('至多给 N 项,且都是将至的', () => {
    for (const n of [0, 1, 2, 3]) {
      const out = upcomingPowers(0, n)
      expect(out.length).toBeLessThanOrEqual(n)
      const { pending } = samaraPowers(0)
      for (const p of out) expect(pending.some(x => x.id === p.id)).toBe(true)
    }
  })

  it('按阶序取最近的几项', () => {
    const out = upcomingPowers(0, 2)
    const { pending } = samaraPowers(0)
    expect(out.map(p => p.id)).toEqual(pending.slice(0, 2).map(p => p.id))
  })

  it('坏 N 不产出负长度或抛错', () => {
    for (const n of [Number.NaN, -3, Number.POSITIVE_INFINITY]) {
      expect(() => upcomingPowers(0, n)).not.toThrow()
      expect(Array.isArray(upcomingPowers(0, n))).toBe(true)
    }
  })
})

describe('宿慧能力 · 三、坏值不崩', () => {
  it('NaN / 负数按零处理', () => {
    for (const v of [Number.NaN, -5, Number.NEGATIVE_INFINITY]) {
      const { owned, pending } = samaraPowers(v)
      expect(Number.isFinite(owned.length)).toBe(true)
      expect(owned.length + pending.length).toBe(INSIGHT_CONSUMERS.length)
    }
  })

  it('小数阶序向下取整', () => {
    expect(samaraPowers(1.9).owned.length).toBe(samaraPowers(1).owned.length)
  })
})

describe('宿慧能力 · 四、界面接上了', () => {
  it('转世弹窗列出已得与将至', () => {
    expect(DIALOG).toContain('samaraPowers')
    expect(DIALOG, '该分类标签').toContain('POWER_KIND_LABEL')
    expect(DIALOG, '该报总数').toMatch(/powerTally|已得/)
  })

  it('读的是 core 那张表,不另写一份能力清单', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/samsaraPowers.ts'), 'utf-8')
    expect(src, '该从 impactSurface 取表').toContain("from '@/core/impactSurface'")
    // 能力名不许在本层手抄
    for (const c of INSIGHT_CONSUMERS) {
      expect(src, `手抄了能力名「${c.name}」`).not.toContain(c.name)
    }
  })

  it('能力表本身非空,判据没在空表上空转', () => {
    expect(INSIGHT_CONSUMERS.length).toBeGreaterThan(3)
    expect(POWER_KIND_LABEL.opening).toBeTruthy()
    expect(POWER_KIND_LABEL.standing).toBeTruthy()
  })
})
