/**
 * 界域印记的判据。
 *
 * 这一层存在的理由:四个界域在界面上此前只有一处身份 —— 界域名那串灰字,
 * 字号比正文还小,四界长得一模一样。而界域是这一局最大的分层:
 * 寿元跨一次界翻几十上百倍、内容 gate 全按界域切、飞升是整局最重的里程碑之一。
 *
 * 四条:
 *   一 四界各一枚,印面单字与框形都两两不同 —— 只靠色的话,墨与紫在夜主题的
 *     卡片底上 ΔE 只有十几,12px 的印上读不出差。
 *   二 名与色都转发既有事实源(data/realms 的界域名、语义色 token),不手抄。
 *   三 跃升只认跨界那一境 —— 每境都算「跃升」,这个词就不再是跃升。
 *   四 界面真的接上了,且形制不吃指针事件、不进读屏。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { worldLeap, worldMark, type WorldFrame } from './worldMark'
import { REALMS, WORLDS, MAX_MAJOR, worldOf } from '@/data/realms'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const SEAL = readFileSync(resolve(ROOT, 'src/components/common/WorldSeal.vue'), 'utf-8')
const CODEX = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')
const ADVENTURE = readFileSync(resolve(ROOT, 'src/views/AdventureView.vue'), 'utf-8')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/cultivation/BreakthroughResultDialog.vue'), 'utf-8')
const BREAKTHROUGH = readFileSync(resolve(ROOT, 'src/core/breakthrough.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('界域印记 · 一、四界各一枚,形状分得开', () => {
  it('四个界域都有印,印面单字两两不同', () => {
    const marks = WORLDS.map(w => worldMark(w.id))
    for (const [i, m] of marks.entries()) {
      expect(m, `第 ${i} 个界域没有印`).not.toBeNull()
    }
    const seals = marks.map(m => m!.seal)
    expect(new Set(seals).size, `印面单字有重复:${seals.join('')}`).toBe(seals.length)
    // 单字:一个字的印才叫印
    for (const s of seals) expect([...s]).toHaveLength(1)
  })

  it('框形两两不同 —— 灰度与色弱下靠形状分家', () => {
    const frames = WORLDS.map(w => worldMark(w.id)!.frame)
    expect(new Set(frames).size, `框形有重复:${frames.join(' / ')}`).toBe(frames.length)
  })

  it('四种框形在 CSS 里各有一套声明', () => {
    const all: WorldFrame[] = ['single', 'double', 'bold', 'round']
    for (const f of all) {
      const body = block(`.world-seal-mark--${f}`)
      expect(body, `缺 .world-seal-mark--${f}`).not.toBe('')
    }
    // 圆印须真的圆:四角与方印分得开靠这一句
    expect(block('.world-seal-mark--round'), '圆印没有圆角就与方印同形').toMatch(/border-radius:\s*999px/)
    // 粗线须真的更粗
    expect(block('.world-seal-mark--bold'), '粗线印没有 2px 边').toMatch(/border:\s*2px/)
    // 双线须有两层边
    expect(block('.world-seal-mark--double'), '双线印没有两道内影').toMatch(/inset[\s\S]*inset/)
  })

  it('界域名与色都转发既有事实源,不手抄', () => {
    for (const w of WORLDS) {
      const m = worldMark(w.id)!
      expect(m.name, `界域名应与 data/realms 一致`).toBe(w.name)
      expect(m.label).toBe(w.name)
      // 色只许是既有语义 token,不许裸 hex(与 palette.spec 同一条)
      expect(m.tone, `${w.name} 的印色不是语义 token`).toMatch(/^var\(--color-[a-z-]+\)$/)
    }
  })

  it('认不出的界域 id 返回 undefined,不画一份假的', () => {
    expect(worldMark('ghost')).toBeUndefined()
    expect(worldMark('')).toBeUndefined()
    expect(worldMark('void')).toBeUndefined()
  })
})

describe('界域印记 · 二、跃升只认跨界那一境', () => {
  it('三个跨界入口都是跃升,人间界入口(炼气)不是', () => {
    const entries = WORLDS.filter(w => w.start > 0).map(w => w.start)
    expect(entries).toHaveLength(3)
    for (const m of entries) {
      const leap = worldLeap(m)
      expect(leap, `第 ${m} 境是跨界入口,却没有跃升`).toBeDefined()
      expect(leap!.to.id).toBe(worldOf(m).id)
      expect(leap!.from.id).toBe(worldOf(m - 1).id)
      expect(leap!.from.id).not.toBe(leap!.to.id)
    }
    expect(worldLeap(0), '炼气是起点,不是跃升').toBeUndefined()
  })

  it('同界域内的大关与小进阶都不是跃升', () => {
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      if (worldOf(m).start === m) continue
      expect(worldLeap(m), `第 ${m} 境不是跨界入口`).toBeUndefined()
    }
  })

  it('倍数取自 REALMS 的寿元表,与「寿元增至」同一份数', () => {
    for (const w of WORLDS.filter(x => x.start > 0)) {
      const leap = worldLeap(w.start)!
      const expected = Math.max(1, Math.round(REALMS[w.start]!.lifespanYears / REALMS[w.start - 1]!.lifespanYears))
      expect(leap.factor, `${w.name} 的寿元倍数与寿元表对不上`).toBe(expected)
      // 跨界是「大跃」:倍数必须显著大于一,否则这一层没有存在意义
      expect(leap.factor, `${w.name} 的跃升不显著(${leap.factor}×)`).toBeGreaterThan(2)
    }
  })

  it('坏值不抛错,也不给出跃升', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5, 999]) {
      expect(() => worldLeap(bad)).not.toThrow()
    }
    expect(worldLeap(Number.NaN)).toBeUndefined()
  })
})

describe('界域印记 · 三、界面接上了,且守既有纪律', () => {
  it('境界谱与历练分组都挂了同一枚印', () => {
    expect(CODEX, '境界谱没有界域印').toContain('<WorldSeal')
    expect(CODEX, '境界谱的印缺 import').toContain("import WorldSeal from '@/components/common/WorldSeal.vue'")
    expect(ADVENTURE, '历练分组没有界域印').toContain('<WorldSeal')
    expect(ADVENTURE, '历练分组的印缺 import').toContain("import WorldSeal from '@/components/common/WorldSeal.vue'")
  })

  it('印是装饰:整枚 aria-hidden,界域名由旁边的文字报出', () => {
    expect(SEAL, '界域印没有 aria-hidden —— 读屏会把印上的单字再念一遍').toContain('aria-hidden="true"')
    // 界域名在调用点仍然是一段真文字
    expect(CODEX, '界域名被印取代了').toContain('{{ row.world.name }}')
    expect(ADVENTURE, '界域名被印取代了').toContain('{{ group.world.name }}')
  })

  it('形制基类不吃指针事件 —— 与 set-crest / dao-crest 同规', () => {
    const base = block('.world-seal-mark')
    expect(base, '界域印会让点击落在装饰上').toContain('pointer-events: none')
  })

  it('组件里不写裸 hex —— 色由调用点注入的 --world-tone 承载', () => {
    expect(SEAL, '印面底色应走 token').not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(SEAL, '印色应由 --world-tone 注入').toContain('--world-tone')
    expect(CSS, '印色变量在 CSS 里应有兜底').toContain('var(--world-tone')
  })
})

describe('界域印记 · 四、飞升那一刻', () => {
  it('跨界成功时把跃升一并交给弹窗', () => {
    expect(BREAKTHROUGH, '突破结算没有算跃升').toContain('worldLeap(')
    expect(BREAKTHROUGH, '跃升没有挂进结果').toMatch(/leap\s*\?/)
    // 只认跨界入口:同界域的大关不许也挂一个「跃升」
    expect(BREAKTHROUGH, '跃升应由 crossedWorld 把关').toMatch(/crossedWorld\s*\?\s*worldLeap\(/)
  })

  it('弹窗真的画了那一段,且写清三样事实', () => {
    expect(DIALOG, '弹窗没有画跃升').toContain('world-leap')
    expect(DIALOG, '跃升缺少离开的界域').toContain('view.leap.from.name')
    expect(DIALOG, '跃升缺少进入的界域').toContain('view.leap.to.name')
    expect(DIALOG, '跃升缺少倍数').toContain('view.leap.factor')
    // 读屏一句话报全
    expect(DIALOG, '跃升缺读屏说法').toContain('leapLabel')
    expect(DIALOG, '读屏说法须是 rolable 的').toMatch(/role="img"[^>]*:aria-label="leapLabel"/)
  })

  it('跃升的文案不劝不解释 —— 只有界域名与倍数', () => {
    const banned = ['请', '可以', '建议', '恭喜', '快去', '不妨', '终于']
    for (const w of banned) {
      expect(DIALOG, `跃升段落里出现了「${w}」`).not.toContain(w)
    }
  })

  it('跃升段的底色走条槽 token,不另立一套', () => {
    const body = block('.world-leap')
    expect(body, '跃升段缺样式').not.toBe('')
    expect(body, '跃升段底色应走墨色通道变量').toContain('rgb(var(--color-ink-rgb)')
    expect(body, '跃升段不吃指针事件').toContain('pointer-events: none')
  })
})
