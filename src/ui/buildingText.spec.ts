import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { REALMS } from '@/data/realms'
import { BUILDINGS } from '@/data/buildings'
import { buildingBatchDoneToast, buildingGateRealmName, buildingRealmGate } from './buildingText'

/** 境界闸境名 = REALMS[unlockRealm].name,不复抄 */
describe('建筑境界闸文案 · buildingText', () => {
  it('读表取名:unlockRealm 即 REALMS 下标,一字不差', () => {
    for (const b of BUILDINGS) {
      expect(buildingGateRealmName(b.unlockRealm), `${b.id} 的境名应与 REALMS 对齐`).toBe(
        REALMS[b.unlockRealm]?.name ?? '更高'
      )
    }
  })

  it('「需X境」与闸名同源,全套建筑无越界', () => {
    for (const b of BUILDINGS) {
      const gate = buildingRealmGate(buildingGateRealmName(b.unlockRealm))
      expect(gate).toBe(`需${buildingGateRealmName(b.unlockRealm)}境`)
      expect(gate, `${b.id} 的闸句应带着境名`).toContain(buildingGateRealmName(b.unlockRealm))
    }
  })

  it('卡片与服务不再各自手抄一份境界名表', () => {
    const card = readFileSync(resolve(__dirname, '../components/dongfu/BuildingCard.vue'), 'utf8')
    const service = readFileSync(resolve(__dirname, '../core/buildingService.ts'), 'utf8')
    expect(card).toContain('buildingGateRealmName(')
    expect(service).toContain('buildingGateRealmName(')
    expect(card, '卡片不应再内联境界名表').not.toMatch(/\[['"]炼气['"],\s*['"]筑基['"],\s*['"]金丹['"]\]/)
    expect(service, '服务不应再内联境界名表').not.toMatch(/\[['"]炼气['"],\s*['"]筑基['"],\s*['"]金丹['"]\]/)
  })
})

/**
 * 连升提示的静态汉字数守着规范的 12 字上限。
 *
 * 原句「「X」连升 N 级至 M 级 · 共耗灵石 S · 玄铁 O 块」静态 15 字 ——
 * 而单次完成那句只有 6 字,同族相差一倍多。数值与单位照旧一个不少,
 * 去掉的只是「共耗」「块」这类可省的词。
 *
 * 故障注入:把任一处省掉的词加回去,本条红。
 */
describe('建筑连升提示 · 长度', () => {
  const longestName = [...BUILDINGS].sort((a, b) => b.name.length - a.name.length)[0]!.name

  it('用最长建筑名量,静态汉字 ≤ 12', () => {
    const text = buildingBatchDoneToast(longestName, 3, 5, '1.2万', 30)
    const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    expect(cn, `「${text}」静态 ${cn} 字,超过 12 字上限`).toBeLessThanOrEqual(12)
  })

  it('数值与单位一个不少', () => {
    const text = buildingBatchDoneToast('丹房', 3, 5, '1.2万', 30)
    for (const part of ['丹房', '3', '5', '1.2万', '30']) {
      expect(text, `连升提示漏了「${part}」`).toContain(part)
    }
  })
})
