/**
 * 装备共鸣形制:六套共鸣此前在格子上共用一枚「共」字。
 *
 * 同一格里的「共」可能是铁壁、可能是妖庭,得点开详情才知道;而共鸣只有凑齐才生效,
 * 看不出来就无从决定「下一件该先收哪个部位」。
 *
 * 四条判据:
 *   一 六套各一纹,且纹样两两不同(重了就等于两套长得一样)
 *   二 套纹与机制都从 core/equipSet 与数据表现算,不另立 id 清单
 *   三 件数刻度随 required 变,不写死两格(妖庭是三件套)
 *   四 两处界面都接上了
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { allEquipSets, equipSetDef } from '@/core/equipSet'
import { SET_MECHANISM_NAMES, setMark, setMarkOfItem, setPips } from './setMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const CARD = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentCard.vue'), 'utf-8')
const DETAIL = readFileSync(resolve(ROOT, 'src/components/equipment/EquipmentDetailDialog.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/setMark.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('共鸣形制 · 一、六套各一纹', () => {
  it('每一套都取得到形制,套名与机制都取得到', () => {
    const sets = allEquipSets()
    expect(sets.length, '判据失去对象').toBeGreaterThan(3)
    for (const def of sets) {
      const mark = setMark(def.id)
      expect(mark, `${def.name} 缺形制 —— 忘了在 CRESTS 里登记`).toBeDefined()
      expect(mark!.name).toBe(def.name)
      expect(mark!.required).toBe(def.required)
      expect(SET_MECHANISM_NAMES[mark!.mechanism], `${def.name} 的机制没有中文说法`).toBeTruthy()
    }
  })

  it('六枚纹样两两不同 —— 重了就等于两套长得一样', () => {
    const crests = allEquipSets().map(def => setMark(def.id)!.crest)
    expect(new Set(crests).size, `纹样有重复:${crests.join(' / ')}`).toBe(crests.length)
  })

  it('每种机制在样式里都有自己的色', () => {
    for (const mech of ['guard', 'shield', 'leech'] as const) {
      expect(block(`.set-crest--${mech}`), `缺 ${mech} 的机制色`).not.toBe('')
    }
    // 三色互不相同
    const tones = (['guard', 'shield', 'leech'] as const).map(m =>
      [...block(`.set-crest--${m}`).matchAll(/--color-([a-z-]+)-rgb/g)].map(x => x[1]).join('')
    )
    expect(new Set(tones).size, `机制色有重复:${tones.join(' / ')}`).toBe(3)
  })
})

describe('共鸣形制 · 二、全部从数据现算', () => {
  it('机制由 hook 推出,不在形制层另写一张套名表', () => {
    expect(MODULE, '机制应读 hook').toContain('MECHANISM_OF_HOOK')
    // 三钩子各一类:铁壁与神铠同为护命,星斗/仙甲/混沌同为开战盾,妖庭汲取
    expect(setMark('s_tiebi')!.mechanism).toBe('guard')
    expect(setMark('s_shenjia')!.mechanism).toBe('guard')
    expect(setMark('s_xingdou')!.mechanism).toBe('shield')
    expect(setMark('s_xianjia')!.mechanism).toBe('shield')
    expect(setMark('s_hundunjia')!.mechanism).toBe('shield')
    expect(setMark('s_yaoting')!.mechanism).toBe('leech')
  })

  /**
   * 形制层不该自己维护一份「有哪些套」的清单 —— 那张表在 core 的 SET_DEFS 里。
   * 判据落在两个地方:形制层不许出现手抄的 id 数组;界面用的是 core 的全表接口。
   */
  it('套清单只在 core 一处,形制层与界面都不另抄', () => {
    // 形制层出现一串手抄的 s_ 字面量就说明抄了一份
    expect(MODULE, '不该在形制层再抄一份套 id 清单').not.toMatch(/\[\s*'s_tiebi'/)
    // 界面列全表时走 core 的接口,不遍历自己写的一串 id
    const VIEW = readFileSync(resolve(ROOT, 'src/views/InventoryView.vue'), 'utf-8')
    expect(VIEW, '装备页的全表应读 core 的 allEquipSets').toContain('allEquipSets()')
    expect(VIEW, '界面不该手抄套 id 清单').not.toMatch(/\[\s*'s_tiebi'/)
  })

  it('每件带 set 的装备都取得到形制 —— 不画错的纹,也不漏画', () => {
    const withSet = EQUIPMENT_TEMPLATES.filter(t => t.set)
    expect(withSet.length, '判据失去对象').toBeGreaterThan(10)
    for (const t of withSet) {
      const mark = setMarkOfItem({ templateId: t.id } as never)
      expect(mark, `${t.name} 取不到共鸣形制`).toBeDefined()
      expect(mark!.id).toBe(equipSetDef(t.set!)!.id)
    }
    // 无 set 的装备不该挂形制
    const plain = EQUIPMENT_TEMPLATES.find(t => !t.set)!
    expect(setMarkOfItem({ templateId: plain.id } as never), '无共鸣件不该挂形制').toBeUndefined()
  })

  it('认不出套 id 时给 undefined,调用点据此不画', () => {
    expect(setMark('s_not_exist')).toBeUndefined()
    expect(setMarkOfItem(undefined)).toBeUndefined()
  })
})

describe('共鸣形制 · 三、件数刻度随 required 变', () => {
  it('两件套两格、三件套三格,不写死', () => {
    expect(setPips(setMark('s_tiebi')!, 0)).toHaveLength(2)
    expect(setPips(setMark('s_yaoting')!, 0), '妖庭是三件套 —— 写死两格会少一格').toHaveLength(3)
  })

  it('已戴几件就亮几格,坏值不画错', () => {
    const mark = setMark('s_yaoting')!
    expect(setPips(mark, 2).filter(Boolean).length).toBe(2)
    expect(setPips(mark, 3).every(Boolean), '凑齐时整排亮').toBe(true)
    for (const bad of [Number.NaN, -3, 99]) {
      const pips = setPips(mark, bad)
      expect(pips, '坏值不该画出多余的格').toHaveLength(3)
    }
    expect(setPips(mark, 99).filter(Boolean).length, '越界不该亮出比 required 更多的格').toBe(3)
  })
})

describe('共鸣形制 · 四、两处界面都接上了', () => {
  it('格子上换成套纹,不再是通用的「共」字', () => {
    expect(CARD, '装备格应渲染套纹').toContain('set-crest')
    expect(CARD, '套纹应读形制').toContain('setMarkOfItem(')
    expect(CARD, '套纹应有读屏说法').toContain('setMark.label')
    // 阴性对照:通用的「共」字应已撤掉
    expect(CARD, '不该再只画一枚通用「共」字').not.toMatch(/>\s*共\s*</)
  })

  it('详情里给出件数刻度与套名', () => {
    expect(DETAIL, '详情应渲染套纹').toContain('set-crest')
    expect(DETAIL, '详情应渲染件数刻度').toContain('setPips(')
    expect(DETAIL, '件数刻度应有读屏说法').toContain('凑齐需')
  })

  /**
   * 加了套纹之后,共鸣那一行要能折行。
   *
   * 那一行有套纹、套名、N/M、说明、按钮五样。200% 缩放(视口约 195)下
   * 右缘冲到 213,越界 18px —— 而套纹正是这一行里后加的那个。
   * 这是「给一行加形制」的常见后遗症:局部看是加一枚小纹,整行看是多挤一样东西。
   *
   * 故障注入:去掉 flex-wrap,本条红。
   */
  it('共鸣行能折行 —— 加了套纹之后五样并排挤不下', () => {
    const view = readFileSync(resolve(ROOT, 'src/views/InventoryView.vue'), 'utf-8')
    const at = view.indexOf('v-for="s in setRows"')
    expect(at, '找不到共鸣行').toBeGreaterThan(-1)
    const tag = /<p v-for="s in setRows"[^>]*class="([^"]*)"/.exec(view)?.[1]
      ?? (/class="([^"]*)"[^>]*v-for="s in setRows"/.exec(view)?.[1] ?? '')
    expect(tag, '共鸣行须能折行').toContain('flex-wrap')
    expect(tag, '折行时也要给行间距').toContain('gap-y-')
  })

  it('纹样不吃指针事件 —— 形制不抢内容的点击', () => {
    expect(block('.set-crest'), '套纹不该吃指针事件').toContain('pointer-events: none')
    expect(block('.set-pips'), '件数刻度不该吃指针事件').toContain('pointer-events: none')
  })
})

/**
 * 套纹须只画在自己那 9×9 里。
 *
 * 这曾是一个真实缺陷:套纹基类为了不盖掉调用点的 `absolute` 而不写 position,
 * 但 ::before 仍是 `position: absolute; inset: 0`。详情与共鸣行上套纹留在流里,
 * 没有定位上下文,伪元素的画布就成了最近的定位祖先 `.card-ink` ——
 * 六套纹样被拉满整张卡,背包页的「装备共鸣」变成一片斜纹。
 *
 * 尺寸固定,纹样不需要定位:伪元素用块级 100%×100% 填满方框,
 * 三处调用点各自怎么摆都不影响纹样。
 *
 * 故障注入:把 `position: absolute; inset: 0` 加回 `.set-crest::before`,第一条红。
 */
describe('套纹 · 只画在自己那 9×9 里', () => {
  it('纹样不靠定位 —— 一绝对定位就会以最近的定位祖先为画布', () => {
    const pseudo = block('.set-crest::before')
    expect(pseudo, '找不到套纹纹样').not.toBe('')
    expect(pseudo, '纹样不许绝对定位').not.toMatch(/position\s*:\s*(absolute|fixed|sticky)/)
    expect(pseudo, '纹样不许用 inset 撑框').not.toMatch(/(^|[;\s])inset\s*:/)
  })

  it('纹样填满 9×9 方框', () => {
    const base = block('.set-crest')
    expect(base, '套纹须是 9×9 的小方框').toMatch(/width:\s*9px/)
    expect(base, '套纹须是 9×9 的小方框').toMatch(/height:\s*9px/)
    const pseudo = block('.set-crest::before')
    expect(pseudo, '纹样须铺满方框').toMatch(/width:\s*100%/)
    expect(pseudo, '纹样须铺满方框').toMatch(/height:\s*100%/)
  })

  it('两枚带内缩的纹样用宽高与外边距,不靠 inset', () => {
    for (const crest of ['shell', 'chaos']) {
      const b = block(`.set-crest--${crest}::before`)
      expect(b, `${crest} 纹样丢了`).not.toBe('')
      expect(b, `${crest} 纹样不许用 inset`).not.toMatch(/(^|[;\s])inset\s*:/)
      expect(b, `${crest} 纹样须写宽高`).toMatch(/width:\s*\d+%/)
      expect(b, `${crest} 纹样须写宽高`).toMatch(/height:\s*\d+%/)
    }
  })

  it('三处调用点仍接上套纹', () => {
    // 卡面:压在底边一角,仍靠调用点的 absolute
    expect(CARD, '装备卡的套纹须 absolute').toMatch(/class="set-crest absolute/)
    // 详情与共鸣行:留在流里,纹样靠自身 100% 填满
    expect(DETAIL, '详情套纹留在流里').toMatch(/class="set-crest shrink-0"/)
    const inv = readFileSync(resolve(ROOT, 'src/views/InventoryView.vue'), 'utf-8')
    expect(inv, '共鸣行套纹留在流里').toMatch(/class="set-crest shrink-0"/)
  })
})
