/**
 * 自动重铸的结账提示。
 *
 * runAutoReforge 原先开头是 `if (!inst.value) return` —— 而 inst 本身就是
 * 「按 ui.equipDetailUid 查行囊」的结果。装备被分解/转移后 inst 已是 undefined,
 * 那次提前 return 让「未找到装备」这条提示永远走不到:玩家点确认没有任何反应,
 * 也收不到任何话。
 *
 * 现在改成按 equipDetailUid 取 uid,交给 core/reforge.autoReforge 结账
 * (它对查不到的 uid 会返回 stop='frozen'),再判是否已不在行囊。
 *
 * 该 composable 此前没有 spec。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useInventoryStore } from '@/stores/inventory'
import { useAutoReforge } from './useAutoReforge'

/** 造一件真能洗的装备丢进行囊,返回 uid */
function addReforgeable(uid = 'u_test'): string {
  const inv = useInventoryStore()
  inv.items = [
    {
      uid,
      templateId: 'w_zhuqing',
      tier: 3,
      quality: 'spirit',
      level: 1,
      locked: false,
      affixes: [
        { id: 'atk1', roll: 0.4 },
        { id: 'def1', roll: 0.4 }
      ]
    }
  ] as never
  return uid
}

describe('自动重铸 · 结账提示', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('没有打开任何装备时不炸、不弹提示', () => {
    const ui = useUiStore()
    ui.toasts.length = 0
    const a = useAutoReforge()
    expect(() => a.runAutoReforge()).not.toThrow()
    expect(ui.toasts.length, '没有目标装备时不该弹提示').toBe(0)
  })

  it('装备已不在行囊时明确提示「未找到装备」,而不是「无可重铸」', () => {
    const ui = useUiStore()
    ui.equipDetailUid = 'u_gone'
    ui.toasts.length = 0
    const a = useAutoReforge()
    // 必须先有目标:autoReforge 在「无目标」时直接返回 stop='budget',
    // 走不到 frozen 那条分支(那是对的 —— 没勾目标本就不该开洗)
    a.autoTargets.value = [{ affixId: 'atk1', minRoll: 0.5 }] as never
    a.runAutoReforge()
    const texts = ui.toasts.map(t => t.text)
    expect(texts.join('|'), '这条提示原先永远走不到').toContain('未找到装备')
  })

  it('装备还在但没勾目标时提示「无可重铸」,不误报未找到', () => {
    const uid = addReforgeable()
    const ui = useUiStore()
    ui.equipDetailUid = uid
    ui.toasts.length = 0
    useAutoReforge().runAutoReforge()
    const texts = ui.toasts.map(t => t.text)
    expect(texts.join('|'), '装备还在时不该说未找到').not.toContain('未找到装备')
  })

  it('两条提示互斥:同一状态下只会出其中一条', () => {
    const ui = useUiStore()
    ui.equipDetailUid = 'u_ghost'
    ui.toasts.length = 0
    const a = useAutoReforge()
    a.autoTargets.value = [{ affixId: 'atk1', minRoll: 0.5 }] as never
    a.runAutoReforge()
    const texts = ui.toasts.map(t => t.text).join('|')
    expect(texts).toContain('未找到装备')
    expect(texts, '不该同时报「无可重铸」').not.toContain('无可重铸')
  })
})
