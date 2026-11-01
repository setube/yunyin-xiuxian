/**
 * 道号与构筑名的长度守卫。
 *
 * 两处文本都由玩家输入:建号页与构筑页在输入侧就截到 NAME_MAX_LENGTH(8),
 * 但读档侧原先只判「非空/是字符串」,不判长度 —— 手改存档塞进几十万字符
 * 会原样留下:存档爆量,顶栏与构筑列表还要渲染那一整段。
 *
 * 本条钉住「读档侧与输入侧同界」,并确认正常名不被误伤。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useLoadoutsStore } from '@/stores/loadouts'
import { NAME_MAX_LENGTH } from '@/data/constants'

describe('道号 · 读档截断', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function withName(raw: unknown) {
    const p = usePlayerStore()
    ;(p as unknown as { name: unknown }).name = raw
    p.sanitize()
    return p.name
  }

  it('超长道号被截到 NAME_MAX_LENGTH', () => {
    expect(withName('道'.repeat(50000)).length).toBe(NAME_MAX_LENGTH)
  })

  it('正常道号原样保留(修形非空转)', () => {
    expect(withName('青云子')).toBe('青云子')
    expect(withName('一二三四五六七八'), '恰好八字的道号不该被削').toBe('一二三四五六七八')
  })

  it('两端空白被去掉(与输入侧的 trim 一致)', () => {
    expect(withName('  青云子  ')).toBe('青云子')
  })

  it('空串与全空白仍是「无名散修」,不因截断逻辑而变成空', () => {
    expect(withName('')).toBe('无名散修')
    expect(withName('   ')).toBe('无名散修')
    expect(withName(42)).toBe('无名散修')
    expect(withName(null)).toBe('无名散修')
  })

  it('截断发生在 trim 之后:前导空白不会挤掉真名', () => {
    // 若先截再 trim,'  ' + 八字名 会先被截成 '  一二三四五',丢掉三个字
    expect(withName('   一二三四五六七八')).toBe('一二三四五六七八')
  })
})

describe('构筑名 · 读档截断', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function withLoadoutName(raw: unknown) {
    const s = useLoadoutsStore()
    s.list = [
      { id: 'a', name: raw, seal: '道', mainGongfa: null, subGongfa: [], artifactIds: [], equipment: {}, savedAt: 1 }
    ] as never
    s.sanitize()
    return s.list[0]!.name
  }

  it('超长构筑名被截到 NAME_MAX_LENGTH', () => {
    expect(withLoadoutName('筑'.repeat(100000)).length).toBe(NAME_MAX_LENGTH)
  })

  it('正常构筑名原样保留', () => {
    expect(withLoadoutName('罡盾反震')).toBe('罡盾反震')
  })

  it('非字符串构筑名回落空串', () => {
    expect(withLoadoutName(42)).toBe('')
    expect(withLoadoutName(null)).toBe('')
  })

  it('道号与构筑名共用同一条界(不许一处 8 一处 12)', () => {
    expect(NAME_MAX_LENGTH).toBe(8)
  })
})
