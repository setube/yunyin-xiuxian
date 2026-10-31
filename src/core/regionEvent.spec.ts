/** 区域动态事件:临时异象,自动过期 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { REGION_EVENTS, regionEventDef, currentRegionEvent } from './regionEvent'
import { usePlayerStore } from '@/stores/player'

describe('区域动态事件(regionEvent)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('事件表完整:妖潮/灵脉暴动/古墓/商队', () => {
    expect(REGION_EVENTS.map(e => e.id)).toEqual(['yaochao', 'lingmai', 'gumu', 'shangdui'])
    for (const ev of REGION_EVENTS) {
      expect(ev.desc).toBeTruthy()
      expect(regionEventDef(ev.id)?.name).toBe(ev.name)
    }
  })

  it('事件按区域生效,过期自动清理', () => {
    const player = usePlayerStore()
    player.setRegionEvent({ regionId: 'qingyun', eventId: 'yaochao', endsAt: Date.now() + 60_000 })
    expect(currentRegionEvent('qingyun')?.eventId).toBe('yaochao')
    expect(currentRegionEvent('luoxia')).toBeNull()
    player.setRegionEvent({ regionId: 'qingyun', eventId: 'gumu', endsAt: Date.now() - 1000 })
    expect(currentRegionEvent('qingyun')).toBeNull()
    expect(player.regionEvent).toBeNull()
  })

  it('妖潮更险更多掉落,灵脉无额外危险', () => {
    const yaochao = regionEventDef('yaochao')!
    expect(yaochao.dangerMult).toBeGreaterThan(1)
    expect(yaochao.rewardMult).toBeGreaterThan(1)
    const lingmai = regionEventDef('lingmai')!
    expect(lingmai.dangerMult).toBe(1)
  })

  /**
   * 数据侧不变式:每个事件都必须「确实做点什么」。
   *
   * 上一条用例只断言了灵脉「无额外危险」(dangerMult=1),没断言它有没有好处。
   * 一个三个倍率全为 1 的事件在结算里等于不存在,玩家却会读到它的 desc
   * (「地底灵脉喷薄,天地灵气大盛」)—— 文案承诺了效果,代码里却没有。
   * 本条把「至少一项 ≠ 1」钉住,防止未来有人把某个事件的倍率调平。
   */
  /**
   * 已知问题(2026-11,记录待决,未擅自修):
   * 「灵脉暴动」三个倍率全为 1,在结算里等于不存在;而它的 desc 写着
   * 「地底灵脉喷薄,天地灵气大盛」,承诺了效果。RegionEventDef 也没有灵气字段。
   *
   * 不擅自加效果,是因为那会改变平衡;也不擅自改文案,因为那会让这个事件失去存在意义。
   * 这里只把现状钉成显式清单:中性事件必须在此登记,新增中性事件时本行会红,
   * 迫使后来者决定「补效果」还是「改文案」,而不是默默留一个空事件。
   */
  const KNOWN_NEUTRAL = new Set(['lingmai'])
  it('中性事件(三项倍率全为 1)必须已在 KNOWN_NEUTRAL 里登记', () => {
    const neutral = REGION_EVENTS.filter(e => e.rewardMult === 1 && e.dangerMult === 1 && e.eventMult === 1)
    for (const e of neutral) {
      expect(KNOWN_NEUTRAL.has(e.id), `「${e.name}」三项倍率全为 1 却没登记;补效果或改文案,别留空事件`).toBe(true)
    }
    // 登记过但已不再中性时也要清掉,免得清单变成过期的免责声明
    for (const id of KNOWN_NEUTRAL) {
      const e = regionEventDef(id)
      expect(e, `KNOWN_NEUTRAL 里的 ${id} 已不存在`).toBeDefined()
      const stillNeutral = e!.rewardMult === 1 && e!.dangerMult === 1 && e!.eventMult === 1
      expect(stillNeutral, `「${e!.name}」已不再中性,请从 KNOWN_NEUTRAL 移除`).toBe(true)
    }
  })

  it('倍率都是有限正数(0 会让对应产出归零,负数会反转语义)', () => {
    for (const e of REGION_EVENTS) {
      for (const [k, v] of Object.entries({ rewardMult: e.rewardMult, dangerMult: e.dangerMult, eventMult: e.eventMult })) {
        expect(Number.isFinite(v), `「${e.name}」的 ${k}=${v} 不是有限数`).toBe(true)
        expect(v, `「${e.name}」的 ${k}=${v} 应为正`).toBeGreaterThan(0)
      }
    }
  })

  it('id 与 name 都不重复,desc 非空', () => {
    const ids = REGION_EVENTS.map(e => e.id)
    const names = REGION_EVENTS.map(e => e.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
    for (const e of REGION_EVENTS) expect(e.desc.length, `「${e.name}」没描述`).toBeGreaterThan(0)
  })

  it('regionEventDef 认得每个 id,不认识的返回 undefined', () => {
    for (const e of REGION_EVENTS) expect(regionEventDef(e.id)).toBe(e)
    expect(regionEventDef('__nope__')).toBeUndefined()
  })
})
