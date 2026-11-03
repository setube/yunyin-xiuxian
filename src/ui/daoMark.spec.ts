/**
 * 道途形制:四条道各有一枚道纹,四道不必比色也分得开。
 *
 * 道途此前只有一枚朱砂方印,四道同一个红底 —— 而它恰恰是「一世一择、不可更改」的东西。
 * 这一层只加形制,不造第五套色表。
 *
 * 四条判据:
 *   一 四道各有一枚道纹,且互不重复(重复了等于两道长得一样)。
 *   二 道纹靠形状区分:四枚的 CSS 背景图各不相同(色弱玩家靠形状,不靠色相)。
 *   三 认不出的 id 返回 undefined —— 坏档里的野 id 不许挂一份假形制。
 *   四 形制不许抢内容:道纹不吃指针事件,且天界与道痕两处真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DAO_PATHS } from '@/data/endgame'
import { daoMark, daoMarks, type DaoCrest } from './daoMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const CELESTIAL = readFileSync(resolve(ROOT, 'src/views/CelestialView.vue'), 'utf-8')
const MARKS = readFileSync(resolve(ROOT, 'src/components/celestial/MarksPanel.vue'), 'utf-8')

/**
 * 取 CSS 里某个选择器的声明块。
 * 选择器须**从行首**开始 —— 否则 `html[data-theme='dark'] .dao-crest` 会先被 `.dao-crest` 匹配上,
 * 判据读到的是夜主题那段覆盖(实测踩过)。
 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('道途形制 · 一、四道各一枚且互不重复', () => {
  it('每条道都取得到形制', () => {
    for (const def of DAO_PATHS) {
      const mark = daoMark(def.id)
      expect(mark, `${def.name} 取不到形制`).toBeDefined()
      expect(mark!.label, `${def.name} 的说法应复用道名`).toBe(def.name)
    }
  })

  it('四枚道纹两两不同 —— 相同等于两道长得一样', () => {
    const crests = daoMarks().map(m => m.crest)
    expect(crests.length).toBe(DAO_PATHS.length)
    expect(new Set(crests).size, `道纹重复:${crests.join(' / ')}`).toBe(crests.length)
  })

  it('认不出的 id 返回 undefined,不挂假形制', () => {
    for (const bogus of ['', 'nonexistent', 'SWORD', '__proto__']) {
      expect(daoMark(bogus), `${bogus} 不该有道途形制`).toBeUndefined()
    }
  })

  it('道色取既有语义 token,不写死 hex', () => {
    for (const def of DAO_PATHS) {
      const tone = daoMark(def.id)!.tone
      expect(tone, `${def.name} 的道色应引 var(--color-*)`).toMatch(/^var\(--color-[a-z-]+\)$/)
    }
  })
})

describe('道途形制 · 二、形状可数,不靠色相', () => {
  it('四种道纹各有一条自己的 CSS 规则,且背景图各不相同', () => {
    const imgs = new Map<DaoCrest, string>()
    for (const crest of ['blade', 'ring', 'bars', 'cross'] as DaoCrest[]) {
      const body = block(`.dao-crest--${crest}`)
      expect(body, `缺 .dao-crest--${crest}`).not.toBe('')
      // 声明块收尾是 `}` 而非 `;`,故按「background-image: 到本块结束」取
      const img = /background-image:\s*([\s\S]*)/.exec(body)?.[1]?.trim() ?? ''
      expect(img, `${crest} 应有一条背景图`).not.toBe('')
      imgs.set(crest, img)
    }
    expect(new Set(imgs.values()).size, '两枚道纹画了同一张图,形状就分不开了').toBe(4)
  })

  it('线色走 currentColor —— 宿主自己决定用什么色,纹样不写死', () => {
    for (const crest of ['blade', 'ring', 'bars', 'cross'] as DaoCrest[]) {
      expect(block(`.dao-crest--${crest}`), `${crest} 应使用 currentColor`).toContain('currentColor')
    }
  })

  it('道纹只做底噪:本体带固定不透明度,且夜主题另给一档', () => {
    const base = block('.dao-crest')
    expect(base, '缺 .dao-crest').not.toBe('')
    expect(base, '道纹须有固定不透明度,否则会压过正文').toMatch(/opacity:\s*0?\.\d+/)
    expect(CSS, '夜纸近黑,须另给一档不透明度').toContain("html[data-theme='dark'] .dao-crest")
  })
})

describe('道途形制 · 三、不抢内容且真的接上了', () => {
  it('道纹不吃指针事件', () => {
    expect(block('.dao-crest'), '.dao-crest 须 pointer-events: none').toContain('pointer-events: none')
  })

  it('天界三处都挂上了:当前道途、择道卡、确认弹窗', () => {
    expect(CELESTIAL, '当前道途卡应挂道纹').toContain('currentMark')
    expect(CELESTIAL, '择道卡应挂道纹').toContain('daoMarkOf(dao.id)')
    expect(CELESTIAL, '确认弹窗应挂道纹').toContain('pendingMark')
    expect(CELESTIAL, '道纹应带 dao-crest 与形状类').toContain('dao-crest--${')
  })

  it('道痕面板历世也认得出是哪条道', () => {
    expect(MARKS, '道痕行应挂道纹').toContain('daoMark(mark.daoPathId)')
    expect(MARKS, '道纹是装饰,读屏不重复念').toContain('aria-hidden="true"')
  })

  it('道纹是水印,不叠在印字上 —— 8~10px 的字压上底纹就读不清了', () => {
    // 印面上的 dao-crest 曾在实测里被「机」字的三横劈开,故只许挂在卡角的水印位
    for (const [src, name] of [
      [CELESTIAL, '天界'],
      [MARKS, '道痕']
    ] as const) {
      for (const m of src.matchAll(/class="[^"]*dao-crest[^"]*"/g)) {
        expect(m[0], `${name}里的道纹不该带 seal-face(那会叠在印字上)`).not.toContain('seal-face')
      }
    }
  })
})
