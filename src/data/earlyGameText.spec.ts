/**
 * 顿悟选项的文案与实际发放必须一致。
 *
 * ENLIGHTENMENT_OPTIONS 里 desc 是硬编码中文字符串(「修炼速度 +20%」),
 * 真实效果在 buffs.ts 的 enlighten_* 定义里。data/earlyGame.ts 的注释写着
 * 「文案须与实发一致」,但字符厂串与数值之间没有任何机制约束 ——
 * 调 buff 数值忘了改文案,玩家读到的就是假的。
 *
 * 这里把 desc 里的百分比抽出来,与 buff 的真实词条值逐项比对。
 */
import { describe, expect, it } from 'vitest'
import { BREAKTHROUGH_PREP_OPTIONS, ENLIGHTENMENT_OPTIONS } from '@/data/earlyGame'
import { buffDef } from '@/data/buffs'

/** 把小数转成文案里的百分数整数(0.2 → 20) */
const pct = (v: number): number => Math.round(Math.abs(v) * 100)

/** 从 desc 里抽「+20」「-12」这类百分数(带符号语义由 |x| 丢掉,只比数值) */
function percentsIn(desc: string): number[] {
  return [...desc.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(m => Math.abs(Number(m[1])))
}

describe('顿悟选项 · 文案与实发一致', () => {
  it('带 buff 的选项:desc 里的百分数与 buff 词条值逐项吻合', () => {
    let checked = 0
    for (const opt of ENLIGHTENMENT_OPTIONS) {
      if (!opt.buffId) continue
      const buff = buffDef(opt.buffId)
      expect(buff, `「${opt.label}」引了不存在的 buff ${opt.buffId}`).toBeDefined()
      if (!buff) continue
      const claimed = percentsIn(opt.desc)
      const actual = Object.values(buff.mods).map(v => pct(v as number))
      expect(claimed.length, `「${opt.label}」的文案里没有百分数,但挂了词条 buff`).toBeGreaterThan(0)
      // 文案顺序与词条顺序不必一致,按多重集比对
      expect([...claimed].sort((a, b) => a - b), `「${opt.label}」文案 ${JSON.stringify(opt.desc)} 与实发不符`).toEqual(
        [...actual].sort((a, b) => a - b)
      )
      checked += 1
    }
    expect(checked, '一条都没验到说明用例空转').toBeGreaterThan(0)
  })

  it('带 buff 的选项:duration 与 buff 自带的 durationSec 一致', () => {
    for (const opt of ENLIGHTENMENT_OPTIONS) {
      if (!opt.buffId) continue
      const buff = buffDef(opt.buffId)
      expect(opt.duration, `「${opt.label}」的时长与 buff 不符`).toBe(buff?.durationSec)
    }
  })

  it('走即时奖励的选项:desc 里的点数与 reward.value 一致', () => {
    let checked = 0
    for (const opt of ENLIGHTENMENT_OPTIONS) {
      if (!opt.reward) continue
      // 「立即获得 5 悟道点」
      const m = /(\d+)\s*悟道点/.exec(opt.desc)
      expect(m, `「${opt.label}」的文案里没写点数`).not.toBeNull()
      expect(Number(m![1]), `「${opt.label}」文案点数与实发不符`).toBe(opt.reward.value)
      expect(opt.buffId, '即时奖励不该同时挂 buff').toBeUndefined()
      expect(opt.duration, '即时奖励不该有持续时间').toBe(0)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('每个选项要么挂 buff 要么走即时奖励,不能两不沾', () => {
    for (const opt of ENLIGHTENMENT_OPTIONS) {
      expect(Boolean(opt.buffId) || Boolean(opt.reward), `「${opt.label}」既无 buff 也无 reward`).toBe(true)
    }
  })

  it('label 与所挂 buff 的名字相同(玩家从两处看到的应是同一个名字)', () => {
    for (const opt of ENLIGHTENMENT_OPTIONS) {
      if (!opt.buffId) continue
      expect(buffDef(opt.buffId)?.name, `「${opt.label}」与 buff 名不符`).toBe(opt.label)
    }
  })

describe('突破准备 · 文案与实发一致', () => {
  /** 从 desc 抽分钟数 → 秒 */
  const minutesIn = (desc: string): number | null => {
    const m = /(\d+)\s*分钟/.exec(desc)
    return m ? Number(m[1]) * 60 : null
  }

  it('desc 里的「耗时 N 分钟」等于 duration 秒数', () => {
    let checked = 0
    for (const opt of BREAKTHROUGH_PREP_OPTIONS) {
      const claimed = minutesIn(opt.desc)
      if (claimed === null) continue
      expect(opt.duration, `「${opt.label}」文案写 ${claimed / 60} 分钟,实际 ${opt.duration} 秒`).toBe(claimed)
      checked += 1
    }
    expect(checked, '没有任何选项写了耗时,说明用例空转').toBeGreaterThan(0)
  })

  it('desc 里的百分比等于 bonusRate', () => {
    let checked = 0
    for (const opt of BREAKTHROUGH_PREP_OPTIONS) {
      const claimed = percentsIn(opt.desc)
      if (claimed.length === 0) continue
      expect(claimed, `「${opt.label}」的文案里不止一个百分数,取不出对应关系`).toHaveLength(1)
      expect(claimed[0], `「${opt.label}」文案 ${JSON.stringify(opt.desc)} 与 bonusRate 不符`).toBe(pct(opt.bonusRate))
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('desc 里的「N 灵石」等于 cost.stone', () => {
    let checked = 0
    for (const opt of BREAKTHROUGH_PREP_OPTIONS) {
      const m = /(\d+)\s*灵石/.exec(opt.desc)
      if (!m) continue
      expect(opt.cost?.stone, `「${opt.label}」文案写 ${m[1]} 灵石,实际没有灵石消耗`).toBe(Number(m[1]))
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('文案说「无额外准备」的,确实不带任何加成、耗时与花销', () => {
    for (const opt of BREAKTHROUGH_PREP_OPTIONS) {
      if (!opt.desc.includes('无额外准备')) continue
      expect(opt.bonusRate, `「${opt.label}」说无额外准备,却带加成`).toBe(0)
      expect(opt.duration).toBe(0)
      expect(opt.cost).toBeUndefined()
    }
  })

  it('id 与 label 都不重复(选择面板靠它们区分)', () => {
    const ids = BREAKTHROUGH_PREP_OPTIONS.map(o => o.id)
    const labels = BREAKTHROUGH_PREP_OPTIONS.map(o => o.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
})
