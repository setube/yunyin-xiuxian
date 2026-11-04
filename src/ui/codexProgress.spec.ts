/**
 * 收藏册的进度条与未收录折叠。
 *
 * 两件事:
 *   一 成就页与成就分组都有进度条,收藏各类目却只有一行「已 X/Y」文字。
 *   二 未收录项一律画成「???」,而装备一册 288 条 —— 全铺开把整页撑成几屏虚框,
 *      屏幕里一条真信息也没有。
 *
 * 判据:
 *   一 done 与 entries 同源(收录深度 ≥1),不另存一份会分叉的数。
 *   二 进度条与文字读数同源 —— 条与「已 X/Y」不能各说各话。
 *   三 未收录只铺到 UNCOLLECTED_SHOWN 个,余下折成一行计数(与坊市寄卖同一套)。
 *   四 已收录项一个不少 —— 折叠只作用于虚框。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { branchCodex, equipCodex, materialCodex, pillCodex } from '@/ui/codex'

// 图鉴要读存档 store,先给一个空的 pinia
beforeEach(() => {
  setActivePinia(createPinia())
})

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/CollectionView.vue'), 'utf-8')

describe('收藏册 · 一、done 与 entries 同源', () => {
  it('四类图鉴都给出 done,且等于阶段 ≥1 的条数', () => {
    for (const [name, cat] of [
      ['装备', equipCodex()],
      ['丹方', pillCodex()],
      ['灵材', materialCodex()],
      ['悟道', branchCodex()]
    ] as const) {
      const expectDone = cat.entries.filter(e => e.stage >= 1).length
      expect(cat.done, `${name}的 done 与 entries 分叉了`).toBe(expectDone)
    }
  })

  it('done 不超出条目总数', () => {
    for (const cat of [equipCodex(), pillCodex(), materialCodex(), branchCodex()]) {
      expect(cat.done).toBeGreaterThanOrEqual(0)
      expect(cat.done).toBeLessThanOrEqual(cat.entries.length)
    }
  })
})

describe('收藏册 · 二、进度条与文字同源', () => {
  it('收藏各类目渲染 ProgressBar,值取自 cat.done / entries.length', () => {
    expect(VIEW, '收藏类目没有进度条').toContain('ProgressBar')
    expect(VIEW).toContain('cat.done / cat.entries.length')
  })

  it('条目为空时不除以零', () => {
    expect(VIEW, '空类目会算出 NaN').toContain('cat.entries.length > 0 ?')
  })
})

describe('收藏册 · 三、未收录折叠', () => {
  it('只铺 UNCOLLECTED_SHOWN 个虚框,余下折成计数', () => {
    expect(VIEW).toContain('UNCOLLECTED_SHOWN')
    expect(VIEW).toContain('uncollectedIndex(')
    expect(VIEW).toContain('hiddenUncollected(')
    expect(VIEW).toContain('另有 {{ hiddenUncollected(cat) }} 条未收录')
  })

  it('折叠只作用于未收录项 —— 已收的一个不少', () => {
    // 已收录那支是 v-if entry.stage >= 1,没有折叠条件
    expect(VIEW).toMatch(/v-if="entry\.stage >= 1"/)
    // 折叠用 v-else-if,与未收录那一支同一条
    expect(VIEW).toMatch(/v-else-if="uncollectedIndex\(cat, entry\.id\) < UNCOLLECTED_SHOWN"/)
  })

  it('隐藏数是「未收录总数 − 上限」,不会为负', () => {
    expect(VIEW).toMatch(/Math\.max\(0, total - UNCOLLECTED_SHOWN\)/)
  })
})
