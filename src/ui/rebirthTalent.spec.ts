import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { talentDef } from '@/data/talents'
import { modsText } from '@/data/statNames'

describe('轮回择姿', () => {
  it('三选一与自开天资都露出实际词条', () => {
    const src = readFileSync(resolve(__dirname, '../components/character/ReincarnationDialog.vue'), 'utf8')
    expect(src).toContain('modsText(talentDef(id)!.mods)')
    const jianxin = talentDef('t_jianxin')!
    expect(modsText(jianxin.mods)).toContain('攻击')
    expect(src).not.toMatch(/另有天资自开:[\s\S]{0,80}talentDef\(id\)\?\.name[\s\S]{0,40}<\/span>\s*<\/p>/)
  })
})
