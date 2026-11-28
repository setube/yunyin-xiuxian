/**
 * 收藏册 id 白名单。
 *
 * `CODEX_IDS` 是一张防止坏档把「表外 id」塞进收藏册的最后防线 ——
 * 写入侧 `collect(category, id)` 的 id 全来自数据表,表外只可能在坏档里出现;
 * 而收藏册每一处展示都是拿表逐条比对,表外 id **既不显示也不计数**,
 * 唯一作用是把存档撑大(实测十万条野 id:存档涨到 1.29MB,那一页一个字都不多出来)。
 *
 * 这个文件此前没有任何 spec 引用。它坏掉不会崩,只会让防线悄悄失效:
 *   · 某个类目从 CODEX_IDS 里漏掉 → 该类目的野 id 全部放行
 *   · 源数据表里出现重复 id → Set 静默去重,「已收 N」少算
 *   · 某个类目的 id 全是空串 → filter 放行一切
 *
 * 判据三条:键集合与 `CollectionCategory` 完全一致 / 每类非空 / 无重复与空 id。
 */
import { describe, expect, it } from 'vitest'
import { CODEX_IDS } from './codexIds'
import { EQUIPMENT_TEMPLATES } from './equipment'
import { GONGFA } from './gongfa'
import { PILLS } from './pills'
import { ARTIFACTS } from './artifacts'
import { PETS } from './pets'
import { EVENTS } from './events'
import { TALENTS } from './talents'
import { DAOLU } from './daolu'
import type { CollectionCategory } from '@/stores/quests'

/** 与 quests.sanitize 里那八行 dedupe 一一对应;新增类目时这里会先红 */
const CATEGORIES: CollectionCategory[] = ['equip', 'gongfa', 'pill', 'artifact', 'pet', 'event', 'talent', 'daolu']

const SOURCES: Record<CollectionCategory, { id: string }[]> = {
  equip: EQUIPMENT_TEMPLATES,
  gongfa: GONGFA,
  pill: PILLS,
  artifact: ARTIFACTS,
  pet: PETS,
  event: EVENTS,
  talent: TALENTS,
  daolu: DAOLU
}

describe('收藏册 id 白名单', () => {
  it('类目集合与 CollectionCategory 一致(漏一类即防线失效)', () => {
    expect(Object.keys(CODEX_IDS).sort(), 'CODEX_IDS 的键与类目清单对不上').toEqual([...CATEGORIES].sort())
  })

  it('每个类目都非空(空集会把该类的野 id 全部放行)', () => {
    const empty = CATEGORIES.filter(c => CODEX_IDS[c].size === 0)
    expect(empty, '这些类目的白名单是空的 —— 该类野 id 会全数放行').toEqual([])
  })

  it('白名单里的 id 与源数据表逐条对应,且没有空 id', () => {
    for (const cat of CATEGORIES) {
      const src = SOURCES[cat]
      const ids = src.map(d => d.id)
      // 空 id 进了白名单,坏档里任何 `''` 都会被当作合法收藏
      expect(ids.filter(id => id === ''), `${cat} 里有空 id`).toEqual([])
      // 重复会被 Set 静默去重,「已收 N」比数据表条数少
      expect(new Set(ids).size, `${cat} 的源表有重复 id`).toBe(ids.length)
      // 白名单规模须与源表一致 —— 少一条就是漏放
      expect(CODEX_IDS[cat].size, `${cat} 白名单 ${CODEX_IDS[cat].size} 条,源表 ${ids.length} 条`).toBe(ids.length)
    }
  })
})
