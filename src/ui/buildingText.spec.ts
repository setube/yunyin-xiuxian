import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { REALMS } from '@/data/realms'
import { BUILDINGS } from '@/data/buildings'
import { buildingGateRealmName, buildingRealmGate } from './buildingText'

/** 境界闸的境名不复抄,unlockRealm 的名字就是 REALMS[unlockRealm].name */
describe('建筑境界闸文案 · buildingText', () => {
  it('读表取名:unlockRealm 即 REALMS 下标,一字不差', () => {
    for (const b of BUILDINGS) {
      expect(buildingGateRealmName(b.unlockRealm), `${b.id} 的境名应与 REALMS 对齐`).toBe(
        REALMS[b.unlockRealm]?.name ?? '更高'
      )
    }
  })

  it('「未至X境」句与闸名同源,全套建筑无越界', () => {
    for (const b of BUILDINGS) {
      const gate = buildingRealmGate(buildingGateRealmName(b.unlockRealm))
      expect(gate).toContain('难营此筑')
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
