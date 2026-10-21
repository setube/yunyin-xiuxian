/**
 * 第一步(新手引导的起点)判据 —— 它是一张「说错就会把人带偏」的卡,
 * 故逐条钉死:什么时候给、给到哪儿、什么时候必须闭嘴。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { currentFirstStep } from './firstStep'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useCultivationStore } from '@/stores/cultivation'
import { gn, gnZero, toNum } from '@/utils/gnum'

function newPlayer() {
  const player = usePlayerStore()
  player.initCharacter('新手', { roots: [] } as never)
  player.exp = gnZero()
  return player
}

describe('第一步(新手起点)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('开局新手 → 指向历练,且写清为什么', () => {
    newPlayer()
    const step = currentFirstStep()!
    expect(step.to).toBe('/adventure')
    expect(step.label).toBe('去历练')
    expect(step.text).toContain('历练')
    expect(step.hint).toContain('突破')
  })

  it('修为圆满 → 改指修炼页突破(这时还往历练赶是错的)', () => {
    const player = newPlayer()
    player.exp = gn(toNum(player.expReq))
    expect(player.expFull).toBe(true)
    const step = currentFirstStep()!
    expect(step.to).toBe('/cultivation')
    expect(step.label).toBe('去突破')
    expect(step.text).toContain('圆满')
    expect(step.text).toContain('突破')
    // 实际目标层由突破页自己亮;这张卡只负责递「该去哪点」,不另报层数
    expect(step.text).not.toContain('层')
  })

  it('修为未满 → 仍指历练(圆满那一支不该提前触发)', () => {
    const player = newPlayer()
    player.exp = gn(Math.floor(toNum(player.expReq) * 0.9))
    expect(currentFirstStep()!.to).toBe('/adventure')
  })

  it('已经历练过一次 → 收卡(第一步走过了)', () => {
    newPlayer()
    useQuestsStore().inc('explores', 1)
    expect(currentFirstStep()).toBeNull()
  })

  it('第一条主线达成 → 收卡(出师)', () => {
    newPlayer()
    useQuestsStore().mainIdx = 1
    expect(currentFirstStep()).toBeNull()
  })

  it('已突破到筑基以上 → 收卡(老档兜底)', () => {
    const player = newPlayer()
    player.major = 1
    expect(currentFirstStep()).toBeNull()
  })

  it('陨落 → 不给第一步(首页那时该说的是生死大事)', () => {
    newPlayer().markDead()
    expect(currentFirstStep()).toBeNull()
  })

  it('闭关中 → 不给「去历练」:那条路会被当场拦下,指过去等于白点一次', () => {
    newPlayer()
    useCultivationStore().addBuff('retreat', Date.now())
    expect(currentFirstStep()).toBeNull()
  })
})
