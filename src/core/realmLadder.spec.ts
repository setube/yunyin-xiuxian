import { describe, expect, it } from 'vitest'
import { realmLadderPoints, realmLadderWorlds } from './realmLadder'
import { REALMS, WORLDS } from '@/data/realms'

describe('仙路旅途 · 21 境刻度', () => {
  it('刻度与境界表同长(21 境),每境携带自己的名字', () => {
    const pts = realmLadderPoints(0)
    expect(pts).toHaveLength(REALMS.length)
    expect(pts[0]!.name).toBe(REALMS[0]!.name)
    expect(pts[20]!.name).toBe(REALMS[20]!.name)
  })

  it('第 0 境是「现在」,余者皆「未至」', () => {
    const pts = realmLadderPoints(0)
    expect(pts.map(p => p.state)).toEqual(['now', ...Array(REALMS.length - 1).fill('future')])
  })

  it('途中某境:之前的皆「已至」、自身「现在」、之后「未至」', () => {
    const pts = realmLadderPoints(3)
    expect(pts.slice(0, 3).every(p => p.state === 'done')).toBe(true)
    expect(pts[3]!.state).toBe('now')
    expect(pts.slice(4).every(p => p.state === 'future')).toBe(true)
  })

  it('末境:前 20 境已至,最后一境为「现在」', () => {
    const pts = realmLadderPoints(REALMS.length - 1)
    expect(pts.slice(0, -1).every(p => p.state === 'done')).toBe(true)
    expect(pts[pts.length - 1]!.state).toBe('now')
  })

  it('越界修正与 realmDef 同口径(major<0 按 0、超界按末境)', () => {
    expect(realmLadderPoints(-5)[0]!.state).toBe('now')
    expect(realmLadderPoints(-5).every(p => p.state !== 'done')).toBe(true)
    const top = realmLadderPoints(999)
    expect(top[top.length - 1]!.state).toBe('now')
    expect(top[0]!.state).toBe('done')
  })

  it('界首标在世界之别处(isWorldEntry 同源):0/9/14/18 四处', () => {
    const pts = realmLadderPoints(0)
    const starts = pts.filter(p => p.worldStart).map(p => p.index)
    expect(starts).toEqual([0, 9, 14, 18])
  })
})

describe('仙路旅途 · 界段', () => {
  it('四界与 data 同源,各自给出首尾索引', () => {
    const ws = realmLadderWorlds()
    expect(ws).toHaveLength(WORLDS.length)
    expect(ws.map(w => w.name)).toEqual(WORLDS.map(w => w.name))
    expect(ws[1]!.start).toBe(WORLDS[1]!.start)
    expect(ws[3]!.end).toBe(WORLDS[3]!.end)
  })
})
