/**
 * 备份提醒判据(设置页备份行转琥珀色):
 *   一 新档(攒不够 SAVE_WORTH_BACKUP_DAYS 天)不提醒,从没导出过也不提醒
 *   二 老档 + 备份过旧(或从未导出)才提醒;刚导出即不提醒
 * 故障注入:去掉 shouldPromptBackup 里的存档天数判断,「新档不唠叨」用例红。
 */
import { describe, expect, it } from 'vitest'
import {
  BACKUP_STALE_DAYS,
  SAVE_WORTH_BACKUP_DAYS,
  backupAdvice,
  daysSinceExport,
  formatLastExport,
  shouldPromptBackup
} from './saveBackup'

const DAY = 86400000
const NOW = Date.UTC(2026, 8, 15, 12, 0, 0)
const daysAgo = (n: number): number => NOW - n * DAY

describe('备份账目', () => {
  it('从没导出过:状态是 never,文案是「从未导出」', () => {
    expect(backupAdvice(0, NOW)).toBe('never')
    expect(daysSinceExport(0, NOW)).toBeNull()
    expect(formatLastExport(0, NOW)).toBe('从未导出')
  })

  /*
   * `now` 非有限值时要整块作废,不能让 NaN 流到分档上。
   *
   * 变异扫描报 `if (!Number.isFinite(now)) return null` 改坏不红。
   * 去掉后 (NaN - lastExportAt)/DAY 得 NaN,Math.floor/max 都保留 NaN,
   * 于是 daysSinceExport 返回 NaN 而不是 null —— backupAdvice 里
   * `days === null` 不成立,再判 `NaN >= BACKUP_STALE_DAYS` 得 false,
   * 结果是「三天没导出」被误报成 fresh,备份提醒就此哑掉。
   */
  it('now 坏掉时按「从未导出」处理,不许把 NaN 当天数', () => {
    const threeDaysAgo = daysAgo(3)
    expect(daysSinceExport(threeDaysAgo, NaN)).toBeNull()
    expect(daysSinceExport(threeDaysAgo, Infinity)).toBeNull()
    expect(backupAdvice(threeDaysAgo, NaN), '坏 now 不该被判成 fresh').toBe('never')
    expect(formatLastExport(threeDaysAgo, NaN)).toBe('从未导出')
  })

  it('刚导出 / 隔了几天 / 过了阈值:分档与文案', () => {
    expect(formatLastExport(NOW - 1000, NOW)).toBe('今天')
    expect(formatLastExport(daysAgo(1), NOW)).toBe('1 天前')
    expect(formatLastExport(daysAgo(13), NOW)).toBe('13 天前')
    expect(backupAdvice(daysAgo(BACKUP_STALE_DAYS - 1), NOW)).toBe('fresh')
    expect(backupAdvice(daysAgo(BACKUP_STALE_DAYS), NOW)).toBe('stale')
  })

  it('新档不唠叨:攒不够天数时,从没导出过也不提醒', () => {
    const newSave = daysAgo(1)
    expect(shouldPromptBackup(0, newSave, NOW)).toBe(false)
    expect(shouldPromptBackup(daysAgo(999), newSave, NOW)).toBe(false)
    // 边界:刚好攒够天数即提醒
    expect(shouldPromptBackup(0, daysAgo(SAVE_WORTH_BACKUP_DAYS), NOW)).toBe(true)
  })

  it('老档才提醒,而且刚导出的那次立刻安静', () => {
    const oldSave = daysAgo(120)
    expect(shouldPromptBackup(0, oldSave, NOW)).toBe(true)
    expect(shouldPromptBackup(daysAgo(BACKUP_STALE_DAYS + 1), oldSave, NOW)).toBe(true)
    expect(shouldPromptBackup(daysAgo(BACKUP_STALE_DAYS - 1), oldSave, NOW)).toBe(false)
    expect(shouldPromptBackup(NOW, oldSave, NOW)).toBe(false)
  })

  it('时钟回拨 / 坏值不许算出负数天或整天提醒', () => {
    // 导出时间在未来(改过系统时间):按 0 天算
    expect(daysSinceExport(NOW + 5 * DAY, NOW)).toBe(0)
    expect(backupAdvice(NOW + 5 * DAY, NOW)).toBe('fresh')
    // createdAt 坏值(0)
    expect(shouldPromptBackup(0, 0, NOW)).toBe(false)
    // 字段非数字:按「从未导出」,不出现「NaN 天前」
    const broken = 'abc' as unknown as number
    expect(daysSinceExport(broken, NOW)).toBeNull()
    expect(formatLastExport(broken, NOW)).toBe('从未导出')
    expect(shouldPromptBackup(broken, daysAgo(30), NOW)).toBe(true)
  })
})
