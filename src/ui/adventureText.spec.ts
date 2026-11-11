import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { EXPLORE_BATTLE_INTERVAL, EXPLORE_MODES } from '@/data/constants'
import { cnNumber } from '@/utils/format'
import { PETS } from '@/data/pets'
import { exploreBattleGapSec, exploreDurationSec, exploreRewardMult } from '@/core/exploration'
import { personalityEffects } from '@/core/petPersonality'
import {
  departButtonText,
  exploreModeIds,
  exploreModeRiskLabel,
  exploreModeSummaryLine,
  petTraitTripLine,
  sessionRecordText
} from './adventureText'

describe('出发按钮与结算同一套数', () => {
  it('行程按灵兽之性折算,与 startExploration 同一公式', () => {
    expect(exploreDurationSec('normal', null)).toBe(EXPLORE_MODES.normal.durationSec)
    const seen = new Set<string>()
    for (const pet of PETS) {
      if (seen.has(pet.personality)) continue
      seen.add(pet.personality)
      const mult = personalityEffects(pet.id).exploreDurMult
      expect(exploreDurationSec('deep', pet.id)).toBe(Math.round(EXPLORE_MODES.deep.durationSec * mult))
    }
    expect(seen.size).toBe(4)
  })

  it('遇敌间隔只看历练遇敌,收益无事件时就是档位', () => {
    expect(exploreBattleGapSec(0)).toBe(EXPLORE_BATTLE_INTERVAL)
    expect(exploreBattleGapSec(0.3)).toBeCloseTo(EXPLORE_BATTLE_INTERVAL / 1.3, 9)
    // 负加速:间隔保底为原始档,不得为负/无限
    expect(exploreBattleGapSec(-8)).toBe(EXPLORE_BATTLE_INTERVAL)
    expect(exploreBattleGapSec(-8), '负加速不得给出负/无限间隔').toBeGreaterThan(0)
    expect(exploreRewardMult('risky', null)).toBe(EXPLORE_MODES.risky.rewardMult)
  })

  it('按钮文案带上四个结算数', () => {
    const line = departButtonText({ durationSec: 1800, rewardMult: 1.4, dangerMult: 1.45, battleGapSec: 12 })
    // 整分钟不写「0秒」:中文时长没有「30分0秒」这种说法(formatDuration 与 formatChoiceSpan 同一口径)
    expect(line).toContain('行程 30分')
    expect(line).toContain('收益 ×1.4')
    expect(line).toContain('遇险 ×1.45')
    expect(line).toContain('遇敌约 12秒')
  })

  it('出行弹窗的出发按钮不再手抄档位原时长', () => {
    const dialog = readFileSync(new URL('../components/adventure/ExploreModeDialog.vue', import.meta.url), 'utf8')
    // 钉「真拿它算并返回」:只查导入挡不住写死文案
    expect(dialog, '出发按钮文案要真从 departButtonText 来').toContain('return departButtonText({')
    expect(dialog, '时长要真从 exploreDurationSec 取').toContain('durationSec: exploreDurationSec(')
    expect(dialog, '遇险要真从 explorationFoeDanger 取').toContain('explorationFoeDanger({')
    expect(dialog).not.toContain('EXPLORE_MODES[m.id].durationSec')
    // 宿主只出开关,不许自算档位账
    const host = readFileSync(new URL('../views/AdventureView.vue', import.meta.url), 'utf8')
    expect(host, '宿主不该再自己算三档账').not.toContain('departButtonText')
  })

  /**
   * 超离线上限的档位标注须给「洞府几级可结满」,等级从 OFFLINE_CAP_HOURS 现算,不许手写。
   * 故障注入:把 needLv 改成写死 2,本条红。
   */
  it('超上限标注连「洞府几级可结满」一起给,且等级从上限表现算', () => {
    const dialog = readFileSync(new URL('../components/adventure/ExploreModeDialog.vue', import.meta.url), 'utf8')
    expect(dialog, '超上限标注要指出解法').toContain('洞府 ${needLv} 级可结满')
    expect(dialog, '可结满等级要从 OFFLINE_CAP_HOURS 现算').toContain('OFFLINE_CAP_HOURS.findIndex(')
    expect(dialog, '上限秒数不许另写一套 3600 口径').not.toMatch(/OFFLINE_CAP_HOURS\[\w+\]\s*\*\s*60\b/)
  })

  it('灵兽之性那行:有数的给数(遇险/行程),没数的只定性(掉宝/护持),无伴则空', () => {
    for (const pet of PETS) {
      const eff = personalityEffects(pet.id)
      const line = petTraitTripLine(pet.name, eff)
      expect(line).toContain('之性')
      if (eff.dangerMult !== 1) expect(line).toContain('遇险 ×')
      if (eff.exploreDurMult !== 1) expect(line).toContain('行程 ×')
      if (eff.dropLuck !== 0) expect(line).toMatch(/掉宝/)
      if (eff.lossReduction > 0) expect(line).toContain('护持')
    }
    expect(petTraitTripLine('无', { exploreDurMult: 1, dangerMult: 1, dropLuck: 0, lossReduction: 0 })).toBe('')
  })

  it('出行弹窗摊开灵兽之性,不手抄「遇险 ×0.95」这类数', () => {
    const view = readFileSync(new URL('../components/adventure/ExploreModeDialog.vue', import.meta.url), 'utf8')
    expect(view, '灵兽那行要真调用同一份格式化').toContain('petTraitTripLine(')
    expect(view).not.toMatch(/遇险\s*×\s*0\.9\d/)
    expect(view).not.toMatch(/遇险\s*×\s*1\.1\d/)
  })

  it('战斗面板的连胜行读玩家连胜与奖励表,不手抄 3/5/10', () => {
    const view = readFileSync(new URL('../components/adventure/CombatPanel.vue', import.meta.url), 'utf8')
    expect(view).toContain('player.winStreak')
    expect(view).toContain('WIN_STREAK_REWARDS')
    // 下一档缺口由表现算,不许手写「距 5 连胜」
    expect(view).not.toMatch(/距\s*[3,5,10]\s*连胜/)
    expect(view).not.toMatch(/\{\{\s*10\s*\}\}/)
  })
})

describe('一趟历练的战绩 · 胜负两本账', () => {
  it('有败场时两本账都报 —— 「胜 2 场」分不出是两战全胜还是九战两胜', () => {
    expect(sessionRecordText({ wins: 2, losses: 0 })).toBe('胜 2 场')
    expect(sessionRecordText({ wins: 2, losses: 7 })).toBe('胜 2 场 · 负 7 场')
  })

  it('全败也说得出口(胜 0 场 · 负 N 场),不因为胜场是零就整行消失', () => {
    expect(sessionRecordText({ wins: 0, losses: 3 })).toBe('胜 0 场 · 负 3 场')
  })

  it('坏数不印成 NaN / 负数:非有限值与负数都按 0 收口', () => {
    expect(sessionRecordText({ wins: Number.NaN, losses: -4 })).toBe('胜 0 场')
    expect(sessionRecordText({ wins: 2.7, losses: 1.2 })).toBe('胜 2 场 · 负 1 场')
  })

  it('战斗面板与会话结算读同一份战绩文案,不各抄一遍格式', () => {
    const panel = readFileSync(
      new URL('../components/adventure/CombatPanel.vue', import.meta.url),
      'utf8'
    )
    const core = readFileSync(new URL('../core/exploration.ts', import.meta.url), 'utf8')
    expect(panel).toContain('sessionRecordText(')
    expect(core).toContain('sessionRecordText(')
    // 手写「胜 {{ session?.wins }} 场」会吞掉败场
    expect(panel).not.toMatch(/胜\s*\{\{\s*session\?\.wins/)
  })
})

describe('行程档位清单 · 表是唯一事实源', () => {
  it('档位清单从 EXPLORE_MODES 的键派生,不长第二份手写表', () => {
    expect(exploreModeIds).toEqual(Object.keys(EXPLORE_MODES))
    expect(exploreModeIds.length, '六档:0.5h → 16h').toBe(6)
  })

  it('每一档都有一句凶险形容词,没有静默留空的', () => {
    for (const id of exploreModeIds) {
      expect(exploreModeRiskLabel(id), `${id} 没有凶险形容词`).not.toBe('')
    }
    expect(exploreModeRiskLabel('normal')).toBe('安稳')
    expect(exploreModeRiskLabel('deepExpedition')).toBe('九死一生')
  })

  /** 故障注入:把弹窗里那行 v-for 改回一张手写 MODE_LIST,本条红 */
  it('出行弹窗的档位读派生清单,不再手写一份', () => {
    const dialog = readFileSync(new URL('../components/adventure/ExploreModeDialog.vue', import.meta.url), 'utf8')
    expect(dialog, '档位要由 exploreModeIds 派生').toContain('exploreModeIds')
    expect(dialog, '凶险形容词也要走单源').toContain('exploreModeRiskLabel')
    expect(dialog, '又手写了一份档位清单 —— 加档时界面会漏一档').not.toMatch(/id:\s*'normal'/)
    expect(dialog, '又手写了 risk 字面量表').not.toMatch(/risk:\s*'安稳'/)
  })

  /**
   * 直接调 exploreModeSummaryLine() 对数,期望值从 EXPLORE_MODES 现算(源码文本断言只证明插了值)。
   * 故障注入:把 exploreModeSummaryLine 的 span 改回写死 2.1,本条红。
   */
  it('那一行总账真的按 EXPLORE_MODES 现算,不是只插了值', () => {
    const dangers = exploreModeIds.map(id => EXPLORE_MODES[id].dangerMult)
    const expectSpan = Math.round((Math.max(...dangers) / Math.min(...dangers)) * 10) / 10
    expect(exploreModeSummaryLine()).toBe(`${cnNumber(exploreModeIds.length)}档行程 · 最凶较最稳凶 ${expectSpan} 倍`)
  })

  /** 防档位数写死:断言行里的档位数恰等于表长(EXPLORE_MODES 为 as const 字面表,不能临时加档) */
  it('行里的档位数恰等于表长,不是写死的', () => {
    const line = exploreModeSummaryLine()
    expect(line).toContain(`${cnNumber(exploreModeIds.length)}档行程`)
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      if (n === exploreModeIds.length) continue
      expect(line, `档位数被写死成 ${n} 了`).not.toContain(`${cnNumber(n)}档行程`)
    }
  })

  /** 圈出渲染那一行来查:只查整份模板,手打文案而插值记号留在别处也会绿 */
  it('那一行渲染的是单源函数,不是自己拼的文案', () => {
    const dialog = readFileSync(new URL('../components/adventure/ExploreModeDialog.vue', import.meta.url), 'utf8')
    const tpl = dialog.slice(0, dialog.indexOf('<script setup'))
    const row = tpl.split('\n').find(l => l.includes('modeSummary'))
    expect(row, '渲染那一行找不到 modeSummary —— 被改回手打文案了?').toBeTruthy()
    expect(row, '那一行必须直接渲染 modeSummary,自己再拼一段就又是第二份真相源').toBe('      {{ modeSummary }}')
    // 模板正文(去注释)不许手打档位数或倍数
    const body = tpl.replace(/<!--[\s\S]*?-->/g, '')
    expect(body, '又把档位数手打进了文案').not.toMatch(/[二两三四五六七八九十]档里敌人差/)
    expect(body, '又把凶险跨度手打进了文案').not.toMatch(/敌人差了\s*[0-9.]+\s*倍/)
  })

  /**
   * 遇敌间隔只有一个口径 exploreBattleGapSec;离线内联 EXPLORE_BATTLE_INTERVAL 会与界面「遇敌约…」分叉。
   * 故障注入:把 offline.ts 里那两处改回内联算式,本条红。
   */
  it('离线遭遇数与恢复后首战也读 exploreBattleGapSec,不再内联间隔公式', () => {
    const offline = readFileSync(new URL('../core/offline.ts', import.meta.url), 'utf8')
    expect(offline, '离线要读同一份遇敌间隔').toContain('exploreBattleGapSec')
    // 去掉注释再判:只判有没有再算一遍
    const code = offline.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code, '离线又内联了遇敌间隔 —— 调速公式一改,两边分叉').not.toMatch(/EXPLORE_BATTLE_INTERVAL/)
  })
})
