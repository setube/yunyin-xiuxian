import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DAO_PATHS } from '@/data/endgame'
import { GONGFA_BRANCHES } from '@/data/gongfaBranches'
import { modsText } from '@/data/statNames'

describe('不可逆确认要看见真正规则', () => {
  it('定下道途时把 deepText 一并摆上,长生印不留在卡片背面', () => {
    const src = readFileSync(resolve(__dirname, '../views/CelestialView.vue'), 'utf8')
    expect(src).toContain('pendingDao.deepText')
    const longevity = DAO_PATHS.find(d => d.id === 'longevity')!
    expect(longevity.deepText.join('')).toContain('4%')
    expect(longevity.ruleText.join('')).not.toContain('4%')
  })

  it('功法择道确认写出词条,不只报名字', () => {
    const src = readFileSync(resolve(__dirname, '../components/cultivation/GongfaDialog.vue'), 'utf8')
    expect(src).toContain('modsText(gongfaBranchDef(branchConfirm)!.mods)')
    const branch = GONGFA_BRANCHES[0]!
    expect(modsText(branch.mods).length).toBeGreaterThan(0)
  })
})
