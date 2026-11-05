/**
 * 灵兽性格倾向形制:四种性格只影响历练时的四项,而界面上此前只有名字与一句描述。
 *
 * 「贪宝」与「好战」都算「凶」,但它们动的是不同的量 —— 要挑一只配当前打法,
 * 得把描述那句话读两遍再在脑子里比对。
 *
 * 四条判据:
 *   一 四项倾向只看「比中性大还是小」,不另立阈值表(数据改了形制跟着改)
 *   二 只列在动的项,平的(即不改的)不占位
 *   三 性格是分类不是品阶:不套品阶色
 *   四 界面真的接上了
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PetDef } from '@/types'
import { EFFECTS, PERSONALITY_NAMES, personalityEffects } from '@/core/petPersonality'
import { personalityDesc as personalityDescOf } from '@/core/petPersonality'
import { PETS } from '@/data/pets'
import {
  PERSONALITY_AXIS_NAMES,
  personalityMark,
  personalityMarks,
  personalityTiltRows,
  tiltsOf
} from './personalityMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const VIEW = readFileSync(resolve(ROOT, 'src/views/TitlesView.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('性格倾向 · 一、倾向从效果现算,不另立阈值', () => {
  it('四种性格都取得到四项倾向', () => {
    for (const key of Object.keys(PERSONALITY_NAMES) as PetDef['personality'][]) {
      const mark = personalityMark(key)
      expect(mark.name, `${key} 缺性格名`).toBe(PERSONALITY_NAMES[key])
      expect(Object.keys(mark.tilts).sort()).toEqual(['danger', 'duration', 'guard', 'luck'])
    }
  })

  it('倾向只由「比中性大还是小」定,不引入第三档', () => {
    // 倍率类中性是 1,加减类中性是 0
    expect(tiltsOf({ exploreDurMult: 1.1, dangerMult: 1.05, dropLuck: 0.06, lossReduction: 0 })).toEqual({
      duration: 'up',
      danger: 'up',
      luck: 'up',
      guard: 'flat'
    })
    expect(tiltsOf({ exploreDurMult: 0.95, dangerMult: 0.95, dropLuck: -0.02, lossReduction: 0.04 })).toEqual({
      duration: 'down',
      danger: 'down',
      luck: 'down',
      guard: 'up'
    })
  })

  it('与 core 的 EFFECTS 同源:改数据,形制跟着改', () => {
    for (const key of Object.keys(EFFECTS) as PetDef['personality'][]) {
      const mark = personalityMark(key)
      // 直接拿 core 那张表重算一遍,两边必须一致
      const expected = tiltsOf(EFFECTS[key])
      expect(mark.tilts, `${key} 的倾向与 EFFECTS 不一致`).toEqual(expected)
    }
  })

  it('借 personalityEffects 的出口也指向同一份(不另立第二条读法)', () => {
    // 拿一只真实灵兽验:它读出来的效果,与按性格直接查 EFFECTS 一致
    for (const pet of PETS) {
      expect(personalityEffects(pet.id), `${pet.name} 的效果与 EFFECTS 分叉`).toEqual(EFFECTS[pet.personality])
    }
  })
})

describe('性格倾向 · 二、只列在动的项', () => {
  it('四种性格各有 2~3 项在动,平的不占位', () => {
    for (const mark of personalityMarks()) {
      const rows = personalityTiltRows(mark)
      expect(rows.length, `${mark.name} 的倾向行数应与 active 一致`).toBe(mark.active)
      expect(mark.active, `${mark.name} 一项也不动,形制等于没画`).toBeGreaterThanOrEqual(2)
      for (const r of rows) {
        expect(r.tilt, `${mark.name} 的 ${r.axisName} 是平的,不该占位`).not.toBe('flat')
        expect(r.axisName, `${mark.name} 的 ${r.axis} 缺中文名`).toBe(PERSONALITY_AXIS_NAMES[r.axis])
      }
    }
  })

  it('认不出性格时四项全平,调用点据此不画', () => {
    const mark = personalityMark('not-a-kind' as PetDef['personality'])
    expect(mark.active).toBe(0)
    expect(personalityTiltRows(mark)).toEqual([])
    expect(mark.label).toBe('')
  })
})

describe('性格倾向 · 三、是分类不是品阶', () => {
  it('样式只取语义色,不套品阶色', () => {
    const tilt = block('.personality-tilt')
    expect(tilt, '缺 .personality-tilt').not.toBe('')
    expect(tilt, '倾向签不该吃指针事件').toContain('pointer-events: none')
    // 色只许取 ink / cinnabar / jade 三系;出现 quality 或 gold 就是把分类当成了品阶
    for (const sel of ['.personality-tilt', '.personality-tilt--up', '.personality-tilt--down']) {
      const tones = [...block(sel).matchAll(/--color-([a-z-]+)-rgb/g)].map(m => m[1])
      for (const tone of tones) {
        expect(['ink', 'ink-soft', 'cinnabar', 'jade'], `${sel} 用了非分类色 ${tone}`).toContain(tone)
      }
    }
  })
})

describe('性格倾向 · 四、界面接上了', () => {
  it('名号页的灵兽卡挂上倾向签,并给读屏说法', () => {
    expect(VIEW, '灵兽卡应渲染倾向签').toContain('personality-tilt')
    expect(VIEW, '应读形制').toContain('personalityMark(def!.personality)')
    expect(VIEW, '应只列在动的项').toContain('personalityTiltRows(')
    expect(VIEW, '读屏说法应带性格名与倾向条数').toContain('row.personalityMark.label')
  })

  /**
   * 灵兽册的详情也要报性子。
   *
   * 名号页的灵兽卡有四项倾向印(上一条判据钉着),而同一种性子在图鉴里只写「贪宝」两个字。
   * 图鉴是纯文本流,只能把同一件事写成一句 —— 与名号页同读 core/petPersonality。
   *
   * 故障注入:把 personalityDesc 从 desc 里去掉,本条红。
   */
  it('灵兽册的详情写出性子倾向,与名号页同源', () => {
    const VIEW = readFileSync(resolve(ROOT, 'src/views/CollectionView.vue'), 'utf-8')
    expect(VIEW, '灵兽册 desc 应带性子一句话').toContain('personalityDesc(p.personality)')
    // 阳性:那句话来自 core,不在页面里另写一份
    expect(VIEW, '应自 core 引入').toMatch(/import \{[^}]*personalityDesc[^}]*\} from '@\/core\/petPersonality'/)
    // 且这句话确实报得出方向(四种性格都不为空)
    for (const p of ['greedy', 'steady', 'fierce', 'cautious'] as const) {
      const text = personalityDescOf(p)
      expect(text.length, `${p} 的性子说明是空的`).toBeGreaterThan(3)
      expect(text, `${p} 的说明没写出行程/遇险/气运/护持中的任一方向`).toMatch(/行程|遇险|气运|成色|护持/)
    }
  })

  it('形制在行计算里算一次,模板不反复调', () => {
    const tpl = VIEW.slice(0, VIEW.indexOf('<script'))
    expect(tpl, '模板里反复调 personalityMark,既慢又难读').not.toContain('personalityMark(def!')
  })
})
