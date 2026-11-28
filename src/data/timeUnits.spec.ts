/* eslint-disable no-console -- 对账表是给人看的 */
/**
 * 古语时制对账:文案里出现时制词,就折成秒与数据对账。
 * 时制表见 data/timeUnits;不在表上的值写「将近 X / X 有余」并附分钟数。
 * 故障注入:改数值不改文案,本用例红。
 */
import { describe, expect, it } from 'vitest'
import { PILLS } from './pills'
import { BUFFS, buffDef } from './buffs'
import type { PillDef } from '@/types'
import {
  HALF_SHICHEN_SEC,
  INCENSE_SEC,
  KE_SEC,
  SHICHEN_SEC,
  TEA_SEC,
  classicalDuration,
  cnNum,
  parseClassicalDuration,
} from './timeUnits'

/** 从文案里取出括号中的现代时长(分钟/小时/秒),折成秒 */
function modernSecondsIn(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(分钟|小时|秒)/.exec(text)
  if (!m) return null
  const n = Number(m[1])
  return m[2] === '小时' ? n * 3600 : m[2] === '分钟' ? n * 60 : n
}

/** 一味丹的真实时长(秒):即时丹看 expSecs;增益丹看它 buff 的持续秒数 */
function pillActualSec(def: PillDef): number | null {
  if (def.instant?.expSecs) return def.instant.expSecs
  if (def.buffId) return buffDef(def.buffId)?.durationSec ?? null
  return null
}

/** 一味丹的时长文案对账:违反任一判据返回错误串,否则 null;全表对账与故障注入共用 */
function pillDurationViolation(def: PillDef): string | null {
  const claimed = parseClassicalDuration(def.desc)
  const modern = modernSecondsIn(def.desc)
  const actual = pillActualSec(def)
  if (claimed === null && modern === null) {
    if (def.instant?.expSecs) return `${def.id}:有 expSecs ${def.instant.expSecs}s,文案却没写等效时长`
    return null
  }
  if (actual === null || actual === undefined) return `${def.id}:文案里写了时长,数据里却没有时长可比`
  if (claimed) {
    if (claimed.exact && claimed.sec !== actual)
      return `${def.id}:古语 ${claimed.sec}s 实为 ${actual}s · "${def.desc}"`
    if (!claimed.exact && Math.abs(claimed.sec - actual) > KE_SEC)
      return `${def.id}:「将近/有余」跑出了最近那一档 · "${def.desc}"`
  }
  if (modern !== null && modern !== actual)
    return `${def.id}:括号里的现代时长 ${modern}s ≠ 实际 ${actual}s · "${def.desc}"`
  return null
}

describe('古语时制 · 表本身', () => {
  it('表常量就是这份口径:一盏茶 10 分 / 一刻 15 分 / 一炷香 30 分 / 半个时辰 1 小时 / 一个时辰 2 小时', () => {
    expect(TEA_SEC).toBe(600)
    expect(KE_SEC).toBe(900)
    expect(INCENSE_SEC).toBe(1800)
    expect(HALF_SHICHEN_SEC).toBe(3600)
    expect(SHICHEN_SEC).toBe(7200)
    expect(SHICHEN_SEC).toBe(2 * 3600)
    expect(SHICHEN_SEC / KE_SEC).toBe(8)
    expect(HALF_SHICHEN_SEC / KE_SEC).toBe(4)
  })

  it('古语与秒可以互推:半个时辰/一个时辰/几个时辰/几刻都折得回秒', () => {
    const sec = (s: string): number => parseClassicalDuration(s)?.sec ?? -1
    expect(sec('半个时辰')).toBe(HALF_SHICHEN_SEC)
    expect(sec('一个时辰')).toBe(SHICHEN_SEC)
    expect(sec('两个时辰')).toBe(2 * SHICHEN_SEC)
    expect(sec('一个半时辰')).toBe(SHICHEN_SEC + HALF_SHICHEN_SEC)
    expect(sec('两个半时辰')).toBe(2 * SHICHEN_SEC + HALF_SHICHEN_SEC)
    expect(sec('一刻')).toBe(KE_SEC)
    expect(sec('六刻')).toBe(6 * KE_SEC)
    expect(sec('一炷香')).toBe(INCENSE_SEC)
    expect(sec('一盏茶')).toBe(TEA_SEC)
    // 近似说法:判据放宽到一刻之内
    expect(parseClassicalDuration('将近一刻')?.exact).toBe(false)
    expect(parseClassicalDuration('一刻')?.exact).toBe(true)
    expect(parseClassicalDuration('一刻有余')?.exact).toBe(false)
  })

  it('古今对照写法:确切值用古语 + 分钟;落不在表上的说清与最近一档的关系', () => {
    console.log(
      '\n  ' +
        [600, 900, 1800, 3600, 5400, 7200, 10800, 21600, 540, 1080]
          .map((s) => `${s}s=${classicalDuration(s)}`)
          .join(' · ')
    )
    expect(classicalDuration(TEA_SEC)).toBe('一盏茶(10 分钟)')
    expect(classicalDuration(KE_SEC)).toBe('一刻(15 分钟)')
    expect(classicalDuration(INCENSE_SEC)).toBe('一炷香(30 分钟)')
    expect(classicalDuration(HALF_SHICHEN_SEC)).toBe('半个时辰(1 小时)')
    expect(classicalDuration(SHICHEN_SEC)).toBe('一个时辰(2 小时)')
    expect(classicalDuration(5400)).toBe('六刻(90 分钟)')
    expect(classicalDuration(10800)).toBe('一个半时辰(3 小时)')
    expect(classicalDuration(14400)).toBe('两个时辰(4 小时)')
    expect(classicalDuration(18000)).toBe('两个半时辰(5 小时)')
    expect(classicalDuration(21600)).toBe('三个时辰(6 小时)')
    expect(classicalDuration(540)).toBe('将近一刻(9 分钟)')
    expect(classicalDuration(1080)).toBe('一刻有余(18 分钟)')
  })
})

describe('古语时制对账 · 丹药文案与数据', () => {
  it('每一味丹:凡文案里写了古语或现代时长,折出秒必须等于它的真实时长', () => {
    const rows: string[] = []
    const violations: string[] = []
    let checked = 0
    for (const def of PILLS) {
      const claimed = parseClassicalDuration(def.desc)
      const modern = modernSecondsIn(def.desc)
      const hasDurationMechanism = pillActualSec(def) !== null
      if (!hasDurationMechanism && claimed === null && modern === null) continue
      checked += 1
      const actual = pillActualSec(def)
      const v = pillDurationViolation(def)
      if (v) violations.push(v)
      rows.push(
        `${def.id} ${def.name}:古语 ${claimed ? `${claimed.sec}s${claimed.exact ? '' : '(约)'}` : '-'} · 现代 ${modern ?? '-'}s · 实际 ${actual ?? '-'}s`
      )
    }
    console.log(`\n  丹药文案对账(共 ${checked} 味带时长机制/文案):`)
    for (const r of rows) console.log('    ' + r)
    expect(checked, '带时长的丹连一个都没扫到 —— 判据形同虚设').toBeGreaterThan(5)
    expect(violations, '以下丹药的古语/现代时长与机制对不上(数值改了没改文案?)').toEqual([])
  })

  it('故障注入:故意把文案写错(古语与秒数对不上),判据一定抓得到', () => {
    // 「半个时辰(1 小时)」改成「一炷香(1 小时)」
    const taixu = PILLS.find((p) => p.id === 'p_taixu')!
    const tampered: PillDef = {
      ...taixu,
      desc: '丹成有太虚幻境相随,服之如闭关一炷香(1 小时)',
    }
    expect(pillDurationViolation(tampered), '篡改后的文案与实值不符却未被抓').not.toBeNull()
    const dhuan = PILLS.find((p) => p.id === 'p_dahuan')!
    const wrongValue: PillDef = { ...dhuan, instant: { ...dhuan.instant!, expSecs: 900 } }
    expect(pillDurationViolation(wrongValue), '改了数值没改文案却未被抓').not.toBeNull()
  })

  it('两不误的弦绷在两张表上:改 timeUnits 常量 → 上面「古今对照」先红;改数据不改文案 → 这一节先红', () => {
    // classicalDuration 的落点须以表常量为准
    for (const sec of [TEA_SEC, KE_SEC, INCENSE_SEC, HALF_SHICHEN_SEC, SHICHEN_SEC]) {
      const out = classicalDuration(sec)
      const claimed = parseClassicalDuration(out)
      expect(claimed?.sec, `${sec}s 的古今对照「${out}」必须能被同一把尺子折回`).toBe(sec)
      expect(modernSecondsIn(out), `${sec}s 的括号分钟折回来应等于它自己`).toBe(sec)
    }
  })
})

describe('古语时制对账 · 增益文案与数据', () => {
  it('凡 buff 说明里写了古语时长,也要与实际持续秒数一致', () => {
    let checked = 0
    for (const def of BUFFS) {
      const claimed = parseClassicalDuration(def.desc)
      if (claimed === null) continue
      checked += 1
      if (claimed.exact) {
        expect(claimed.sec, `${def.id} 的古语与实际时长不符(${def.desc} / ${def.durationSec}s)`).toBe(
          def.durationSec
        )
      } else {
        expect(
          Math.abs(claimed.sec - def.durationSec),
          `${def.id} 的「将近/有余」跑出了最近那一档`
        ).toBeLessThanOrEqual(KE_SEC)
      }
    }
    console.log(`  增益文案对账:${checked} 条含古语时制`)
  })

  /**
   * `cnNum` 只管 1..99,越过就拼出乱码 —— 但按当前口径**走不到**。
   *
   * 实测:`cnNum(100)` 给「十十」、`cnNum(1000)` 给「undefined十」。
   * 它只经 `countWord` 被 `classicalDuration` 用到,而后者收到的时序数
   * 全部来自固定表:最长 buff 10800s = 1.5 时辰、坊市刷新 7200s = 1 时辰,
   * 连「两个时辰」都是上限,离 99 差了五十倍。
   *
   * 钉住当下边界(UPPER = 99 仍正确、越界即为乱码)有两个用处:
   *   ① 若将来把某个时长拉到几十时辰,这条会先红,而不是界面先印出「undefined十」;
   *   ② 若有人给 cnNum 补了越界分支,这条也会红 —— 那时把上面两行断言换成新口径即可。
   *
   * 故障注入:把某个 buff 的 durationSec 改成 720000(100 时辰) → 本节红。
   */
  it('cnNum 的可用上界是 99:越界会拼出乱码,故时序数不得超过它', () => {
    expect(cnNum(99)).toBe('九十九')
    expect(cnNum(100)).toContain('十十')
    expect(cnNum(1000)).toContain('undefined')
    // 真实时序数(时辰/刻)离上界还有多远
    let maxCount = 0
    for (const def of BUFFS) {
      const n = Math.ceil(def.durationSec / SHICHEN_SEC)
      if (n > maxCount) maxCount = n
    }
    expect(maxCount, `最长 buff 折合 ${maxCount} 个时辰,已逼近 cnNum 的上界 99`).toBeLessThanOrEqual(99)
    console.log(`  cnNum 上界 99 · 当前最大时序数 ${maxCount}`)
  })
})
