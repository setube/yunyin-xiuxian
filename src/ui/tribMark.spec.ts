/**
 * 天劫劫印:五种劫型各有一枚单字印,而界面一处未用。
 *
 * 五种劫名都是两个字(雷鸣 / 逆流 / 裂魂 / 铁躯 / 重压),「这次是哪个劫」得逐字读;
 * 而解法完全不同 —— 雷鸣碾护盾、逆流压恢复、裂魂给爆发、铁躯碾护盾更狠、重压起手两道最重。
 * 带错装备进来,是这一趟最大的代价。数据里早备好 `seal`,style.css 的 seal-face
 * 注释里也点名了「劫印钮」,只是界面从未接上。
 *
 * 三条判据:
 *   一 五劫各一印,且印字互不相同(重了就等于两劫长得一样)
 *   二 字与名都转发自 data/tribulations,本模块不另立
 *   三 界面真的接上了(摘要卡与详情面板两处)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TRIBULATIONS } from '@/data/tribulations'
import { tribMark, tribMarkOf, tribMarks } from './tribMark'

const ROOT = resolve(__dirname, '../..')
const CARD = readFileSync(resolve(ROOT, 'src/components/cultivation/TribulationCard.vue'), 'utf-8')
const DETAIL = readFileSync(resolve(ROOT, 'src/components/cultivation/TribulationDetail.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/tribMark.ts'), 'utf-8')

describe('劫印 · 一、五劫各一印', () => {
  it('每一劫都取得到印字,且都是单字', () => {
    for (const t of TRIBULATIONS) {
      const mark = tribMark(t.id)
      expect(mark.seal, `${t.name} 缺印字`).toHaveLength(1)
      expect(mark.name, `${t.name} 缺劫名`).toBe(t.name)
    }
  })

  it('五枚印字互不相同 —— 重了就等于两劫长得一样', () => {
    const seals = tribMarks().map(m => m.mark.seal)
    expect(new Set(seals).size, `印字有重复:${seals.join(' / ')}`).toBe(seals.length)
  })

  it('印字与劫名的语义对得上(雷/流/魂/躯/压)', () => {
    expect(tribMark('thunder').seal).toBe('雷')
    expect(tribMark('counterflow').seal).toBe('流')
    expect(tribMark('soulrend').seal).toBe('魂')
    expect(tribMark('ironbody').seal).toBe('躯')
    expect(tribMark('heavyrush').seal).toBe('压')
  })
})

describe('劫印 · 二、字与名都转发自数据表', () => {
  it('与 data/tribulations 逐项一致,本模块不另抄一张表', () => {
    for (const t of TRIBULATIONS) {
      const mark = tribMarkOf(t)
      expect(mark.seal).toBe(t.seal)
      expect(mark.name).toBe(t.name)
      expect(mark.label).toBe(`${t.name}劫`)
    }
    // 出现「雷鸣: '雷'」这类映射就说明抄了一份
    expect(MODULE, '不该另立印字对照表').not.toMatch(/雷鸣\s*[:=]\s*['"]雷['"]/)
    expect(MODULE, '印字应读 TRIBULATIONS').toContain('TRIBULATIONS')
  })

  it('认不出劫型时给空印,不抛错也不画假的', () => {
    const unknown = tribMark(undefined)
    expect(unknown.seal, '取不到印字时调用点据此不画').toBe('')
    expect(unknown.name).toBe('')
    expect(() => tribMark('not-a-kind' as never)).not.toThrow()
  })
})

describe('劫印 · 三、界面两处都接上了', () => {
  it('摘要卡挂劫印,读屏说法带劫名', () => {
    expect(CARD, '摘要卡应挂劫印').toContain('mark.seal')
    expect(CARD, '劫印应读形制').toContain('tribMarkOf(')
    expect(CARD, '劫印应有读屏说法').toContain(':aria-label="mark.label"')
    // role="img" 不可去:ARIA 规定 generic 不接受可访问名
    expect(CARD, '劫印是单字,须按「一段有名字的图」暴露').toContain('role="img"')
  })

  it('详情面板同样标出是哪一劫', () => {
    expect(DETAIL, '详情面板应挂劫印').toContain('mark.seal')
    expect(DETAIL, '详情应读形制').toContain('tribMarkOf(')
  })

  it('劫印走 seal-face,不用 text-paper —— 夜主题会把 paper 翻成近黑', () => {
    for (const [name, src] of [['摘要卡', CARD], ['详情面板', DETAIL]] as const) {
      expect(src, `${name} 的印面文字应用 seal-face`).toContain('seal-face')
      expect(src, `${name} 不得用 text-paper 当印面字`).not.toMatch(/seal-face[^"]*text-paper|text-paper[^"]*seal-face/)
    }
  })
})
