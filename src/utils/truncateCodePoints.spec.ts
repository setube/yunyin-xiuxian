/**
 * 按码点截断,不切开代理对。
 *
 * `'一二三四五六七\u{1F600}'.slice(0, 8)` 得到 `'一二三四五六七\ud83d'` —— 一个落单的高代理项,
 * `isWellFormed()` 为 false。这种串能原样写进存档、原样读回,但渲染时是乱码方块,
 * 且会让字体回退、正则、`JSON.stringify` 走不可预期的分支。
 *
 * 玩家可输入的三处(道号 / 构筑名 / 装备标记)都走这里。
 * 输入框的 `maxlength` 按码元算,到 sanitize 这一层再截一次才不会漏。
 */
import { describe, expect, it } from 'vitest'
import { truncateCodePoints } from './saveShape'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { NAME_MAX_LENGTH } from '@/data/constants'

describe('truncateCodePoints · 不切代理对', () => {
  it('emoji 整枚保留,不产生落单代理项', () => {
    // 7 个汉字 + 1 个 emoji:emoji 占两个码元,按码元切会断
    const got = truncateCodePoints('一二三四五六七\u{1F600}', 8)
    expect(got).toBe('一二三四五六七\u{1F600}')
    expect((got as unknown as { isWellFormed: () => boolean }).isWellFormed()).toBe(true)
    // 对照:按码元切必然断
    const broken = '一二三四五六七\u{1F600}'.slice(0, 8)
    expect((broken as unknown as { isWellFormed: () => boolean }).isWellFormed(), '对照组应为一个落单代理项').toBe(false)
  })

  it('全 emoji 串按枚数截,不按码元', () => {
    const got = truncateCodePoints('\u{1F600}'.repeat(9), 8)
    expect(Array.from(got)).toHaveLength(8)
    expect((got as unknown as { isWellFormed: () => boolean }).isWellFormed()).toBe(true)
  })

  it('未超长原样返回;边界与非法上限', () => {
    expect(truncateCodePoints('三个字', 8)).toBe('三个字')
    expect(truncateCodePoints('abc', 0)).toBe('')
    expect(truncateCodePoints('abc', Number.NaN)).toBe('')
    expect(truncateCodePoints('abc', -1)).toBe('')
  })

  it('道号读档侧走的是按码点截断', () => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    player.initCharacter('测试', { roots: [] } as never)
    player.name = '一二三四五六七\u{1F600}'
    player.sanitize()
    expect(Array.from(player.name), '读档侧应保留完整 emoji').toHaveLength(8)
    expect((player.name as unknown as { isWellFormed: () => boolean }).isWellFormed()).toBe(true)
    expect(Array.from(player.name).length, `上限应仍是 ${NAME_MAX_LENGTH} 个字符`).toBeLessThanOrEqual(NAME_MAX_LENGTH)
  })
})
