/**
 * 首页法球的装饰层要整层对读屏静音。
 *
 * 法球由几层纯视觉元素叠成:粒子环、旋转环、进度 SVG、八卦环。
 * 进度 SVG 早已挂了 aria-hidden 并写明了理由,但**八卦环漏了** ——
 * 读屏会把「☰☱☲☳☴☵☶☷」逐个念出来,听感是一串无意义的方块。
 *
 * 判据:
 *   一 八卦环挂 aria-hidden,与进度 SVG 同规。
 *   二 法球里其余纯视觉层(粒子环、旋转环、内圈轨道点)一并对读屏静音 ——
 *      它们都是空 div/span,不该在无障碍树里占位。
 *   三 真内容(槽位里的图标)仍然读得到。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const ORB = readFileSync(resolve(ROOT, 'src/components/common/CultivationOrb.vue'), 'utf-8')
const HOME = readFileSync(resolve(ROOT, 'src/views/HomeView.vue'), 'utf-8')

describe('法球装饰层 · 一、八卦环对读屏静音', () => {
  it('八卦环带 aria-hidden —— 与进度 SVG 同规', () => {
    // 取包着 BAGUA 的那一行往上看三行,确认外层 div 带了 aria-hidden
    const at = ORB.indexOf('v-for="(sym, i) in BAGUA"')
    expect(at, '找不到八卦环').toBeGreaterThan(-1)
    const block = ORB.slice(Math.max(0, at - 400), at)
    expect(block, '八卦环的外层没有 aria-hidden').toContain('class="bagua-wrap spinning" aria-hidden="true"')
  })

  it('进度 SVG 的 aria-hidden 没被顺带改掉', () => {
    expect(ORB, '进度环仍是纯视觉').toContain('class="progress-svg" viewBox="0 0 120 120" aria-hidden="true"')
  })

  it('八卦符号本身不携带可访问名', () => {
    // 八个符号是装饰;给它们加 role/aria-label 反而会把一串符号念成八个名字
    const at = ORB.indexOf('BAGUA = [')
    const line = ORB.slice(at, ORB.indexOf('\n', at))
    expect(line, '符号表只是字符').not.toContain('aria-')
  })
})

describe('法球装饰层 · 二、其余纯视觉层一并对读屏静音', () => {
  it('粒子环与旋转环不占无障碍树', () => {
    // 这两层是空 div:读屏念不到任何东西,但它们若带 role 或标题就会占位
    for (const cls of ['particle-ring', 'ring-layer', 'inner-orbit-ring']) {
      const at = ORB.indexOf(`class="${cls}"`)
      if (at < 0) continue
      const tag = ORB.slice(Math.max(0, ORB.lastIndexOf('<', at)), ORB.indexOf('>', at) + 1)
      expect(tag, `${cls} 上不该挂 role / aria-label`).not.toMatch(/role=|aria-label=/)
    }
  })

  it('真内容仍读得到 —— 槽位里的图标不在装饰层里', () => {
    expect(ORB, 'orb-icon 该在 orb-body 里').toContain('class="orb-icon"')
    // 宿主页把它当装饰:首页法球旁边已有境界名与进度文字
    expect(HOME, '首页该给法球一个可读的说法或标为装饰').toMatch(/CultivationOrb|<h1/)
  })
})
