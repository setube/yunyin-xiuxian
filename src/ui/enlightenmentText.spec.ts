import { describe, expect, it } from 'vitest'
import { ENLIGHTENMENT_OPTIONS } from '@/data/earlyGame'
import { buffDef } from '@/data/buffs'
import { modsText } from '@/data/statNames'
import { enlightenmentOptionText } from './enlightenmentText'
import { readFileSync } from 'node:fs'

describe('悟道顿悟选项文案与 buff 同源', () => {
  it('每条带 buff 的选项都写出词条与时长,且不说「下次」', () => {
    for (const opt of ENLIGHTENMENT_OPTIONS) {
      const text = enlightenmentOptionText(opt)
      if (!opt.buffId) continue
      const buff = buffDef(opt.buffId)!
      expect(text, opt.label).toContain(modsText(buff.mods))
      expect(text, opt.label).toContain('持续')
      expect(text, opt.label).not.toContain('下次')
      expect(opt.duration, `${opt.label} 的 duration 与 buff 时长分叉`).toBe(buff.durationSec)
    }
  })

  it('悟透瓶颈标明大关不吃,灵机一动报出实发悟道点', () => {
    const bt = ENLIGHTENMENT_OPTIONS.find(o => o.buffId === 'enlighten_bt')!
    expect(enlightenmentOptionText(bt)).toContain('大关天劫不与')
    expect(enlightenmentOptionText(bt)).toContain('30分钟')
    const wudao = ENLIGHTENMENT_OPTIONS.find(o => o.reward?.type === 'wudao')!
    expect(enlightenmentOptionText(wudao)).toBe(`立即获得 ${wudao.reward!.value} 悟道点`)
  })

  it('弹窗与点选回执都走现算文案,不再直接印手写 desc', () => {
    const modal = readFileSync(new URL('../components/cultivation/EnlightenmentModal.vue', import.meta.url), 'utf8')
    const service = readFileSync(new URL('../core/earlyGameService.ts', import.meta.url), 'utf8')
    expect(modal).toContain('enlightenmentOptionText(')
    expect(modal).not.toContain('opt.desc')
    expect(service).toContain('enlightenmentOptionText(')
    expect(service).not.toContain('opt.desc')
  })
})
