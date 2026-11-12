import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '@/data/achievements'
import { COUNTER_DIRECTIONS } from '@/ui/achievementHint'
import { OFFLINE_BOSS_REWARD_MULT } from '@/data/constants'
import { offlineAgeNote, offlineArtifactNote, offlineAwayPhrase, offlineBossNoteText } from '@/ui/offlineText'

function src(from: string): string {
  return readFileSync(resolve(__dirname, from), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

describe('离线归来 ≠ 闭关', () => {
  it('卷轴时长写「此去」,封顶时交代结算口径,并披露离线 0.9 折扣', () => {
    // OFFLINE_EFFICIENCY=0.9:「离线可攒 X 时」是上限,账面按九成结算
    expect(offlineAwayPhrase('8小时')).toContain('此去 8小时')
    expect(offlineAwayPhrase('8小时')).toContain('90%')
    expect(offlineAwayPhrase('60小时', '8小时')).toContain('上限 8小时')
    expect(offlineAwayPhrase('60小时', '8小时')).toContain('90%')
    // 0.9 只削闲置积蓄(修炼/洞府),历练与镇压按全额
    expect(offlineAwayPhrase('8小时')).toContain('修炼')
    expect(offlineAwayPhrase('8小时')).not.toMatch(/离线按\s*9\d%/)
  })

  it('寿元说明不冒充闭关', () => {
    expect(offlineAgeNote(60)).toBe('寿元流逝 60 载')
    expect(offlineAgeNote(60)).not.toContain('闭关')
  })

  it('离线首领战果的收益折损带数字,不吞成无字的「折损」(示=算)', () => {
    const note = offlineBossNoteText('黑风老妖')
    expect(note).toContain('黑风老妖')
    expect(note).toContain(`×${Math.round(OFFLINE_BOSS_REWARD_MULT * 100)}%`)
    // 折损≠0.9 离线效率,两者都带数
    expect(note).not.toContain('闭关')
  })

  it('归来弹窗与离线结算源码不把离开写成闭关', () => {
    const dialog = src('../components/offline/OfflineRewardDialog.vue')
    expect(dialog, '弹窗时长应走 offlineAwayPhrase').toContain('offlineAwayPhrase')
    expect(dialog).not.toContain('闭关')
    expect(dialog, '际遇行应对上历练际遇,不另起「路遇际会」').toContain('途中际遇')
    const settle = src('../core/offline.ts')
    expect(settle).toContain('offlineAgeNote')
    expect(settle).not.toMatch(/闭关期间寿元/)
  })

  it('离线成就与方向不把领取归来收益写成闭关', () => {
    const off = ACHIEVEMENTS.filter(a => a.id.startsWith('a_off'))
    expect(off.length, '离线成就被删了,这条就空转').toBeGreaterThanOrEqual(2)
    for (const a of off) {
      expect(a.name, `${a.id} 名目仍写成闭关`).not.toContain('闭关')
      expect(a.desc).toContain('离线')
    }
    expect(COUNTER_DIRECTIONS.offlineClaims).toBe('离府归来')
    expect(COUNTER_DIRECTIONS.offlineClaims).not.toContain('闭关')
  })
})

/**
 * 归来卷轴的「分组标题」与「行标签」不许同字。
 *
 * 那三组的标题是「修行所得 / 家业收成 / 途中际遇」,行标签是更细的具体项。
 * 「途中际遇」这一组原先把行标签也写成「途中际遇」—— 同屏两行一字不差:
 *
 *     途 中 际 遇          ← 分组标题
 *       ⚔ 历练战斗  3 胜 / 5 战
 *       ★ 途中际遇  2 次     ← 行标签,与上面标题相同
 *       ✦ 回收化尘  1 件 · …
 *
 * 而「回收化尘」显然不是际遇,那个标题更说不通。
 *
 * 判据:从组件源码里抽出每个 `out.push({ label: '…', list })` 的组标题,
 * 与同一组内 `label: '…'` 的行标签比对,两组不许有交集。
 */
describe('归来卷轴 · 组标题不与行标签同字', () => {
  const SRC = readFileSync(new URL('../components/offline/OfflineRewardDialog.vue', import.meta.url), 'utf-8')

  it('三组标题与组内行标签无重复', () => {
    // 组标题:out.push({ label: 'X', list: 变量 })
    const groups = [...SRC.matchAll(/out\.push\(\{\s*label:\s*'([^']+)',\s*list:\s*(\w+)/g)]
    expect(groups.length, '一组都没抽到 —— 判据要跟着改名').toBeGreaterThanOrEqual(3)

    const bad: string[] = []
    for (const [, title, varName] of groups) {
      // 该组的行:往 <varName>.push 里写的 label
      const rows = [...SRC.matchAll(new RegExp(`${varName}!\\.push\\(\\{[^}]*label:\\s*'([^']+)'`, 'g'))]
        .concat([...SRC.matchAll(new RegExp(`${varName}\\.push\\(\\{[^}]*label:\\s*'([^']+)'`, 'g'))])
        .map(m => m[1]!)
      if (rows.includes(title!)) bad.push(`组「${title}」里有一行的标签与组标题同字`)
    }
    expect(bad, bad.join('; ')).toEqual([])
  })

  it('「途中际遇」那一组的行标签是短词,不是句子', () => {
    const m = /if \(s\.events > 0\) road\.push\(\{ icon: 'star', label: '([^']+)'/.exec(SRC)
    expect(m, '找不到际遇那一行 —— 判据要跟着改名').toBeTruthy()
    expect(m![1], '行标签该短(≤4 字),与「历练战斗」「回收化尘」并列').toMatch(/^[\u4e00-\u9fa5]{2,4}$/)
    expect(m![1], '又写回「途中际遇」,与分组标题同字').not.toBe('途中际遇')
  })
})

/**
 * 法宝拾得行的两种形态:单件只报名,重复件折成「名×N(悟道点 X)」。
 *
 * 这条此前没有判据 —— `offlineText.spec` 的七条都在验时长/口径/措辞,
 * 而这个函数是唯一带分支的(`count > 1`),改坏了不会有东西红:
 * 比如把 `e.count > 1` 写成 `>= 1`,单件也会带「×1」;
 * 或把悟道点折进去的那段删掉,重复件的补偿就无声消失。
 */
describe('离线法宝行 · 单件与重复件分写', () => {
  it('单件只报名,不带 ×1', () => {
    expect(offlineArtifactNote([{ name: '青玉葫芦', count: 1, wudao: 0 }])).toBe('拾得法宝 青玉葫芦')
  })

  it('重复件折成「名×N(悟道点 X)」', () => {
    expect(offlineArtifactNote([{ name: '青玉葫芦', count: 3, wudao: 45 }])).toBe(
      '拾得法宝 青玉葫芦×3(悟道点 45)'
    )
  })

  it('多件按入参顺序并列,不重排', () => {
    expect(
      offlineArtifactNote([
        { name: '甲', count: 1, wudao: 0 },
        { name: '乙', count: 2, wudao: 10 }
      ])
    ).toBe('拾得法宝 甲、乙×2(悟道点 10)')
  })
})
