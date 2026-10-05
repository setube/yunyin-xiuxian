/* eslint-disable no-console -- 星象是过程性验收,打印值日轮转 */
/**
 * 星象值日验收(Phase 34.5)
 *
 * 二十八宿这一门最容易做成纯文本:名字好听、分野好看,但玩家用不上。
 * 故这里的判据只有三类:
 *
 *   一 数据是齐的:四象各七宿,宿名/全名/分野/所宜一个不缺;
 *   二 轮值是定的:同一游戏日同一宿,二十八日一轮,不缺不跳;
 *   三 所利是用得上的:值日宿所配界域之地**真的**多一分际遇,他处真的不加。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IMAGES, MANSIONS } from '@/data/xiangxiu'
import { REGIONS, regionDef } from '@/data/regions'
import { worldOf } from '@/data/realms'
import { useGameStore } from '@/stores/game'
import { MANSION_EVENT_LUCK, favoredWorld, isFavoredRegion, mansionEventLuck, mansionLuckPercent, mansionOfDay, todayMansion, todayMansionLine } from './astronomy'
import { exploreEventChance } from './exploration'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('二十八宿 · 数据', () => {
  it('四象各七宿,合二十八宿', () => {
    expect(IMAGES.length).toBe(4)
    expect(MANSIONS.length).toBe(28)
    for (const img of IMAGES) {
      expect(MANSIONS.filter(m => m.image === img.id).length, `${img.name} 不是七宿`).toBe(7)
    }
  })

  it('宿名不重复,全名/分野/所宜都不缺', () => {
    expect(new Set(MANSIONS.map(m => m.name)).size).toBe(28)
    for (const m of MANSIONS) {
      expect(m.fullName.length, `${m.name} 缺全名`).toBeGreaterThan(1)
      expect(m.domain.length, `${m.name} 缺分野`).toBeGreaterThan(0)
      expect(m.good.length, `${m.name} 缺所宜`).toBeGreaterThan(2)
    }
    expect(MANSIONS.find(m => m.name === '角')?.fullName).toBe('角木蛟')
    expect(MANSIONS.find(m => m.name === '轸')?.image).toBe('zhuque')
  })

  it('四象配四界,一个不漏', () => {
    const worlds = new Set(IMAGES.map(i => i.world))
    expect([...worlds].sort()).toEqual(['chaos', 'god', 'immortal', 'mortal'])
  })
})

describe('值日 · 二十八日一轮', () => {
  it('同一游戏日同一宿(确定性)', () => {
    expect(mansionOfDay(12).name).toBe(mansionOfDay(12).name)
    const game = useGameStore()
    game.$patch({ totalPlaySec: 86400 * 12 + 5000 })
    expect(todayMansion().name).toBe(mansionOfDay(12).name)
  })

  it('二十八日恰好走完一轮,不缺不跳', () => {
    const names = new Set<string>()
    for (let d = 0; d < 28; d += 1) names.add(mansionOfDay(d).name)
    expect(names.size).toBe(28)
    expect(mansionOfDay(28).name).toBe(mansionOfDay(0).name)
    // 逐日推进:x 宿之后必是 x 的下一宿
    for (let d = 0; d < 27; d += 1) {
      const i = MANSIONS.findIndex(m => m.name === mansionOfDay(d).name)
      expect(mansionOfDay(d + 1).name).toBe(MANSIONS[(i + 1) % 28]!.name)
    }
  })

  it('负日数/大日数都不越界(老档与长档都算得出)', () => {
    expect(MANSIONS.some(m => m.name === mansionOfDay(-3).name)).toBe(true)
    expect(MANSIONS.some(m => m.name === mansionOfDay(999_999).name)).toBe(true)
  })
})

describe('所利 · 真的只利一方', () => {
  it('值日宿所配界域之地得利,他处不得利', () => {
    const game = useGameStore()
    // 找一天,使其值日宿配人间界,再挑一处人间界地界与一处仙界地界对看
    let day = -1
    for (let d = 0; d < 28; d += 1) {
      if (favoredWorld(mansionOfDay(d)) === 'mortal') {
        day = d
        break
      }
    }
    expect(day, '二十八日里必有人间界得利之日').toBeGreaterThanOrEqual(0)
    game.$patch({ totalPlaySec: day * 86400 })
    const mortal = REGIONS.find(r => worldOf(r.minRealm).id === 'mortal')!
    const immortal = REGIONS.find(r => worldOf(r.minRealm).id === 'immortal')!
    expect(isFavoredRegion(mortal.id)).toBe(true)
    expect(isFavoredRegion(immortal.id)).toBe(false)
    expect(mansionEventLuck(mortal.id)).toBeCloseTo(MANSION_EVENT_LUCK)
    expect(mansionEventLuck(immortal.id)).toBe(0)
    console.log(`\n${todayMansionLine()} —— 利${mortal.name}`)
  })

  it('四界各有得利之日(不是一个界域吃满)', () => {
    const seen = new Set<string>()
    for (let d = 0; d < 28; d += 1) seen.add(favoredWorld(mansionOfDay(d)))
    expect(seen.size).toBe(4)
  })

  it('不存在的地界不加成(坏 id 不报错也不给利)', () => {
    expect(mansionEventLuck('nope')).toBe(0)
    expect(regionDef('nope')).toBeUndefined()
  })
})

describe('星象 · 接线', () => {
  it('历练的际遇判定真的把星象算进去了', () => {
    const src = readFileSync(resolve(__dirname, 'exploration.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).toContain('mansionEventLuck(')
    expect(src).toContain('eventLuck')
  })

  it('历练页与界域志都看得见今日星象', () => {
    for (const file of ['../views/AdventureView.vue', '../views/RealmCodexView.vue']) {
      const src = readFileSync(resolve(__dirname, file), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(src, `${file} 没有显示今日星象`).toContain('todayMansion')
    }
  })

  it('在线与离线同源:际遇概率只有一份口径(含星象之利)', () => {
    // 从前在线与离线各写一遍公式;星象只接进了在线,同一天同一地离线少算一成际遇
    const game = useGameStore()
    let day = -1
    for (let d = 0; d < 28; d += 1) {
      if (favoredWorld(mansionOfDay(d)) === 'mortal') {
        day = d
        break
      }
    }
    game.$patch({ totalPlaySec: day * 86400 })
    const mortal = REGIONS.find(r => worldOf(r.minRealm).id === 'mortal')!
    const immortal = REGIONS.find(r => worldOf(r.minRealm).id === 'immortal')!
    // 同一个函数算两地:得利之地高出 MANSION_EVENT_LUCK 的比例,他处原样
    const lucky = exploreEventChance(mortal.id, {})
    const plain = exploreEventChance(immortal.id, {})
    expect(lucky / plain).toBeCloseTo(1 + MANSION_EVENT_LUCK, 6)

    // 离线结算文件必须调用这一个函数,不许再自己乘一遍
    const offlineSrc = readFileSync(resolve(__dirname, 'offline.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(offlineSrc).toContain('exploreEventChance(')
    expect(offlineSrc).not.toContain('EXPLORE_EVENT_CHANCE')
  })
})

describe('星象加成 · 百分数一处出', () => {
  it('mansionLuckPercent 忠实换算,不魔改常量', () => {
    // 0.1 → 10%;若哪天加成改成 0.15,这里应得 15,而不是 10 原地撒谎
    expect(mansionLuckPercent()).toBe(Math.round(MANSION_EVENT_LUCK * 100))
    expect(mansionLuckPercent()).toBeGreaterThan(0)
  })

  it('历练页 / 界域志 / 数值体系三处都读同一枚,不许各自手算', () => {
    const adventure = readFileSync(resolve(__dirname, '../views/AdventureView.vue'), 'utf8')
    const realm = readFileSync(resolve(__dirname, '../views/RealmCodexView.vue'), 'utf8')
    const doc = readFileSync(resolve(__dirname, '../data/progressionDoc.ts'), 'utf8')
    for (const [name, src] of [
      ['历练页', adventure],
      ['界域志', realm],
      ['数值体系', doc]
    ] as const) {
      expect(src, `${name} 应读 mansionLuckPercent()`).toContain('mansionLuckPercent(')
      expect(src, `${name} 不应再手算 MANSION_EVENT_LUCK × 100`).not.toMatch(/Math\.round\(MANSION_EVENT_LUCK/)
    }
  })
})
