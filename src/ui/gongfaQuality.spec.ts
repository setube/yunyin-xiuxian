/**
 * 功法品阶形制:功法是唯一只靠字色告诉玩家「这部有多稀有」的物品家族。
 *
 * 装备、丹药、法宝、灵兽、灵草都已有品阶形制(浓淡 → 光环 → 最上档御纹),
 * 功法区却只把名字换个颜色。这一层把它接上,但两侧不能照抄卡片:
 *   一 行只有 36~40px 高、左右紧邻「N 层」「主修」等读数,四角角饰会压字,
 *      故行内只留左内沿一道竖线;最上档的御纹也收成两枚短角。
 *   二 形制要可数:凡/良/精无、灵~地一道、天~神一道 + 晕染。
 *   三 主修卡与列表行读同一份投影,免得某天只改了一边。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GONGFA, gongfaDef } from '@/data/gongfa'
import { qualityAura } from '@/ui/qualityAura'
import { lusterOf } from '@/ui/luster'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const SECTION = readFileSync(resolve(ROOT, 'src/components/cultivation/GongfaSection.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('功法形制 · 一、行内不能用卡片那套四角', () => {
  it('行内光环是左内沿一道竖线,不是四角', () => {
    const aura = block('.q-row-aura')
    expect(aura, '缺 .q-row-aura').not.toBe('')
    expect(aura, '行内光环须贴左内沿').toContain('left: 0')
    expect(aura, '行内光环不该是整幅覆盖(inset: 0 会把四角一起画出来)').not.toContain('inset: 0')
    expect(aura, '行内光环不该吃指针事件').toContain('pointer-events: none')
  })

  it('行内御纹只画两枚短角,长度收一半', () => {
    const common = block('.q-row-cornice::before,\n.q-row-cornice::after')
    expect(common, '缺行内御纹尺寸块').not.toBe('')
    expect(common, '行内御纹应比卡片上的 18px 短一半').toContain('10px')
    // 卡片那套仍归卡片:两套并存,不互相顶掉
    expect(block('.luster-cornice'), '卡片御纹不该被改掉').toContain('inset: 0')
  })

  it('形制可数:凡/良/精无、灵~地一道、天~神一道带晕染', () => {
    const tiers = new Map<string, string>()
    for (const def of GONGFA) {
      const aura = qualityAura(def.quality)
      if (aura.tier === 'plain') continue
      tiers.set(aura.tier, def.quality)
    }
    expect([...tiers.keys()].sort(), '灵~地与天~神各需至少一部功法当样本').toEqual(['radiant', 'refined'])
    expect(block('.q-row-aura--radiant'), '稀有档须另有一档形制').not.toBe('')
  })

  it('最上档才有御纹,且与 luster 同一把尺', () => {
    const divine = GONGFA.filter(g => g.quality === 'divine')
    expect(divine.length, '神品功法样本').toBeGreaterThan(0)
    for (const def of divine) expect(lusterOf(def.quality), `${def.name} 应有最上档质感`).not.toBeNull()
    for (const def of GONGFA.filter(g => g.quality === 'mortal' || g.quality === 'fine')) {
      expect(lusterOf(def.quality), `${def.name} 不该有最上档质感`).toBeNull()
    }
  })
})

describe('功法形制 · 二、主修卡与列表读同一份投影', () => {
  it('两处都读 rowOf / auraOf,不各判一次', () => {
    expect(SECTION, '列表行读 rowOf 投影').toContain('...rowOf(def.id)')
    expect(SECTION, '主修卡读同一份 auraOf').toContain('auraOf(mainDef.quality)')
    expect(SECTION, '行光环挂上去').toContain('q-row-aura')
    expect(SECTION, '行御纹挂上去').toContain('q-row-cornice')
    // 不许退回卡片那套:行内会压字
    expect(SECTION, '行内不该用卡片四角御纹').not.toContain('class="luster-cornice"')
  })

  it('模板里的行循环用投影后的 row,不再自己再算一遍品质', () => {
    expect(SECTION, '列表应按 row 迭代').toContain('v-for="row in activeGongfaItems"')
    expect(SECTION, '项目投影应带形制').toContain('.map(def => ({ def, ...rowOf(def.id) }))')
  })
})

describe('功法形制 · 三、色相仍由品阶表给', () => {
  it('行光环的色相取自 qualityDef,不写死', () => {
    expect(SECTION, '行光环色相应取品阶表').toContain("'--q-tone': qualityDef(row.def.quality).color")
    expect(CSS, '样式里不该出现裸品阶 hex').not.toMatch(/\.q-row-aura[^{]*\{[^}]*#[0-9a-fA-F]{6}/)
  })

  it('功法表里的品阶都在品阶表内(写错 id 会静默掉回凡品)', () => {
    for (const def of GONGFA) {
      expect(gongfaDef(def.id), `${def.id} 取不到`).toBeTruthy()
      expect(qualityAura(def.quality).label !== undefined).toBe(true)
    }
  })
})
