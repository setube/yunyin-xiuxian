/**
 * 历世履历 / 历世同行 / 本世命题的坏条目修形 —— 轮回页与角色页的白屏面。
 *
 * 这三栏此前只做了 `Array.isArray` 就原样收下:
 *   - `lives` 里一条 `null` 会让「轮回录」的 `l.index` 当场抛错(整页白屏),
 *     而 `NaN` 会印成「第 NaN 世 · 寿 NaN 载」;
 *   - `bonds` 里一条 `null` 会让角色页「历世同行」读 `r.name` 抛错,
 *     野 `stage`/`ending` 则直接把英文原文印在中文界面里;
 *   - `vow` 里认不出的 `themeId` 会让 `vowProgress()` 恒返回 null ——
 *     界面写着「在途」,进度却永远不推进,下次兵解也不可能换题(题还在)。
 *
 * 判据按「界面会读到的那几处」钉死,而不是只断言 sanitize 不抛。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { ENDING_NAMES, STAGE_NAMES } from '@/data/daolu'

/** 轮回录里真正会被渲染的字段(见 views/LegacyView.vue 的 lifeRows) */
function renderLife(l: ReturnType<typeof usePlayerStore>['reincarnation']['lives'][number]): void {
  expect(Number.isFinite(l.index), '第 N 世').toBe(true)
  expect(typeof l.realmLabel, '境界名').toBe('string')
  expect(Number.isFinite(l.age), '寿 N 载').toBe(true)
  expect(Number.isFinite(l.insight), '宿慧 +N').toBe(true)
  expect(['done', 'unfinished', 'broken', null]).toContain(l.themeResult)
}

/** 角色页「历世同行」直接拿这两个枚举当下标查中文名 */
function renderBond(r: ReturnType<typeof usePlayerStore>['reincarnation']['bonds'][number]): void {
  expect(typeof r.name).toBe('string')
  expect(STAGE_NAMES[r.stage], '阶位必须查得到中文').toBeTruthy()
  expect(ENDING_NAMES[r.ending], '结局必须查得到中文').toBeTruthy()
}

describe('轮回履历 bad-shape · 读档逐条修形', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lives 里的 null / 非对象被剔掉,NaN 字段收口为 0', () => {
    const p = usePlayerStore()
    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        lives: [
          null,
          'x',
          { index: Number.NaN, major: Number.NaN, realmLabel: 42, age: Number.NaN, insight: Number.NaN, at: Number.NaN },
          { index: -3, major: -1, realmLabel: '金丹', age: 320, themeResult: 'done', insight: 12, at: 99 }
        ]
      }
    } as never)
    p.sanitize()

    expect(p.reincarnation.lives, '坏条目剔除,好的那条留下').toHaveLength(2)
    const [bad, good] = p.reincarnation.lives
    expect(bad!.index, '第 NaN 世没有来路,回落第 0 世').toBe(0)
    expect(bad!.major).toBe(0)
    expect(bad!.realmLabel, '非字符串境界名回落空串,而不是 42').toBe('')
    expect(bad!.age).toBe(0)
    expect(bad!.insight).toBe(0)
    expect(bad!.at).toBe(0)
    expect(good!.index, '负世数同样没有来路').toBe(0)
    expect(good!.major).toBe(0)
    expect(good!.realmLabel).toBe('金丹')
    expect(good!.age).toBe(320)
    expect(good!.insight).toBe(12)
    expect(good!.themeResult, '认得的命题结局原样保留').toBe('done')
    for (const l of p.reincarnation.lives) renderLife(l)
  })

  it('lives 里认不出的命题/逆旅契 id 回落 null,认得的长相不变', () => {
    const p = usePlayerStore()
    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        lives: [
          {
            index: 1,
            major: 3,
            realmLabel: '化神',
            age: 480,
            themeId: 'lt_danfang',
            themeResult: 'unfinished',
            insight: 20,
            trialId: 'tr_gu',
            at: 7
          },
          {
            index: 2,
            major: 4,
            realmLabel: '炼虚',
            age: 520,
            themeId: 'lt_ghost',
            themeResult: 'ghost',
            insight: 30,
            trialId: 'tr_ghost',
            at: 8
          }
        ]
      }
    } as never)
    p.sanitize()

    const [first, second] = p.reincarnation.lives
    expect(first!.themeId).toBe('lt_danfang')
    expect(first!.trialId).toBe('tr_gu')
    expect(second!.themeId, '认不出的题等同「本世未立题」').toBeNull()
    expect(second!.trialId, '认不出的契等同「本世未签约」').toBeNull()
    expect(second!.themeResult, '野结局不落地,由界面按「未竟」兜底').toBeNull()
    for (const l of p.reincarnation.lives) renderLife(l)
  })

  it('lives 里的本世同行关系也逐字段修形', () => {
    const p = usePlayerStore()
    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        lives: [
          {
            index: 1,
            major: 2,
            realmLabel: '元婴',
            age: 300,
            themeId: null,
            themeResult: null,
            insight: 9,
            bond: { name: '苏姑娘', stage: 'daolv', ending: 'perished' },
            at: 3
          },
          {
            index: 2,
            major: 2,
            realmLabel: '元婴',
            age: 310,
            themeId: null,
            themeResult: null,
            insight: 9,
            bond: { name: 7, stage: 'ghost', ending: 'ghost' },
            at: 4
          }
        ]
      }
    } as never)
    p.sanitize()

    const [first, second] = p.reincarnation.lives
    expect(first!.bond).toEqual({ name: '苏姑娘', stage: 'daolv', ending: 'perished' })
    expect(second!.bond?.name).toBe('')
    expect(second!.bond?.stage).toBe('')
    expect(second!.bond?.ending).toBe('')
  })

  it('bonds 里的 null 被剔掉,野 stage/ending 回落「素昧平生 / 缘悭一面」', () => {
    const p = usePlayerStore()
    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        bonds: [
          null,
          { daoluId: 'd1', name: '苏姑娘', stage: 'daolv', ending: 'accompanied', shared: 5 },
          { daoluId: 'd2', name: '林道友', stage: 'ghost', ending: 'ghost', shared: Number.NaN }
        ]
      }
    } as never)
    p.sanitize()

    expect(p.reincarnation.bonds, '坏条目剔除,好的那两条留下').toHaveLength(2)
    const [good, wild] = p.reincarnation.bonds
    expect(good!.stage).toBe('daolv')
    expect(good!.ending).toBe('accompanied')
    expect(good!.shared).toBe(5)
    expect(wild!.name, '名字仍在:这段同行确实发生过').toBe('林道友')
    expect(wild!.stage).toBe('none')
    expect(wild!.ending).toBe('missed')
    expect(wild!.shared, '坏共历次数归 0').toBe(0)
    for (const r of p.reincarnation.bonds) renderBond(r)
  })

  it('vow 认不出的 themeId 整块作废,合法命题原样保留', () => {
    const p = usePlayerStore()
    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        vow: { themeId: 'lt_ghost', at: 1, base: {}, baseBranches: 0, baseAvenged: 0, broken: false }
      }
    } as never)
    p.sanitize()
    expect(p.reincarnation.vow, '空题会让进度恒 null 且不可再择,整块清掉').toBeNull()

    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        vow: {
          themeId: 'lt_danfang',
          at: 12,
          base: { kills: 40, junk: Number.NaN },
          baseBranches: 2,
          baseAvenged: 1,
          broken: 'yes'
        }
      }
    } as never)
    p.sanitize()
    expect(p.reincarnation.vow?.themeId).toBe('lt_danfang')
    expect(p.reincarnation.vow?.at).toBe(12)
    expect(p.reincarnation.vow?.base).toEqual({ kills: 40 })
    expect(p.reincarnation.vow?.baseBranches).toBe(2)
    expect(p.reincarnation.vow?.baseAvenged).toBe(1)
    expect(p.reincarnation.vow?.broken, '非字面 true 不算已破').toBe(false)

    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        vow: { ...p.reincarnation.vow!, broken: true }
      }
    } as never)
    p.sanitize()
    expect(p.reincarnation.vow?.broken, '真的破题要留住,否则破题状态被洗白').toBe(true)
  })

  it('vow 为非对象/数组时作废', () => {
    const p = usePlayerStore()
    for (const bad of ['x', 3, [], null]) {
      p.$patch({ reincarnation: { ...p.reincarnation, vow: bad } } as never)
      p.sanitize()
      expect(p.reincarnation.vow, `${JSON.stringify(bad)} 不是一份命题`).toBeNull()
    }
  })
})
