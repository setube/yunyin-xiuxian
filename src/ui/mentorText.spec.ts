import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MENTORS } from '@/data/mentors'
import { modsText } from '@/data/statNames'

describe('师承说明不承诺词条里没有的机制', () => {
  it('四门说明都不点名命中、控制、异兽', () => {
    for (const m of MENTORS) {
      expect(m.desc, m.name).not.toMatch(/命中|控制|异兽|单体爆发/)
      expect(modsText(m.mods).length, m.name).toBeGreaterThan(0)
    }
  })

  it('拜师按钮与已拜师弹窗都印 modsText,不再拼裸数字', () => {
    // 师承弹窗拆出后判据随本体走
    const view = readFileSync(new URL('../components/character/MentorDialog.vue', import.meta.url), 'utf8')
    expect(view).toContain('modsText(m!.mods)')
    expect(view).toContain('modsText(mentorVer.mentor.mods)')
    expect(view).not.toContain('Object.values(mentorVer.mentor')
  })
})
