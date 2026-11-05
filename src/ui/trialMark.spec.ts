/**
 * 天道试炼形制:三场试炼此前只有一枚共用金印,「这场难在哪」得逐条读规则。
 *
 * 四条判据:
 *   一 三个可数的量各有一件形制:战纹(连战几场)、恢复档(全满/部分/无)、层阶(锚点)。
 *   二 恢复档的阈值与 trialChallenge 里 healBetweenPct 的用法同源,不引入第三个数。
 *   三 层阶两端取三场试炼的最小/最大,不写死 23 与 30 —— 增删试炼时刻度自动跟上。
 *   四 界面真的接上了,且三件形制都是装饰(读屏靠 aria-label 报「连战 N 场 · 场间…」)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TRIALS } from '@/data/endgame'
import { RECOVERY_LABEL, TRIAL_FIGHT_CAP, recoveryOf, tierPosition, tierSpan, trialMark, trialMarks } from './trialMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const PANEL = readFileSync(resolve(ROOT, 'src/components/celestial/TrialPanel.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('试炼形制 · 一、三个可数的量各有形制', () => {
  it('三场试炼都取得到形制,且战数各不相同', () => {
    const marks = trialMarks()
    expect(marks.length).toBe(TRIALS.length)
    const fights = marks.map(m => m.fights)
    expect(new Set(fights).size, `战数重复:${fights.join(' / ')} —— 三场读起来就一样了`).toBe(fights.length)
  })

  it('战纹不超过封顶,坏值退回 1 枚', () => {
    for (const m of trialMarks()) {
      expect(m.fights).toBeGreaterThanOrEqual(1)
      expect(m.fights).toBeLessThanOrEqual(TRIAL_FIGHT_CAP)
    }
    const bogus = { ...TRIALS[0]!, fights: Number.NaN }
    expect(trialMark(bogus).fights).toBe(1)
    const huge = { ...TRIALS[0]!, fights: 99 }
    expect(trialMark(huge).fights).toBe(TRIAL_FIGHT_CAP)
  })

  it('说法复用卡面措辞,拼成「试炼 · 连战 N 场 · 场间…」', () => {
    const m = trialMark(TRIALS[0]!)
    expect(m.label).toBe(`${TRIALS[0]!.name} · 连战 ${TRIALS[0]!.fights} 场 · ${RECOVERY_LABEL[m.recovery]}`)
  })
})

describe('试炼形制 · 二、恢复档靠形状,阈值不另立', () => {
  it('三档划分:≥1 全满、>0 部分、0 不回', () => {
    expect(recoveryOf(1)).toBe('full')
    expect(recoveryOf(0.3)).toBe('partial')
    expect(recoveryOf(0)).toBe('none')
    expect(recoveryOf(Number.NaN)).toBe('none')
  })

  it('三场试炼覆盖两档以上(不回与部分都有实例)', () => {
    const tiers = new Set(trialMarks().map(m => m.recovery))
    expect(tiers.has('none')).toBe(true)
    expect(tiers.has('partial') || tiers.has('full')).toBe(true)
  })

  it('三档各有样式,且靠实心程度区分而非新色相', () => {
    // 部分档写在 nth-child 上(前三枚里只填两枚),故按各自的实际选择器取
    expect(block('.trial-recover--full i'), '全满应实心').toContain('background')
    expect(CSS, '部分档应有自己的规则').toContain('.trial-recover--partial i:nth-child(1)')
    expect(block('.trial-recover--none i'), '不回应空心').toContain('transparent')
    // 三档只用到 jade / cinnabar 两个既有 token,不新造色
    const rule = CSS.slice(CSS.indexOf('.trial-recover--full'), CSS.indexOf('/* 层阶刻度'))
    for (const m of rule.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['jade', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})

describe('试炼形制 · 三、层阶两端从数据现算', () => {
  it('最低那场为 0、最高那场为 1', () => {
    const tiers = TRIALS.map(t => t.anchorTier)
    expect(tierPosition(Math.min(...tiers))).toBe(0)
    expect(tierPosition(Math.max(...tiers))).toBe(1)
  })

  it('两端不写死:模块里读的是 TRIALS 的 min/max', () => {
    const src = readFileSync(resolve(ROOT, 'src/ui/trialMark.ts'), 'utf-8')
    expect(src, '层阶两端应由 TRIALS 现算').toContain('Math.min(...tiers)')
    expect(src, '层阶两端应由 TRIALS 现算').toContain('Math.max(...tiers)')
    expect(src, '不该写死 23 与 30').not.toMatch(/anchorTier\s*-\s*23/)
  })

  it('越界与坏值夹进 0~1', () => {
    expect(tierPosition(-99)).toBe(0)
    expect(tierPosition(999)).toBe(1)
    expect(tierPosition(Number.NaN)).toBe(0)
  })
})

describe('试炼形制 · 三之二、轴两端的标签', () => {
  it('两端与 tierPosition 同一份取法,不另数一遍', () => {
    const tiers = TRIALS.map(t => t.anchorTier)
    const span = tierSpan()
    expect(span.lo).toBe(Math.min(...tiers))
    expect(span.hi).toBe(Math.max(...tiers))
    // 落在两端的场次,位置恰好是 0 与 1 —— 标签与点同源
    expect(tierPosition(span.lo)).toBe(0)
    expect(tierPosition(span.hi)).toBe(1)
  })

  it('两端不会写死在 UI 里', () => {
    const panel = readFileSync(resolve(ROOT, 'src/components/celestial/TrialPanel.vue'), 'utf-8')
    expect(panel, '两端的数该从 tierSpan 取').toContain('tierLimits')
    expect(panel, '不许把 23 当最低阶写死').not.toMatch(/>\s*23\s*</)
  })

  it('卡面上真画了两个端点', () => {
    const panel = readFileSync(resolve(ROOT, 'src/components/celestial/TrialPanel.vue'), 'utf-8')
    expect(panel).toContain('tierLimits.lo')
    expect(panel).toContain('tierLimits.hi')
  })
})

describe('试炼形制 · 四、界面接上了', () => {
  /**
   * 形制仍在，但落点从「模板里反复调」搬到了「setup 里算一次」。
   *
   * `TRIALS` 是静态数据、`trialMark` 是纯函数，原先一个渲染周期要调 7 次。
   * 判据跟着落点走：三样形制都必须来自那一次预计算，模板不许再自己调。
   */
  it('战纹、恢复档、层阶三样都画出来了', () => {
    expect(PANEL, '应挂战纹').toContain('trial-fights')
    expect(PANEL, '应挂恢复档').toContain('trial-recover--${row.mark.recovery}')
    expect(PANEL, '应挂层阶刻度').toContain('trial-tier')
    expect(PANEL, '层阶位置应现算').toContain('tierPosition(mark.tier)')
  })

  it('战纹只画这一场真有的枚数,不画满封顶留空槽', () => {
    // 它说的是「连战几场」而不是「还剩几场」:画满七格留空槽会读成「还差几场打满」
    expect(PANEL, '战纹枚数应取这一场的战数').toContain('v-for="n in row.mark.fights"')
    expect(PANEL, '不该再按封顶画满').not.toContain('v-for="n in TRIAL_FIGHT_CAP"')
  })

  it('形制是装饰:战纹与恢复档带可念的说法,层阶 aria-hidden', () => {
    expect(PANEL, '战纹应有可访问名').toContain(':aria-label="row.mark.label"')
    expect(PANEL, '恢复档应有可访问名').toContain(':aria-label="row.recoveryLabel"')
    expect(PANEL, '层阶是纯装饰').toMatch(/trial-tier[\s\S]{0,160}aria-hidden="true"/)
  })

  it('预计算只算一次 —— 模板里不再逐行调纯函数', () => {
    expect(PANEL, '应在 setup 里算一次').toContain('const mark = trialMark(t)')
    const tpl = PANEL.slice(0, PANEL.indexOf('<script'))
    expect(tpl, '模板不该再调 trialMark').not.toContain('trialMark(')
  })

  it('三样都不吃指针事件', () => {
    for (const sel of ['.trial-fights', '.trial-recover', '.trial-tier']) {
      expect(block(sel), `${sel} 须 pointer-events: none`).toContain('pointer-events: none')
    }
  })
})
