import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { gn, mulN, sub, toNum } from '@/utils/gnum'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { QI_BANK_MULT, QI_RICH_RATIO } from '@/data/constants'
import { expEtaSec, qiBankEtaSec, qiEtaSec, qiRichEtaSec } from './progress'

/**
 * 「还得多久」的估算 —— 修为圆满与灵气回满同收在此册。
 * 判据是「缺口 ÷ 现速」这道同源除法:与修炼页两条进度条读同一份数,
 * 界面上那句「按现速,修为圆满约……」/「灵气回满约……」就在报这个值。
 */
describe('expEtaSec 修为圆满估算(与面板同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未圆满:值 = 缺口 ÷ 现速,不另造口径', () => {
    const player = usePlayerStore()
    const rate = player.cultPerSec // 本就是普通数,不套 toNum
    const gap = toNum(sub(player.expReq, player.exp))
    expect(expEtaSec()).toBeCloseTo(gap / rate, 4)
  })

  it('半程比全程少一半:估算随缺口线性走', () => {
    const player = usePlayerStore()
    const full = expEtaSec()
    player.exp = mulN(player.expReq, 0.5)
    const half = expEtaSec()
    expect(half).toBeCloseTo(full / 2, 4)
  })

  it('修为已圆满 → 0(不再报「还需几时」)', () => {
    const player = usePlayerStore()
    player.exp = mulN(player.expReq, 1.5)
    expect(expEtaSec()).toBe(0)
  })

  it('零缺口边界:exp 恰好压在需求上 → 0', () => {
    const player = usePlayerStore()
    player.exp = player.expReq
    expect(expEtaSec()).toBe(0)
  })

  it('速率是除数而不是被除数:加速只会缩短,不会拉长', () => {
    const player = usePlayerStore()
    player.exp = gn(0)
    const before = expEtaSec()
    // 等价地:现速翻倍后,同一缺口的时间应折半 —— 若有人把式子写成 gap×rate 就废了
    const rate = player.cultPerSec
    const atDouble = toNum(player.expReq) / (rate * 2)
    expect(before).toBeGreaterThan(0)
    expect(atDouble).toBeCloseTo(before / 2, 4)
  })
})

/**
 * 灵气回满的估算 —— 与 expEtaSec 同一道「缺口 ÷ 现速」除法,
 * 灵气条读 qiCapValue / qi / qiRegenPerSec 三份数,这里也读这三份。
 */
describe('qiEtaSec 灵气回满估算(与灵气条同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未满:值 = 缺口 ÷ 恢复速度', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const rate = player.qiRegenPerSec
    const gap = player.qiCapValue - resources.qi
    expect(qiEtaSec()).toBeCloseTo(gap / rate, 4)
  })

  it('积余一半 → 时间折半(随缺口线性走)', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const full = qiEtaSec()
    resources.setQi(player.qiCapValue / 2, player.qiCapValue)
    expect(qiEtaSec()).toBeCloseTo(full / 2, 4)
  })

  it('灵气已满 → 0(无物可等)', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    resources.setQi(player.qiCapValue, player.qiCapValue)
    expect(qiEtaSec()).toBe(0)
  })
})

/**
 * 灵气积余段(越过标称容量)的蓄满估算 —— 上限与 resources.setQi 同一道
 * (标称容量 × QI_BANK_MULT),值 = 缺口 ÷ 现速;非积余段不报。
 */
describe('qiBankEtaSec 灵气积余蓄满估算', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('积余段:值 = (积余上限 − 当前) ÷ 恢复速度', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const cap = player.qiCapValue
    const rate = player.qiRegenPerSec
    // 越过标称容量 1.5 倍,落进积余段(≤ 10 倍上限)
    resources.setQi(cap * 1.5, cap)
    const gap = cap * QI_BANK_MULT - cap * 1.5
    expect(qiBankEtaSec()).toBeCloseTo(gap / rate, 4)
  })

  it('未积余(qi ≤ 标称容量)→ 0:不到那个阶段不报「蓄满」', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    resources.setQi(player.qiCapValue, player.qiCapValue)
    expect(qiBankEtaSec()).toBe(0)
  })

  it('积余已蓄满(撞上积余上限)→ 0', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    resources.setQi(player.qiCapValue * QI_BANK_MULT, player.qiCapValue)
    expect(qiBankEtaSec()).toBe(0)
  })
})

/**
 * 距「灵气充盈」的估算 —— 界线与 player store 的 qiRich 同一道
 * (qi ≥ 容量 × QI_RICH_RATIO),值 = 缺口 ÷ 现速。
 */
describe('qiRichEtaSec 灵气充盈估算(修为跳档时刻)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('在半线以下:值 = (容量×比例 − 当前) ÷ 恢复速度', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const rate = player.qiRegenPerSec
    const gap = player.qiCapValue * QI_RICH_RATIO - resources.qi
    expect(qiRichEtaSec()).toBeCloseTo(gap / rate, 4)
  })

  it('已在充盈线上(过半)→ 0:修为已享那档加成,不报已过的时刻', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    res.setQi(player.qiCapValue * Math.min(0.9, QI_RICH_RATIO + 0.2), player.qiCapValue)
    expect(qiRichEtaSec()).toBe(0)
  })

  it('界线含等号(与 qiRich 判据一致):骑线 → 0,差一线 → >0', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    res.setQi(player.qiCapValue * QI_RICH_RATIO, player.qiCapValue)
    expect(qiRichEtaSec()).toBe(0)
    res.setQi(player.qiCapValue * QI_RICH_RATIO - 1, player.qiCapValue)
    expect(qiRichEtaSec()).toBeGreaterThan(0)
  })
})
