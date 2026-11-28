/**
 * 内容条目的名字与描述不许为空。
 *
 * 覆盖丹药 / 装备 / 功法 / 法宝四张表的手写文案(条数以数据表为准,
 * 不在此处复述 —— 写死的数字会随数据扩充而过期,而它描述的正是这条守卫的作用范围)。
 * 详情页把 desc 直接铺在正文里(`<p>{{ currentPill.def.desc }}</p>` 之类),
 * 空串会让那一整块变成空白 —— 玩家看到的是「有这件东西,但不知道为什么有用」。
 *
 * 此前只有 statNames.spec 钉了「名字非空白」,这几个内容表的 desc 没有统一守卫。
 * 现状全部有字,这条守卫是给后续新增条目兜底。
 */
import { describe, expect, it } from 'vitest'
import { PILLS } from '@/data/pills'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { GONGFA } from '@/data/gongfa'
import { ARTIFACTS } from '@/data/artifacts'

interface Textual {
  id: string
  name: string
  desc?: string
}

const GROUPS: [string, readonly Textual[]][] = [
  ['丹药', PILLS as unknown as readonly Textual[]],
  ['装备', EQUIPMENT_TEMPLATES as unknown as readonly Textual[]],
  ['功法', GONGFA as unknown as readonly Textual[]],
  ['法宝', ARTIFACTS as unknown as readonly Textual[]]
]

describe('内容文案 · 名字与描述非空', () => {
  for (const [label, list] of GROUPS) {
    it(`${label}:${list.length} 条都写了名字`, () => {
      const blank = list.filter(x => !x.name || x.name.trim().length === 0).map(x => x.id)
      expect(blank, `${label}里有条目没写名字`).toEqual([])
    })

    it(`${label}:${list.length} 条都写了描述(空 desc 会让详情页那块空白)`, () => {
      const blank = list.filter(x => !x.desc || x.desc.trim().length === 0).map(x => x.id)
      expect(blank, `${label}里有条目没写描述`).toEqual([])
    })
  }

  it('四张表都有内容(防止 import 拿空数组后整组用例空转)', () => {
    for (const [label, list] of GROUPS) {
      expect(list.length, `${label}表是空的,上面几条会假绿`).toBeGreaterThan(0)
    }
  })

  it('id 在各自表内唯一(重复 id 会让详情页取错条目)', () => {
    for (const [label, list] of GROUPS) {
      const ids = list.map(x => x.id)
      expect(new Set(ids).size, `${label}表里有重复 id`).toBe(ids.length)
    }
  })
})
