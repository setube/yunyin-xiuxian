/**
 * 器魂形制:六阶要数得出来,不是只有颜色深一点。
 *
 * 为什么单开一层:器魂六阶(朦胧 → 化真)此前在界面上只差一个字的颜色深浅。
 * 颜色是连续量,三档之后就读不出层数;可数的线索要靠形制 ——
 * 阶点(一阶一点,数得出来)与最上阶独有的一圈魂环。
 *
 * 三条判据:
 *   一 阶点与阶数等值,且夹在 1~SOUL_GRADES.length:一阶与六阶必须一眼数得出来。
 *   二 阈值与色值都不另立:顶阶取 `SOUL_GRADES` 表尾,色取 data/souls。
 *   三 最上阶才给魂环 —— 每阶都加一圈等于每阶都没有(与 ui/luster 同一条铁律)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SOUL_GRADES, soulGradeDef } from '@/data/souls'
import { clampSoulGrade, soulMark, SOUL_TOP_GRADE } from './soulMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const VIEW = readFileSync(resolve(ROOT, 'src/views/SoulsView.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('器魂形制 · 一、阶点数得出来', () => {
  it('一阶一点、顶阶最多点,且点数与阶号一一对应', () => {
    const seen = new Set<number>()
    for (let g = 0; g < SOUL_GRADES.length; g += 1) {
      const mark = soulMark(g)
      expect(mark.pips, `第 ${g} 阶的点数应与阶号一一对应`).toBe(g + 1)
      expect(seen.has(mark.pips), `点数 ${mark.pips} 重复 —— 两阶数起来一样,形制就没拉开`).toBe(false)
      seen.add(mark.pips)
    }
    expect(seen.size).toBe(SOUL_GRADES.length)
  })

  it('点数夹在合法区间,坏档不会点出一排点或零点', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(soulMark(bad).pips, `坏值 ${String(bad)} 应退回一阶`).toBe(1)
    }
    expect(soulMark(999).pips).toBe(SOUL_GRADES.length)
  })
})

describe('器魂形制 · 二、阈值与色值不另立', () => {
  it('顶阶取自表尾,不另写数字', () => {
    expect(SOUL_TOP_GRADE).toBe(SOUL_GRADES.length - 1)
    expect(soulMark(SOUL_TOP_GRADE).top).toBe(true)
    expect(soulMark(SOUL_TOP_GRADE - 1).top).toBe(false)
  })

  it('说法与阶色都复用 data/souls 的唯一事实源', () => {
    for (let g = 0; g < SOUL_GRADES.length; g += 1) {
      expect(soulMark(g).label).toBe(soulGradeDef(g).name)
      expect(soulMark(g).color).toBe(soulGradeDef(g).color)
    }
  })

  it('夹取与 soulGradeDef 同口径', () => {
    expect(clampSoulGrade(Number.NaN)).toBe(0)
    expect(clampSoulGrade(-3)).toBe(0)
    expect(clampSoulGrade(99)).toBe(SOUL_TOP_GRADE)
    expect(clampSoulGrade(2.9)).toBe(2)
  })
})

describe('器魂形制 · 三、最上阶才给魂环', () => {
  it('只有化真阶带魂环', () => {
    const tops = SOUL_GRADES.filter((_, i) => soulMark(i).top)
    expect(tops.map(t => t.name)).toEqual([SOUL_GRADES[SOUL_GRADES.length - 1]!.name])
  })

  it('魂环样式存在且不吃指针事件', () => {
    const halo = block('.soul-halo')
    expect(halo, '缺 .soul-halo').not.toBe('')
    expect(halo, '.soul-halo 须 pointer-events: none —— 否则会挡住卡片的点击').toContain('pointer-events: none')
  })

  it('阶点走形制尺寸,不靠颜色浓淡', () => {
    const pip = block('.soul-pips i')
    expect(pip, '缺 .soul-pips i').not.toBe('')
    // 点须是实心可数的圆点/方块,尺寸写死,不随阶数渐变
    expect(pip, '阶点应有固定尺寸').toMatch(/(width|height):\s*\d+px/)
    // 不吃指针事件挂在容器上,整排点一起穿透
    expect(block('.soul-pips'), '阶点容器不应吃指针事件').toContain('pointer-events: none')
  })

  it('减少动效下魂环仍在(静态形制要自己站得住)', () => {
    // 魂环的呼吸动效只是加成;静态那一圈由边框承担,不该被减少动效抹掉
    const prefers = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(prefers, '减少动效块里不该用 display:none 抹掉魂环').not.toMatch(/\.soul-halo[^{]*\{[^}]*display:\s*none/)
  })

  it('魂环只挂在最上阶那一格 —— 每格都挂等于没挂', () => {
    // 槽位是同一个模板渲染三遍,条件必须落在「这一格的器魂是不是最上阶」上
    expect(VIEW, '魂环条件应判 top').toContain('v-if="row.mark?.top" class="soul-halo"')
    expect(VIEW, '魂环不该无条件渲染').not.toContain('v-if="row.mark" class="soul-halo"')
  })

  it('器魂页真的接上了 —— 定义了却从不使用的形制是死代码', () => {
    // 三处形制都在 setup 里各算一次(TrialPanel / 丹匣 / 功法详情同法)
    expect(VIEW, '装配槽应读阶位形制').toContain('mark: soulMark(soul.grade)')
    expect(VIEW, '闲置列表应显示阶点').toContain('soul-pips')
    expect(VIEW, '凝炼台预览也应给出阶位形制').toContain('mark: soulMark(preview.gradeRank)')
    // 阳性:模板不许再逐行调查表函数
    const tpl = VIEW.slice(0, VIEW.indexOf('<script'))
    expect(tpl, '模板不该再调 soulMark').not.toContain('soulMark(')
    expect(tpl, '模板不该再调 soulColor').not.toContain('soulColor(')
  })

  /**
   * 魂型印两处都要有。
   *
   * 六类器魂在 data/souls 里各有一个单字(锋/盾/棘/连/泽/背),
   * 出战槽用大字印显示它,散置列表却只有名字 —— 同一页两种读法:
   * 同一个「锋魂」,装配着的那枚有个「锋」字,散着的那枚只写「锋魂」二字。
   * 而阵里同时装配两三枚时,大字印才是玩家扫一眼就分得开的那个记号。
   *
   * 故障注入:删掉散置行的魂型印,本条红。
   */
  it('魂型印在出战槽与散置列表两处都有', () => {
    expect(VIEW, '出战槽应有魂型印').toContain("seal: soulTypeDef(soul.type)?.seal ?? '魂'")
    expect(VIEW, '散置列表也应有魂型印').toContain("seal: soulTypeDef(s.type)?.seal ?? '魂'")
    // 阳性对照:两处都自 data/souls 的 seal 取字,不另抄一张表
    const hits = VIEW.match(/soulTypeDef\(\w+\.type\)\?\.seal/g) ?? []
    expect(hits.length, '出战槽与散置列表两处').toBeGreaterThanOrEqual(2)
  })
})
