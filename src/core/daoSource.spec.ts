import { describe, expect, it } from 'vitest'
import { gn } from '@/utils/gnum'
import { daoSourceShortfall, daoSourceShortText } from './daoSource'

describe('道源缺口', () => {
  it('只差一部分时报实际差额,不把总价当缺口', () => {
    const short = daoSourceShortfall(15, 10)
    expect(short.short).toEqual(gn(5))
    expect(short.reason).toBe('道源尚差 5')
  })

  it('余额恰好够时缺口归零,拒因为空', () => {
    const short = daoSourceShortfall(15, 15)
    expect(short.short.m).toBe(0)
    expect(short.reason).toBeNull()
    expect(daoSourceShortText(15, 15)).toBe('0')
  })

  it('负余额与小数输入都归一到整数余额', () => {
    const short = daoSourceShortfall(15.9, -2)
    expect(short.short).toEqual(gn(15))
    expect(short.reason).toBe('道源尚差 15')
  })
})
