/**
 * 天道纪元的可见性契约(Phase 25 规则纪元的收尾)
 *
 * 规则纪元从 Phase 25 起就记在每一则道痕上(`mark.ruleset`),
 * 忆战时也会说一句「天道已变」——但**变了什么,玩家无处可查**:
 * `RULESET_CHANGELOG` 写好了,全项目没有一处读它。
 *
 * 这类缺陷的共性是:**数据记了,展示层没接**。所以本文件钉的不是
 * 弹窗长什么样,而是不变量:
 *
 *   ① 纪元的先后必须有确定口径(19.0 < 19.5 < 20.0);
 *   ② 旧纪道痕必须能问出「此后改了什么」;
 *   ③ 道痕列表必须真的接上这条口径,而不是只在注释里提过。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RULESET_CHANGELOG, RULESET_VERSION, isStaleRuleset, rulesetBefore, rulesetChangesSince } from '@/data/ruleset'

/** 去掉注释,免得注释里提一嘴就算「接上了」(与 veinVisibility 同法) */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * 道痕册拆出 components/celestial/MarksPanel.vue 后,判据随本体走。
 * 读宿主与子组件合扫:只查其中一个,拆分后的下一次改动就会假绿。
 */
const MARKS_VIEW_SRC = stripComments(
  readFileSync(resolve(__dirname, '../views/CelestialView.vue'), 'utf8') +
    readFileSync(resolve(__dirname, '../components/celestial/MarksPanel.vue'), 'utf8')
)

describe('规则纪元:纪元先后', () => {
  it('点号分段比较,19.0 < 19.5 < 20.0', () => {
    expect(rulesetBefore('19.0', '19.5')).toBe(true)
    expect(rulesetBefore('19.5', '20.0')).toBe(true)
    expect(rulesetBefore('20.0', '21.0')).toBe(true)
    expect(rulesetBefore('21.0', '25.0')).toBe(true)
  })

  it('同纪元不比自己小;补零不影响(25 == 25.0)', () => {
    expect(rulesetBefore('25.0', '25.0')).toBe(false)
    expect(rulesetBefore('25', '25.0')).toBe(false)
    expect(rulesetBefore('25.0', '25')).toBe(false)
  })
})

describe('规则纪元:旧痕问得出「此后改了什么」', () => {
  it('旧纪道痕:列出其后的每一次规则变更', () => {
    const since21 = rulesetChangesSince('21.0')
    expect(since21.length).toBeGreaterThan(0)
    expect(since21.map(c => c.version)).toEqual(['25.0'])
  })

  it('当纪战录:无事发生,不硬凑一条', () => {
    expect(rulesetChangesSince(RULESET_VERSION)).toEqual([])
  })

  it('无纪元的远古战录:不知道录于何时,就不装作知道', () => {
    expect(rulesetChangesSince(undefined)).toEqual([])
    expect(isStaleRuleset(undefined)).toBe(false)
  })

  it('isStaleRuleset:与当纪不同即为旧纪', () => {
    expect(isStaleRuleset(RULESET_VERSION)).toBe(false)
    expect(isStaleRuleset('21.0')).toBe(true)
  })
})

describe('规则纪元:数据自洽', () => {
  it('纪元清单按时间递增,不出现倒流', () => {
    for (let i = 1; i < RULESET_CHANGELOG.length; i += 1) {
      expect(
        rulesetBefore(RULESET_CHANGELOG[i - 1]!.version, RULESET_CHANGELOG[i]!.version),
        `${RULESET_CHANGELOG[i - 1]!.version} 应早于 ${RULESET_CHANGELOG[i]!.version}`
      ).toBe(true)
    }
  })

  it('当纪必须记在案 —— 否则玩家问「现在是什么规则」时无人可答', () => {
    expect(RULESET_CHANGELOG.some(c => c.version === RULESET_VERSION)).toBe(true)
  })

  it('每条变更都要有说明,不能只有版本号', () => {
    for (const c of RULESET_CHANGELOG) expect(c.note.trim().length, `${c.version} 缺说明`).toBeGreaterThan(0)
  })
})

describe('规则纪元:道痕列表真的接上了', () => {
  it('列表能标出旧纪,并能问出此后改了什么', () => {
    expect(MARKS_VIEW_SRC).toContain('isStaleRuleset(')
    expect(MARKS_VIEW_SRC).toContain('rulesetChangesSince(')
  })

  it('变更是从数据读的,不是在视图里手抄一份', () => {
    // 手抄的纪元号不会随 RULESET_VERSION 走:数据改了,界面就开始撒谎
    expect(MARKS_VIEW_SRC).toContain('RULESET_VERSION')
    for (const c of RULESET_CHANGELOG) {
      expect(MARKS_VIEW_SRC, `视图里手抄了纪元 ${c.version}`).not.toContain(`'${c.version}'`)
    }
  })
})
