/**
 * 五星串。
 *
 * 同一段换算曾有三份逐字相同的实现:buildAdvisor.starsText、powerRating.ratingStars、
 * rateRank.rateStarsText。后一份的注释还写着「与 buildAdvisor.starsText 的钳制取法保持一致」——
 * 靠注释维持的一致性,改一处另两处不会跟。
 *
 * 判据:
 *   一 恒五个字符 —— 长度不固定时 tabular 列会错位。
 *   二 星数夹进 1~5:越界不抛 RangeError,'☆'.repeat 不会收到负数。
 *   三 坏值按 1 星(少承诺)。
 *   四 三处都走这一份,不许再各写 '★'.repeat。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clampStars, starRow } from './starRow'
import { starsText } from '@/core/buildAdvisor'
import { ratingStars } from '@/core/powerRating'
import { rateStarsText } from './rateRank'

const ROOT = resolve(__dirname, '../..')
const SRC = (p: string): string =>
  readFileSync(resolve(ROOT, p), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

describe('五星串 · 一、恒五个字符', () => {
  it('1~5 星各给五个字符', () => {
    for (let n = 1; n <= 5; n++) {
      expect(starRow(n), `${n} 星`).toHaveLength(5)
    }
  })

  it('恒星数递增,空星递减', () => {
    for (let n = 1; n <= 5; n++) {
      expect([...starRow(n)].filter(c => c === '★')).toHaveLength(n)
      expect([...starRow(n)].filter(c => c === '☆')).toHaveLength(5 - n)
    }
  })

  it('只含两种星符', () => {
    for (let n = 0; n <= 6; n++) expect(starRow(n)).toMatch(/^★+☆*$/)
  })
})

describe('五星串 · 二、越界不抛错', () => {
  it('超过五颗不会让 ☆.repeat 收到负数', () => {
    // 原实现直接 '☆'.repeat(5 - stars),stars>5 时是 RangeError
    expect(() => starRow(9)).not.toThrow()
    expect(starRow(9)).toBe('★★★★★')
  })

  it('零与负星给一颗', () => {
    expect(starRow(0)).toBe('★☆☆☆☆')
    expect(starRow(-3)).toBe('★☆☆☆☆')
  })

  it('小数四舍五入', () => {
    expect(starRow(2.4)).toBe('★★☆☆☆')
    expect(starRow(2.6)).toBe('★★★☆☆')
  })
})

describe('五星串 · 三、坏值按一星', () => {
  it('NaN / Infinity 落到一星 —— 少承诺', () => {
    expect(clampStars(Number.NaN)).toBe(1)
    expect(starRow(Number.NaN)).toBe('★☆☆☆☆')
    expect(clampStars(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('五星串 · 四、三处同用一份', () => {
  it('三处的输出逐档相同', () => {
    for (let n = 1; n <= 5; n++) {
      expect(starsText(n), 'buildAdvisor 飘了').toBe(starRow(n))
      expect(ratingStars(n), 'powerRating 飘了').toBe(starRow(n))
    }
    expect(rateStarsText(1), 'rateRank 飘了').toBe(starRow(5))
    expect(rateStarsText(0), 'rateRank 飘了').toBe(starRow(1))
  })

  it('三处都不再自己写 ★.repeat', () => {
    for (const [p, name] of [
      ['src/core/buildAdvisor.ts', 'buildAdvisor'],
      ['src/core/powerRating.ts', 'powerRating'],
      ['src/ui/rateRank.ts', 'rateRank']
    ] as const) {
      const body = SRC(p)
      expect(body, `${name}又自己拼了一遍星串`).not.toContain("'★'.repeat")
      expect(body, `${name}该走 ui/starRow`).toMatch(/from ['"]@?[./@\w/-]*starRow['"]/)
    }
  })

  it('钳制只有一份实现', () => {
    for (const p of ['src/core/buildAdvisor.ts', 'src/core/powerRating.ts']) {
      expect(SRC(p), `${p}又写了一遍 Math.max(1, Math.min(5`).not.toContain('Math.min(5, Math.round(stars))')
    }
  })
})
