/**
 * 异常留档(diag 分片)
 *
 * 它存在的理由是「已记录」这句话必须坐实:玩家报问题时,手上要真有一份东西可交。
 * 故三条契约:
 *  1. 记得到、留得住(封顶 20 条,同一条连发只加计数);
 *  2. 分片被写坏时自修,且**诊断自身绝不再抛**;
 *  3. 摘要只留能定位问题的部分,长度可控(不许把整份堆栈或玩家数据塞进存档)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DIAG_MAX, DIAG_MESSAGE_MAX, summarizeError, useDiagStore } from './diag'

describe('异常留档', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.useRealTimers())

  it('记录按时间先后追加,最近一条在末尾', () => {
    const diag = useDiagStore()
    diag.record({ info: 'render', message: 'Error: 第一下', route: '#/cultivation', at: 1000 })
    diag.record({ info: 'setup', message: 'Error: 第二下', route: '#/adventure', at: 2000 })
    expect(diag.errors.map(e => e.message)).toEqual(['Error: 第一下', 'Error: 第二下'])
    expect(diag.errors[1]!.route).toBe('#/adventure')
    expect(diag.errors.every(e => e.count === 1)).toBe(true)
  })

  it('同一条连发只加计数,不占新格(挂机时每秒一次也刷不满)', () => {
    const diag = useDiagStore()
    for (let i = 0; i < 50; i += 1) diag.record({ info: 'render', message: 'Error: 同一处', at: 1000 + i })
    expect(diag.errors).toHaveLength(1)
    expect(diag.errors[0]!.count).toBe(50)
    expect(diag.errors[0]!.at, '计数刷新时时刻该跟着走').toBe(1049)
  })

  it('来源不同或内容不同就是另一条', () => {
    const diag = useDiagStore()
    diag.record({ info: 'render', message: 'Error: 一样的话' })
    diag.record({ info: 'setup', message: 'Error: 一样的话' })
    diag.record({ info: 'setup', message: 'Error: 另一句' })
    expect(diag.errors).toHaveLength(3)
  })

  it(`最多留 ${DIAG_MAX} 条,挤掉的是最旧的`, () => {
    const diag = useDiagStore()
    for (let i = 0; i < DIAG_MAX + 5; i += 1) diag.record({ info: 'x', message: `Error: ${i}` })
    expect(diag.errors).toHaveLength(DIAG_MAX)
    expect(diag.errors[0]!.message).toBe('Error: 5')
    expect(diag.errors[DIAG_MAX - 1]!.message).toBe(`Error: ${DIAG_MAX + 4}`)
  })

  it('摘要截断到上限,不把整份堆栈塞进存档', () => {
    const diag = useDiagStore()
    diag.record({ info: 'x', message: 'A'.repeat(5000) })
    expect(diag.errors[0]!.message).toHaveLength(DIAG_MESSAGE_MAX)
  })

  it('清空', () => {
    const diag = useDiagStore()
    diag.record({ info: 'x', message: 'Error: 有' })
    diag.clear()
    expect(diag.errors).toEqual([])
  })

  describe('坏档韧性(诊断自身绝不再抛)', () => {
    it('record 收到坏入参也不抛:只收字符串字段,坏时刻回落当前时间', () => {
      vi.useFakeTimers()
      vi.setSystemTime(123456)
      const diag = useDiagStore()

      expect(() => diag.record(null as never)).not.toThrow()
      expect(() => diag.record(42 as never)).not.toThrow()
      expect(diag.errors.map(e => e.message)).toEqual(['未知异常'])
      expect(diag.errors[0]!.count, '同一条坏入参仍按相邻去重计数').toBe(2)
      expect(diag.errors.every(e => e.at === 123456 && e.info === '' && e.route === '')).toBe(true)

      diag.clear()
      expect(() => diag.record({ info: 7, message: 42, route: null, at: NaN } as never)).not.toThrow()
      expect(diag.errors[0]).toMatchObject({ at: 123456, info: '', message: '未知异常', route: '' })

      diag.clear()
      for (const at of [Infinity, -Infinity, -1]) {
        diag.record({ info: 'render', message: 'Error: 坏时刻', at })
      }
      expect(diag.errors.every(e => e.at === 123456), '坏时刻不能写进诊断分片').toBe(true)
    })

    it('record 收到非对象时同样自修坏分片,不让诊断抛第二下', () => {
      vi.useFakeTimers()
      vi.setSystemTime(654321)
      const diag = useDiagStore()
      diag.$patch({ errors: { 乱: '写' } as never })
      expect(() => diag.record(null as never)).not.toThrow()
      expect(diag.errors).toEqual([{ at: 654321, info: '', message: '未知异常', route: '', count: 1 }])
    })

    it('分片不是数组 → 修回空表', () => {
      const diag = useDiagStore()
      diag.$patch({ errors: '坏掉的一坨' as never })
      diag.sanitize()
      expect(diag.errors).toEqual([])
    })

    it('数组里混进垃圾 → 只留形状完整的,字段照样修形', () => {
      const diag = useDiagStore()
      diag.$patch({
        errors: [
          null,
          { message: 42 },
          { message: 'Error: 好的', info: 'render', at: 'NaN', route: 7, count: -3 },
          { message: 'Error: 也行' }
        ] as never
      })
      diag.sanitize()
      expect(diag.errors.map(e => e.message)).toEqual(['Error: 好的', 'Error: 也行'])
      expect(diag.errors[0]!.at).toBe(0)
      expect(diag.errors[0]!.route).toBe('')
      expect(diag.errors[0]!.count, '计数至少是 1').toBe(1)
      expect(diag.errors[1]!.info).toBe('')
    })

    it('分片坏着时也能继续记(先自修再写,不把记录变成第二个异常)', () => {
      const diag = useDiagStore()
      diag.$patch({ errors: { 乱: '写' } as never })
      expect(() => diag.record({ info: 'render', message: 'Error: 坏档之后' })).not.toThrow()
      expect(diag.errors).toHaveLength(1)
      expect(diag.errors[0]!.message).toBe('Error: 坏档之后')
    })

    it('超量分片读档后收敛到上限', () => {
      const diag = useDiagStore()
      diag.$patch({
        errors: Array.from({ length: 50 }, (_, i) => ({ message: `Error: ${i}`, info: '', at: i, route: '', count: 1 }))
      })
      diag.sanitize()
      expect(diag.errors).toHaveLength(DIAG_MAX)
      expect(diag.errors[DIAG_MAX - 1]!.message).toBe('Error: 49')
    })
  })

  describe('summarizeError', () => {
    it('Error 取 name + message', () => {
      expect(summarizeError(new TypeError('炸了'))).toBe('TypeError: 炸了')
    })

    it('字符串原样,对象转 JSON', () => {
      expect(summarizeError('裸字符串')).toBe('裸字符串')
      expect(summarizeError({ code: 7 })).toBe('{"code":7}')
    })

    it('转不出 JSON 的(循环引用)也不抛', () => {
      const cyclic: Record<string, unknown> = {}
      cyclic.self = cyclic
      expect(() => summarizeError(cyclic)).not.toThrow()
      expect(typeof summarizeError(cyclic)).toBe('string')
    })

    it('undefined/null 也要给出一行可读的东西', () => {
      expect(summarizeError(undefined)).toBe('undefined')
      expect(summarizeError(null)).toBe('null')
    })
  })
})
