/**
 * 法球的界域形制判据。
 *
 * 法球是全游戏被看得最多的一个东西 —— 首页仪表盘正中、修炼页正中,
 * 从炼气一路看到混沌道祖。它此前 21 个境界长得一模一样:
 * 同样的三圈光环、同样的十二粒金点、同样的八卦环。
 * 于是「我已经到仙界了」这件事,界面上只有一行字说得出,那颗球本身没有任何变化。
 *
 * 四条:
 *   一 四界各一态,且静态下就分得开 —— 环数、粒子数、八卦环的有无,三样都可数。
 *   二 形态只从 data/realms 推,不新增事实源;越界钳到首尾界域。
 *   三 组件真的接上了,且槽位内容仍可覆盖中心符。
 *   四 装饰纪律不退:法球整层读屏静音(与 ui/orbDecorative.spec 分工,这里只钉新加的两层)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { orbForm, orbParticleIndexes, orbRingIndexes } from './orbForm'
import { WORLDS, MAX_MAJOR, worldOf } from '@/data/realms'

const ROOT = resolve(__dirname, '../..')
const ORB = readFileSync(resolve(ROOT, 'src/components/common/CultivationOrb.vue'), 'utf-8')
const HOME = readFileSync(resolve(ROOT, 'src/views/HomeView.vue'), 'utf-8')
const CULTIVATION = readFileSync(resolve(ROOT, 'src/views/CultivationView.vue'), 'utf-8')

/** 四界各一态:每界的入口境就是该界形态 */
const formsOfFourWorlds = () => WORLDS.map(w => orbForm(w.start))

describe('法球形制 · 一、四界各一态,静态下分得开', () => {
  it('四个界域的法球两两不同', () => {
    const forms = formsOfFourWorlds()
    expect(forms).toHaveLength(WORLDS.length)
    const keys = forms.map(f => `${f.rings}/${f.particles}/${f.bagua ? '卦' : '-'}`)
    expect(new Set(keys).size, `四界有重复的形态:${keys.join(' · ')}`).toBe(keys.length)
  })

  it('三样可数的线索逐界递增或递减 —— 不是随机换了个数', () => {
    const forms = formsOfFourWorlds()
    // 环数严格递增:一界一层,这是最容易数的一样
    for (let i = 1; i < forms.length; i += 1) {
      expect(forms[i]!.rings, `第 ${i} 界的环数没有多于上一界`).toBeGreaterThan(forms[i - 1]!.rings)
    }
    // 粒子数严格递增,且相邻两界至少差 4 粒 —— 差得少就数不出来
    for (let i = 1; i < forms.length; i += 1) {
      expect(forms[i]!.particles - forms[i - 1]!.particles, `第 ${i} 界的粒子数增得太少`).toBeGreaterThanOrEqual(4)
    }
    // 八卦环只在人间界挂:过了山门就不该再挂着学派的记号
    expect(forms[0]!.bagua, '人间界该挂八卦环').toBe(true)
    for (const f of forms.slice(1)) expect(f.bagua, '出了人间界还挂八卦环 —— 那枚记号表示「还在山门里」').toBe(false)
  })

  it('环与粒子的序号表按形态生成,不在模板里写死个数', () => {
    for (const form of formsOfFourWorlds()) {
      expect(orbRingIndexes(form)).toHaveLength(form.rings)
      expect(orbParticleIndexes(form)).toHaveLength(form.particles)
      // 序号从 0 起连续:模板用它拼类名 rot-ring--N
      expect(orbRingIndexes(form)).toEqual(Array.from({ length: form.rings }, (_, i) => i))
    }
  })

  it('边界与坏值都钳到合法形态,不返回空', () => {
    expect(orbForm(-5).rings).toBe(orbForm(0).rings)
    expect(orbForm(999).rings).toBe(orbForm(MAX_MAJOR).rings)
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => orbForm(bad)).not.toThrow()
      expect(orbForm(bad).rings).toBeGreaterThan(0)
    }
    // 每一境的形态都与它所在界域一致
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      expect(orbForm(m).rings, `第 ${m} 境的环数与该界域不符`).toBe(orbForm(worldOf(m).start).rings)
    }
  })

  it('说法由界域名推出,不另写文案', () => {
    for (const w of WORLDS) {
      expect(orbForm(w.start).label).toBe(`${w.name}法球`)
      // 说法由界域名推出,不另写一份文案
      expect(orbForm(w.end).label, '同一界域内各境的说法应一致').toBe(orbForm(w.start).label)
    }
  })
})

describe('法球形制 · 二、组件接上了', () => {
  it('环、粒子、八卦环三处都按形态生成', () => {
    expect(ORB, '环数没有按形态生成').toContain('v-for="i in ringCount"')
    expect(ORB, '粒子数没有按形态生成').toContain('v-for="i in particleCount"')
    expect(ORB, '八卦环没有按形态开关').toMatch(/v-if="form\.bagua"/)
    // 环的类名按序号拼,不在模板里写死 ring-a / ring-b / ring-c
    expect(ORB, '环的类名还写死着').not.toContain('class="rot-ring ring-a"')
    expect(ORB, '环的类名该按序号拼').toContain('`rot-ring--${i}`')
  })

  it('四圈全在法球方框之内 —— 负 inset 会被首页那张 overflow-hidden 的卡切掉', () => {
    for (const n of [1, 2, 3, 4]) {
      const m = new RegExp(`\\.rot-ring--${n} \\{([\\s\\S]*?)\\n  \\}`).exec(ORB)
      expect(m, `缺 .rot-ring--${n}`).not.toBeNull()
      const inset = /inset:\s*([^;]+);/.exec(m![1]!)
      expect(inset, `.rot-ring--${n} 没有 inset`).not.toBeNull()
      // 负的 inset 会把圈画到法球方框之外;--orb-k 里的连字符不算
      const value = inset![1]!.replace(/var\(--[a-z-]+,?\s*[^)]*\)/g, 'V')
      expect(value, `.rot-ring--${n} 的 inset 把圈画到了法球框外:${inset![1]}`).not.toMatch(/(^|[\s(])-\d/)
    }
  })

  it('由内到外四圈都看得见,只是依次淡一档', () => {
    const alphas: number[] = []
    for (const n of [1, 2, 3, 4]) {
      const m = new RegExp(`\\.rot-ring--${n} \\{([\\s\\S]*?)\\n  \\}`).exec(ORB)
      const a = /border-color:[^/]*\/\s*([\d.]+)\)/.exec(m![1]!)
      expect(a, `.rot-ring--${n} 没有透明度`).not.toBeNull()
      alphas.push(Number(a![1]))
    }
    // 由内到外递减:「又上一层」的记号不该与第一圈一样重
    for (let i = 1; i < alphas.length; i += 1) {
      expect(alphas[i]!, `第 ${i + 1} 圈比内圈还重`).toBeLessThan(alphas[i - 1]!)
    }
    // 但压在一个窄区间:四圈都得看得见,「谁更重」只是第二件事。
    // 基础透明度 0.7 会把色再压一次,色本身低于 0.3 时最外圈在夜主题上就没了。
    expect(Math.min(...alphas), `最外那圈只有 ${Math.min(...alphas)},夜主题上看不见`).toBeGreaterThanOrEqual(0.3)
    expect(Math.max(...alphas) - Math.min(...alphas), '四圈的轻重差拉得太大,最外两圈会消失').toBeLessThan(0.2)
  })

  it('粒子角度按实际粒数均分 —— 写死 12 会让仙界之后挤在一侧', () => {
    expect(ORB, '粒子角度仍按常数均分').not.toContain('(index / 12)')
    expect(ORB, '粒子角度该按实际粒数均分').toContain('(index / total)')
  })

  it('中心符由界域给:槽位仍可覆盖,但两个宿主页都交给界域', () => {
    // 槽位保留 —— 日后要往球心塞别的东西不必改组件
    expect(ORB, '中心符没有从形态取').toContain('<slot>{{ form.glyph }}</slot>')
    // 但两个宿主页此前各写死了一个字(☯ / 道),那会让四界共享同一枚中心符
    expect(HOME, '首页仍在覆盖中心符 —— 四界会共用同一个字').not.toMatch(/<CultivationOrb[^>]*>\s*<span/)
    expect(CULTIVATION, '修炼页仍在覆盖中心符 —— 四界会共用同一个字').not.toMatch(/<CultivationOrb[^>]*>\s*<span/)
    // 四个中心符两两不同,且都是界域身份的字
    const glyphs = formsOfFourWorlds().map(f => f.glyph)
    expect(new Set(glyphs).size, `四界的中心符有重复:${glyphs.join('')}`).toBe(glyphs.length)
    for (const g of glyphs) expect([...g]).toHaveLength(1)
  })

  it('两个宿主页都把当前境界传进来 —— 不传的话永远停在人间界', () => {
    expect(HOME, '首页没有把境界传给法球').toContain(':major="player.major"')
    expect(CULTIVATION, '修炼页没有把境界传给法球').toContain(':major="player.major"')
  })

  it('八卦环仍是装饰,整层不进读屏', () => {
    // 与 ui/orbDecorative.spec 分工:那边钉既有三条,这里只钉新加的那层随形态开关
    const m = /<div v-if="form\.bagua" class="bagua-wrap[^"]*"([^>]*)>/.exec(ORB)
    expect(m, '八卦环不见了').not.toBeNull()
    expect(m![1], '八卦环丢了 aria-hidden').toContain('aria-hidden="true"')
    // 环层与粒子层仍不带 role / aria-label
    for (const cls of ['particle-ring', 'ring-layer']) {
      const at = ORB.indexOf(`class="${cls}"`)
      expect(at, `${cls} 不见了`).toBeGreaterThan(-1)
      const tag = ORB.slice(Math.max(0, ORB.lastIndexOf('<', at)), ORB.indexOf('>', at) + 1)
      expect(tag, `${cls} 上不该挂 role / aria-label`).not.toMatch(/role=|aria-label=/)
    }
  })

  it('减少动效仍受管 —— 形态差异全在静态层,不靠动画分家', () => {
    // 环数 / 粒子数 / 八卦环的有无都是静态的;动画只是加成
    expect(formsOfFourWorlds()[0]!.rings).toBeGreaterThan(0)
    // style.css 里那两块仍在(与 ui/reducedMotion.spec 同一份判据,这里只做交叉确认)
    const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(CSS).toContain('.reduce-motion *')
  })
})
