/**
 * 界域志的「已过」标记。
 *
 * 每个境界格原先只有「当前」有标签;已过与未到仅靠字色深浅区分
 * (text-ink-soft / text-ink-faint)。两色差得很小,21 境铺下来读不出哪几境已过。
 *
 * 判据:
 *   一 已过的给一道方印,与「当前」的朱字分开 —— 两个状态用两套形制。
 *   二 判据与界域刻度同源:严格低于当前境界才算已过。
 *   三 当前那一境不标「过」—— 它还没有过。
 *   四 方印有读屏名,不只靠颜色。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REALMS } from '@/data/realms'
import { worldProgress } from './worldProgress'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')

describe('已过标记 · 一、与「当前」分开', () => {
  it('已过用方印,当前用朱字 —— 两套形制', () => {
    expect(VIEW, '缺已过的方印').toContain('realm-passed')
    // 当前那支仍在
    expect(VIEW).toContain('当前')
    expect(VIEW).toMatch(/cell\.index === player\.major/)
  })

  it('方印给读屏名,不只靠颜色', () => {
    expect(VIEW).toContain('aria-label="已过"')
  })

  it('方印的字是可见的「过」,不是空框', () => {
    expect(VIEW).toMatch(/realm-passed[\s\S]{0,300}>过</)
  })
})

describe('已过标记 · 二、判据与界域刻度同源', () => {
  it('模板按「严格低于当前境界」判定', () => {
    expect(VIEW).toMatch(/v-if="cell\.index < player\.major"/)
  })

  it('与 worldProgress 的 passed 口径一致 —— 当前那一境不算已过', () => {
    for (const major of [0, 1, 3, 9, 15]) {
      const rows = worldProgress(major)
      // 界域刻度里各段 passed 之和,应等于「低于 major 的境界数」
      const fromSegs = rows.reduce((s, w) => s + w.passed, 0)
      expect(fromSegs, `major=${major} 时两处口径不同`).toBe(major)
      // 当前那一境本身不计入
      expect(major < REALMS.length).toBe(true)
    }
  })

  it('刚开局(major 0)时一个「过」都没有', () => {
    expect(worldProgress(0).reduce((s, w) => s + w.passed, 0)).toBe(0)
  })

  it('走到最后一境时,已过数比总数少一', () => {
    const last = REALMS.length - 1
    expect(worldProgress(last).reduce((s, w) => s + w.passed, 0)).toBe(last)
  })
})

describe('已过标记 · 三、样式只取既有 token', () => {
  const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

  it('方印用 jade,与「当前」的朱砂分开', () => {
    expect(VIEW).toMatch(/realm-passed[\s\S]{0,300}jade/)
  })

  it('没有为这枚印章新造颜色', () => {
    // 用的是 tailwind 的既有语义类,不在 style.css 里另开一段
    expect(CSS).not.toContain('.realm-passed')
  })
})
