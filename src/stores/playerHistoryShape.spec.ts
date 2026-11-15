/**
 * 历世履历 / 历世同行 / 本世命题的坏条目修形:判据按界面会读到的那几处钉死,不只断言 sanitize 不抛。
 * lives 一条 null 让轮回录 lifeRows 抛错(整页白屏),NaN 印成「第NaN世」「寿 NaN 载」;
 * bonds 一条 null 让「历世同行」读 r.name 抛错,野 stage/ending 查不到中文名;
 * vow 认不出的 themeId 让 vowProgress() 恒返回 null,命题永不得成。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { ENDING_NAMES, STAGE_NAMES } from '@/data/daolu'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** 轮回录会渲染的字段(见 views/LegacyView.vue 的 lifeRows) */
function renderLife(l: ReturnType<typeof usePlayerStore>['reincarnation']['lives'][number]): void {
  expect(Number.isFinite(l.index), '第 N 世').toBe(true)
  expect(typeof l.realmLabel, '境界名').toBe('string')
  expect(Number.isFinite(l.age), '寿 N 载').toBe(true)
  expect(Number.isFinite(l.insight), '宿慧 +N').toBe(true)
  expect(['done', 'unfinished', 'broken', null]).toContain(l.themeResult)
}

/** 角色页「历世同行」拿这两个枚举当下标查中文名 */
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

/**
 * 轮回录只渲最近若干世 —— 数据不动,只在渲染层截。
 *
 * `reincarnation.lives` 只增不减(每次转世追加一条),而 `LegacyView` 的 `lifeRows`
 * 是对全量 `v-for` 逐条渲。坏档塞 5000 条就渲 5000 行。
 * **不能截数据**:`reincarnation.ts` 读全量历史判「哪些命格已用过」,截掉会改变玩法。
 *
 * 故障注入:删掉 LegacyView 里 `.slice(0, LIFE_ROWS_SHOWN)` → 本条红。
 */
describe('轮回录 · 渲染条数封顶', () => {
  it('lifeRows 有截断,且数据本身不截', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/LegacyView.vue'), 'utf8')
    expect(src, 'lifeRows 没截断 —— 坏档 5000 条就渲 5000 行').toMatch(
      /\[\.\.\.player\.reincarnation\.lives\][\s\S]{0,200}\.slice\(0, LIFE_ROWS_SHOWN\)/
    )

    // 数据侧不该被截:`sanitize` 后条数应与输入一致
    const player = usePlayerStore()
    player.initCharacter('探针', { roots: [] } as never)
    player.reincarnation = {
      ...player.reincarnation,
      lives: Array.from({ length: 500 }, (_, i) => ({
        index: i,
        major: 5,
        realmLabel: '金丹',
        age: 100,
        themeId: null,
        themeResult: null,
        bond: null,
        insight: 0
      }))
    } as never
    player.sanitize()
    expect(player.reincarnation.lives.length, '数据被截了 —— 会改变「命格用过没用过」的判定').toBe(500)
  })
})

/**
 * 履历三个裸插值字段要封顶。
 *
 * `LegacyView` 的履历行逐条印 `寿 {{ l.age }} 载` / `宿慧 +{{ l.insight }}` /
 * `{{ l.realmLabel }}` —— 全是裸插值。原先 `sanitizeLives` 只给了下限
 * `Math.max(0, ...)`,上限一个都没有:坏档写 `age: 1e300` 会印成「寿 1e+300 载」,
 * `realmLabel` 塞十万字符会把那一行撑到不能看。
 *
 * `major` 不直接渲染(渲染的是 `realmLabel`),但它进 `worldOf()` 判界域,同样夹到 `MAX_MAJOR`。
 *
 * 故障注入:把三个 `asFiniteNumber(..., LIFE_COUNTER_CAP)` 的第四参去掉 → 本条红。
 */
describe('轮回履历 · 数值与境界名的上界', () => {
  it('坏值夹住,正常履历原样保留', () => {
    const p = usePlayerStore()
    p.reincarnation = {
      ...p.reincarnation,
      lives: [
        {
          index: 1,
          major: 5,
          realmLabel: 'x'.repeat(100_000),
          age: 1e300,
          themeId: null,
          themeResult: null,
          insight: 1e300,
          trialId: null,
          bond: null,
          at: 1
        },
        {
          index: 2,
          major: 15,
          realmLabel: '大乘',
          age: 1234,
          themeId: null,
          themeResult: null,
          insight: 56,
          trialId: null,
          bond: null,
          at: 2
        }
      ]
    } as never
    p.sanitize()
    const [bad, good] = p.reincarnation.lives
    expect(String(bad!.age), '界面会印出「寿 1e+300 载」').not.toMatch(/e\+\d/)
    expect(String(bad!.insight), '界面会印出「宿慧 +1e+300」').not.toMatch(/e\+\d/)
    expect(bad!.realmLabel.length, '境界名没截 —— 会把履历行撑爆').toBeLessThanOrEqual(24)
    expect(good!.realmLabel, '正常境界名被误伤').toBe('大乘')
    expect(good!.age, '正常寿数被改').toBe(1234)
    expect(good!.insight, '正常宿慧被改').toBe(56)
  })
})

/**
 * 征战录的宿敌名与渲染条数。
 *
 * `enemyName` 裸插值进那一行(`{{ n.enemyName }}`),原先只判「是不是字符串」——
 * 坏档塞十万字符会把行撑爆。敌人名在数据表里最长四五个字,16 码点已极宽。
 *
 * 条数在**渲染层**截:`player.nemeses` 参与玩法(ghostOf / isNemesis / markAvenged /
 * recordLoss 都读全量),存档层截掉会改变玩法。
 *
 * 故障注入:去掉 `truncateCodePoints` 包一层 → 第一条红;去掉 `.slice(0, NEMESIS_ROWS_SHOWN)` → 第二条红。
 */
describe('征战录 · 宿敌名与渲染条数', () => {
  it('超长敌人名被截,正常名与败次原样', () => {
    const p = usePlayerStore()
    p.nemeses = [
      { enemyId: 'e1', enemyName: 'x'.repeat(100_000), regionId: 'qingyun', lossCount: 5, lastLossAt: 1 },
      { enemyId: 'e2', enemyName: '赤焰虎', regionId: 'qingyun', lossCount: 7, lastLossAt: 2 }
    ] as never
    p.sanitize()
    const [bad, good] = p.nemeses
    expect(bad!.enemyName.length, '敌人名没截 —— 会把征战录那一行撑爆').toBeLessThanOrEqual(16)
    expect(good!.enemyName, '正常敌人名被误伤').toBe('赤焰虎')
    expect(good!.lossCount, '正常败次被改').toBe(7)
  })

  it('nemesisRows 有截断,且存档里的宿敌不截', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/LegacyView.vue'), 'utf8')
    expect(src, 'nemesisRows 没截断 —— 坏档 5000 位就渲 5000 行').toMatch(
      /\.sort\(\(a, b\) => \(a\.avengedAt \?\? 0\) - \(b\.avengedAt \?\? 0\)\)[\s\S]{0,80}\.slice\(0, NEMESIS_ROWS_SHOWN\)/
    )

    const p = usePlayerStore()
    p.initCharacter('探针', { roots: [] } as never)
    p.nemeses = Array.from({ length: 500 }, (_, i) => ({
      enemyId: 'e' + i,
      enemyName: '宿敌' + i,
      regionId: 'qingyun',
      lossCount: 5,
      lastLossAt: i
    })) as never
    p.sanitize()
    expect(p.nemeses.length, '存档侧不该截 —— 玩法要读全量').toBe(500)
  })
})
