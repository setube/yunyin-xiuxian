/**
 * 发布说明数据的形状判据。
 *
 * 发布说明最怕两件事:① 排序乱了(旧版压在新版上面,玩家以为倒退);
 * ② 第一条的版本与 package.json 对不上(「新版本已就绪」与「已是最新」自相矛盾)。
 * 这里把两件事都钉死;changes 非空 + 三件套齐备则是给「真事为纲」托底的最小形状约束。
 */
import { describe, expect, it } from 'vitest'
import { RELEASE_NOTES } from './releaseNotes'
import { compareVersions } from '@/utils/appVersion'
import pkg from '../../package.json'

describe('发布说明 · 形状与排序', () => {
  it('至少有一条说明', () => {
    expect(RELEASE_NOTES.length).toBeGreaterThan(0)
  })

  it('新的在前:逐对校验版本单调不减', () => {
    for (let i = 1; i < RELEASE_NOTES.length; i += 1) {
      const newer = RELEASE_NOTES[i - 1]!
      const older = RELEASE_NOTES[i]!
      expect(
        compareVersions(newer.version, older.version),
        `${newer.version} 应新于 ${older.version} —— 发布说明要按新→旧排`
      ).toBeGreaterThan(0)
    }
  })

  it('每条说明三件套齐备:intro / changes 非空,标题与日期就位', () => {
    for (const n of RELEASE_NOTES) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(n.title.length).toBeGreaterThan(0)
      expect(n.intro.length).toBeGreaterThan(0)
      expect(n.changes.length).toBeGreaterThan(0)
      for (const line of n.changes) expect(line.length).toBeGreaterThan(4)
    }
  })

  it('首条的版本号与 package.json 同源 —— 「已是最新」与「新版本就绪」不会打架', () => {
    expect(RELEASE_NOTES[0]!.version).toBe(pkg.version)
  })

  it('change 逐条以「一、二、三…」文言序号起头', () => {
    const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
    for (const n of RELEASE_NOTES) {
      n.changes.forEach((line, i) => {
        expect(line.startsWith(`${cn[i]}、`), `第 ${i + 1} 条应起手「${cn[i]}、」`).toBe(true)
      })
    }
  })
})
