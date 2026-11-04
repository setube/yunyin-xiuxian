/**
 * 名号形制。
 *
 * 名号页此前 29 顶名号长得一模一样:同一个圆圈,只换「佩 / 藏 / 未」一个字。
 * 而这 29 顶其实分成两类,数据里早就分好了:
 *   境界名号 21 顶 —— 由 a_rN 成就给出,每个大境界一顶,构成从炼气到道祖的梯子;
 *   事功名号  8 顶 —— 杀伐、丹道、强化、轮回等行为所成,与境界无关。
 *
 * 四条判据:
 *   一 分类从数据现算,不另立一份清单 —— 加一境、改界域分界,形制自动跟上。
 *   二 梯子的级数就是大境界总数,不多不少。
 *   三 事功名号不硬塞进梯子:它们与境界无关,强分档只会暗示一个不存在的次序。
 *   四 界面真的接上了,且界域刻度的段长按境界数分。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ACHIEVEMENTS } from '@/data/achievements'
import { REALMS, WORLDS } from '@/data/realms'
import { TITLES } from '@/data/titles'
import { realmTitleMajor, titleMark, worldSegs, TITLE_LADDER_STEPS } from './titleMark'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/TitlesView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

/** 境界成就给的 name→major */
const REALM_TITLE_IDS = ACHIEVEMENTS.filter(a => a.cond.type === 'realm' && a.reward?.titleId).map(
  a => a.reward!.titleId as string
)

describe('名号形制 · 一、分类从数据现算', () => {
  it('每个大境界正好一顶境界名号,不多不少', () => {
    expect(REALM_TITLE_IDS).toHaveLength(REALMS.length)
    expect(new Set(REALM_TITLE_IDS).size, '两境共用了同一顶名号').toBe(REALMS.length)
  })

  it('境界名号解出的级数与大境界序号一一对应', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.cond.type !== 'realm' || !a.reward?.titleId) continue
      expect(realmTitleMajor(a.reward.titleId), `「${a.reward.titleId}」的级数解错了`).toBe(a.cond.major)
    }
  })

  it('事功名号解不出级数 —— 它们本来就不在梯子上', () => {
    const realmSet = new Set(REALM_TITLE_IDS)
    const deeds = TITLES.filter(t => !realmSet.has(t.id))
    expect(deeds.length, '没有事功名号了,分类逻辑该重看').toBeGreaterThan(0)
    for (const t of deeds) expect(realmTitleMajor(t.id), `${t.name} 不该有级数`).toBeNull()
  })

  it('每顶名号都分得进两类之一,没有漏网的', () => {
    for (const t of TITLES) {
      const m = titleMark(t)
      expect(['realm', 'deed']).toContain(m.kind)
      expect(m.label.length).toBeGreaterThan(0)
    }
  })
})

describe('名号形制 · 二、梯子的级数就是大境界总数', () => {
  it('TITLE_LADDER_STEPS 与 REALMS 同源', () => {
    expect(TITLE_LADDER_STEPS).toBe(REALMS.length)
  })

  it('第 n 顶的级数就是 n,从 1 起,不跳号', () => {
    const steps = TITLES.map(t => titleMark(t))
      .filter(m => m.kind === 'realm')
      .map(m => m.step)
      .sort((a, b) => a - b)
    expect(steps).toEqual(Array.from({ length: REALMS.length }, (_, i) => i + 1))
  })

  it('每顶境界名号都归得进某个界域 —— 界域分界改了也不会漏', () => {
    for (const t of TITLES) {
      const m = titleMark(t)
      if (m.kind !== 'realm') continue
      expect(WORLDS.some(w => w.name === m.worldName), `${t.name} 没有归属界域`).toBe(true)
    }
  })
})

describe('名号形制 · 三、事功名号不硬塞进梯子', () => {
  it('事功名号的级数为 0、不给界域', () => {
    const deed = TITLES.find(t => titleMark(t).kind === 'deed')!
    const m = titleMark(deed)
    expect(m.step).toBe(0)
    expect(m.worldName).toBe('')
    expect(m.label).toBe('事功名号')
  })

  it('事功名号与境界名号的形制色不同源 —— 否则两类混在一起又读不出', () => {
    const realm = TITLES.find(t => titleMark(t).kind === 'realm')!
    const deed = TITLES.find(t => titleMark(t).kind === 'deed')!
    expect(titleMark(realm).tone).not.toBe(titleMark(deed).tone)
  })
})

describe('名号形制 · 四、界域刻度与界面', () => {
  it('四段之和等于总级数,段长即该界域的境界数', () => {
    const segs = worldSegs(0)
    expect(segs.map(s => s.span).reduce((a, b) => a + b, 0)).toBe(TITLE_LADDER_STEPS)
    for (const w of WORLDS) {
      expect(segs.find(s => s.id === w.id)?.span).toBe(w.end - w.start + 1)
    }
  })

  it('给定级数时,只有它所在的那一段标为「在这里」', () => {
    // 第 3 境落在人间界;第 9 境是飞升后的仙界
    expect(worldSegs(2).filter(s => s.here).map(s => s.id)).toEqual(['mortal'])
    expect(worldSegs(9).filter(s => s.here).map(s => s.id)).toEqual(['immortal'])
    expect(worldSegs(18).filter(s => s.here).map(s => s.id)).toEqual(['chaos'])
  })

  it('没佩名号时不标任何一段 —— 「你在这里」不成立', () => {
    expect(worldSegs(null).every(s => !s.here)).toBe(true)
  })

  it('名号页接上了梯子与印面', () => {
    expect(VIEW, '名号页没有接 titleMark').toContain('titleMark(')
    expect(VIEW, '名号页没有渲染界域刻度').toContain('title-ladder-seg')
    expect(VIEW, '名号页没有区分两类').toContain("row.mark.kind === 'realm'")
  })

  it('刻度与印面的 CSS 存在,且形制层不吃指针事件', () => {
    expect(block('.title-ladder')).toContain('pointer-events: none')
    expect(block('.title-ladder-seg')).toContain('flex-basis: 0')
    expect(block('.title-ladder-seg.is-here')).toBeTruthy()
  })

  it('形制只取既有语义 token', () => {
    const from = CSS.indexOf('.title-ladder')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})
