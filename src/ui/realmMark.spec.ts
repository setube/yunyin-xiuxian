/**
 * 秘境双轴形制:五处秘境在清单上只差名字与代价,而玩家要比较的是「能撑几层」与「值得走多远」。
 *
 * 四条判据:
 *   一 两轴共用同一把尺(五处秘境的最小与最大),任意两处可横向比。
 *   二 两根轴各说各的真话,不合成一根「险」—— 试过合成,
 *      结果是「受伤」一个量在冒充「凶险」,把归墟判得居中。
 *   三 两轴都取数据层原值,不折算;坏值夹进 0~1。
 *   四 界面真的接上了,且只给战利最丰的那一处多一层形制。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SECRET_REALMS } from '@/data/secretRealms'
import { gainOf, healPosOf, isTopGain, realmMark, realmMarks } from './realmMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const CARD = readFileSync(resolve(ROOT, 'src/components/adventure/SecretRealmCard.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/realmMark.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('秘境形制 · 一、两轴共用一把尺', () => {
  it('五处秘境都算得出来,且位置落在 0~1', () => {
    expect(realmMarks().length).toBe(SECRET_REALMS.length)
    for (const m of realmMarks()) {
      expect(m.heal).toBeGreaterThanOrEqual(0)
      expect(m.heal).toBeLessThanOrEqual(1)
      expect(m.gain).toBeGreaterThanOrEqual(0)
      expect(m.gain).toBeLessThanOrEqual(1)
    }
  })

  it('两轴各有一处顶到 0 与 1 —— 尺子的两端真实存在', () => {
    const heals = SECRET_REALMS.map(r => healPosOf(r))
    const gains = SECRET_REALMS.map(r => gainOf(r))
    expect(Math.min(...heals)).toBe(0)
    expect(Math.max(...heals)).toBe(1)
    expect(Math.min(...gains)).toBe(0)
    expect(Math.max(...gains)).toBe(1)
  })

  it('尺子由 SECRET_REALMS 现算,不写死区间', () => {
    expect(MODULE, '两端应由数据现算').toContain('Math.min(...heals)')
    expect(MODULE, '两端应由数据现算').toContain('Math.max(...rewards)')
  })
})

describe('秘境形制 · 二、两根轴各说各的真话', () => {
  it('回血轴随层间回血单调不减', () => {
    const byHeal = [...SECRET_REALMS].sort((a, b) => a.healBetweenPct - b.healBetweenPct)
    for (let i = 1; i < byHeal.length; i += 1) {
      expect(healPosOf(byHeal[i]!)).toBeGreaterThanOrEqual(healPosOf(byHeal[i - 1]!))
    }
    expect(healPosOf(byHeal[0]!), '倒扣那一处落在最左').toBe(0)
  })

  it('战利轴随战利倍率单调不减', () => {
    const byReward = [...SECRET_REALMS].sort((a, b) => a.rewardMult - b.rewardMult)
    for (let i = 1; i < byReward.length; i += 1) {
      expect(gainOf(byReward[i]!)).toBeGreaterThanOrEqual(gainOf(byReward[i - 1]!))
    }
  })

  it('不合成一根「险」—— 枯荣不是最凶的那处,归墟也不是居中', () => {
    // 合成版曾把枯荣(每层倒扣、治疗翻倍)判成最凶、归墟(敌体量+减伤+回合上限)居中
    expect(MODULE, '模块里不该再有单根「险」轴的归一').not.toContain('export function riskOf')
    expect(MODULE, '注释里应写明为什么没合成').toContain('受伤')
    // 归墟的战利是五处最高,这是它可以被横向比较的那件事实
    const guixu = SECRET_REALMS.find(r => r.id === 'sr_guixu')!
    expect(gainOf(guixu)).toBe(1)
  })
})

describe('秘境形制 · 三、原值照写,坏值不抛错', () => {
  it('说法照写原值,不折算', () => {
    const guixu = SECRET_REALMS.find(r => r.id === 'sr_guixu')!
    expect(realmMark(guixu).label).toContain(`×${guixu.rewardMult}`)
    expect(realmMark(guixu).label).toContain('层间少回')
  })

  it('倒扣的秘境说「每层倒扣」', () => {
    const kurong = SECRET_REALMS.find(r => r.id === 'sr_kurong')!
    expect(realmMark(kurong).label).toContain('每层倒扣')
  })

  it('坏值夹进 0,不抛错', () => {
    expect(healPosOf({ healBetweenPct: Number.NaN })).toBe(0)
    expect(gainOf({ rewardMult: Number.NaN })).toBe(0)
  })

  it('最丰档只有归墟一处', () => {
    const tops = SECRET_REALMS.filter(r => isTopGain(realmMark(r)))
    expect(tops.map(r => r.id)).toEqual(['sr_guixu'])
  })
})

describe('秘境形制 · 四、界面接上了', () => {
  it('清单卡挂双轴与说法', () => {
    expect(CARD, '应挂双轴').toContain('realm-axes')
    expect(CARD, '回血轴位置应现算').toContain('realmMark(r).heal * 100')
    expect(CARD, '战利轴位置应现算').toContain('realmMark(r).gain * 100')
    expect(CARD, '卡片应有可访问名').toContain('realmMark(r).label')
  })

  /**
   * 置灰时读屏也得听得出为什么进不去。
   *
   * 卡面上「灵石尚差 N」是可见的拒因文字,而可访问名原先只有形制读数
   * (秘境名 · 回血档 · 战利倍率)—— 读屏用户拿到的信息比眼睛少一条。
   * 全仓既有做法是「拒因走 aria-label / title」(见 EquipmentDetailDialog 的强 化钮),
   * 本条把这条规矩钉到秘境卡上。
   */
  it('拒因进 aria-label 与 title,不只画在屏幕上', () => {
    expect(CARD, '拒因要接进可访问名').toMatch(/:aria-label="entryBlockText\(r\) \?/)
    expect(CARD, '拒因也要给 title(悬停同样读得到)').toContain(':title="entryBlockText(r) ?? undefined"')
  })

  it('只给战利最丰的那一处多一层形制', () => {
    expect(CARD, '最丰应走 isTopGain').toContain('isTopGain(realmMark(r))')
    expect(block('.realm-top-gain'), '缺最丰样式').not.toBe('')
  })

  it('两轴色取既有 token,且不吃指针事件', () => {
    expect(block('.realm-axes'), '双轴须 pointer-events: none').toContain('pointer-events: none')
    const axes = CSS.slice(CSS.indexOf('.realm-axis--heal'), CSS.indexOf('/* 战利最丰'))
    for (const m of axes.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['jade', 'gold-ink'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})
