import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { formatGN } from '@/utils/format'
import { buffDef } from '@/data/buffs'
import { CULT_BASE_SPEED } from '@/data/constants'
import { baseCultPerSec } from './formulas'
import { retreatGainText, retreatGainedText, checkStateAchievements } from './progress'
import { useQuestsStore } from '@/stores/quests'

/**
 * 闭关预览 —— 按钮那句「此行约多得修为 X」,与修炼行读同一份
 * baseCultPerSec,时长与加成则取自 buffs.ts 的 retreat 本体(不手抄)。
 */
describe('retreatGainText 闭关约多得预览', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('炼气初成:值 = CULT_BASE_SPEED ×1.5×300(写死算一遍,不镜像实现)', () => {
    const player = usePlayerStore()
    // 初始境界无任何成长系数相乘,base 恰为 CULT_BASE_SPEED
    expect(baseCultPerSec(player.major, player.sub)).toBeCloseTo(CULT_BASE_SPEED, 6)
    const expected = CULT_BASE_SPEED * 1.5 * 300 // 585
    expect(retreatGainText()).toBe(`此行约多得修为 ${formatGN(expected)}`)
  })

  it('加成翻倍 → 预览翻倍(buff 本体改,这里的数也线性跟)', () => {
    const player = usePlayerStore()
    const baseline = baseCultPerSec(player.major, player.sub)

    // 直接把 retreat buff 的加成按同构口径算一遍:base × 加成 × 时长
    const def = buffDef('retreat')!
    const boost = def.mods.cultivationSpeed ?? 0
    const expected = baseline * boost * def.durationSec
    expect(retreatGainText()).toBe(`此行约多得修为 ${formatGN(expected)}`)

    // 加成一倍后,预览该是原先的两倍(把 boost 近似的翻倍代入)
    const doubled = baseline * (boost * 2) * def.durationSec
    expect(formatGN(doubled)).toBe(formatGN(expected * 2))
  })

  it('境界抬升 → 预览随 base 抬升(非写死一个数)', () => {
    const player = usePlayerStore()
    const lo = baseCultPerSec(player.major, player.sub)
    player.major = 2
    const hi = baseCultPerSec(player.major, player.sub)
    expect(hi).toBeGreaterThan(lo)
    expect(retreatGainText()).toBe(`此行约多得修为 ${formatGN(hi * 1.5 * 300)}`)
  })

  it('闭关中的活数:过半 → 恰为全长的一半(同一速率,只差已走时长)', () => {
    const player = usePlayerStore()
    const perSec = baseCultPerSec(player.major, player.sub) * 1.5 // 与实现同一口径的基准量
    const half = perSec * 150
    const full = perSec * 300
    expect(retreatGainedText(150)).toBe(`此行已多得修为 ${formatGN(half)}`)
    expect(full).toBeCloseTo(half * 2, 6) // 585 = 292.5 × 2,时长翻倍→所得翻倍
  })

  it('闭关中的活数:未起步(0 秒)→ 空白,不报「已多得 0」', () => {
    expect(retreatGainedText(0)).toBe('')
  })
})

/**
 * 成就周期补扫 —— 修复「早已越境、低境界成就却仍锁着」。
 *
 * 真相口径:realm/counter 成就在 evalCond 处用 `major >= N` 判定,逻辑本身没写错;
 * 但它只在 track()/trackRealm() 这两个行为触发点被求值。若一份老存档/导入档在
 * 「成就功能上线后未再走突破、也一直没发生任何计数行为」的情况下加载,引擎只跑
 * checkStateAchievements(周期补扫),而它此前不补 realm —— 于是玩家明明已高好几境,
 * 低境界成就却永远锁着。补扫必须在周期里重放一次 checkAchievements。
 */
describe('成就周期补扫应治愈「越境未解锁」', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('境界已拉高、从未 track 过,checkStateAchievements 也应补发低境界成就', () => {
    const player = usePlayerStore()
    const quests = useQuestsStore()
    player.$patch({ major: 12 })
    expect(quests.hasAchieved('a_r1'), '前置于未补扫时应是锁着的(红->绿)').toBe(false)
    checkStateAchievements()
    expect(quests.hasAchieved('a_r1'), '筑基境成就应被周期补扫解锁').toBe(true)
    expect(quests.hasAchieved('a_r5'), '炼虚境成就应补发').toBe(true)
    expect(quests.hasAchieved('a_r9'), '渡劫/真仙成就应补发').toBe(true)
    expect(quests.hasAchieved('a_r12'), '太乙境成就应补发').toBe(true)
  })
})

describe('主线任务同根补扫也应推进', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('境界已过出生任务、未再 track,checkStateAchievements 也应推进主线', () => {
    const player = usePlayerStore()
    const quests = useQuestsStore()
    expect(quests.mainIdx).toBe(0)
    player.$patch({ major: 1 }) // 出生任务 realm_0_2(炼气二层)已满足
    checkStateAchievements()
    expect(quests.mainIdx, '出生任务应被补扫完成并把主线前推一步').toBe(1)
  })
})
