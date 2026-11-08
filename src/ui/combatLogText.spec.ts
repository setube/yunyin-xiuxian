/**
 * 战报配色只有一份。
 *
 * `CombatPanel`(历练主战)与 `GauntletPanel`(天界演武)显示的是同一种战报条目 ——
 * 同一条「暴击」在两边必须是同一个颜色。这两处原先各写了一份一模一样的 10 键表,
 * 各写一份就意味着改一处、漏一处。
 *
 * 判据从源码读两处:不许再出现本地定义,必须都引用同一份 COMBAT_LOG_TONE。
 * 故障注入:把任一处改回本地常量,本条红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COMBAT_LOG_TONE } from './combatLogText'
import type { CombatLogEntry } from '@/types'

const read = (rel: string): string => readFileSync(resolve(__dirname, '../..', rel), 'utf-8')

const HOSTS = ['src/components/adventure/CombatPanel.vue', 'src/components/celestial/GauntletPanel.vue']

describe('战报配色 · 一份表两处共用', () => {
  it('表把战斗日志的十种条目都配到色了', () => {
    const kinds: CombatLogEntry['t'][] = ['atk', 'skill', 'crit', 'shield', 'heal', 'dodge', 'proc', 'info', 'win', 'lose']
    for (const k of kinds) {
      expect(COMBAT_LOG_TONE[k], `条目类型 ${k} 没有配字色`).toBeTruthy()
    }
    expect(Object.keys(COMBAT_LOG_TONE).sort(), '键集合该正好是那十种,不多不少').toEqual([...kinds].sort())
  })

  it('两处战报都引用同一份表,不再各自定义', () => {
    for (const host of HOSTS) {
      const src = read(host)
      expect(src, `${host} 该引用 COMBAT_LOG_TONE`).toContain('COMBAT_LOG_TONE')
      expect(src, `${host} 不该再本地定义一份 KIND_COLOR`).not.toMatch(/const KIND_COLOR/)
    }
  })

  it('两处的样式绑定都走这张表', () => {
    for (const host of HOSTS) {
      const src = read(host)
      expect(src, `${host} 的模板该按条目类型取色`).toMatch(/COMBAT_LOG_TONE\[/)
    }
  })
})
