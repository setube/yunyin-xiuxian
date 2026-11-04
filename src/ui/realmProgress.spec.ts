/**
 * 秘境进度形制。
 *
 * 秘境是「出则散」的一次性内容:三层、败两次即被逐出。
 * 而界面上这两样都只是数字:「第 2/3 层」一行、「已败 1 场 · 再败 1 场逐出」一行。
 * 要不要再入一层,取决于「还差几层见底」与「还能败几次」—— 两个都该是可数的形制。
 *
 * 四条判据:
 *   一 门槛全部取自 data/secretRealms 的既有常量,不另立。
 *   二 层数是「已得」,败场是「剩余」—— 两套读数方向相反,形状也须不同。
 *   三 坏值不产生负格或超长数组。
 *   四 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SECRET_LAYERS, SECRET_MAX_LOSSES } from '@/data/secretRealms'
import { realmLayerPips, realmLifePips, realmProgress } from './realmProgress'

const ROOT = resolve(__dirname, '../..')
const CARD = readFileSync(resolve(ROOT, 'src/components/adventure/SecretRealmCard.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('秘境进度 · 一、门槛取自数据表', () => {
  it('总层数与败场上限就是 data 里的常量', () => {
    const m = realmProgress(1, 0)
    expect(m.layers).toBe(SECRET_LAYERS)
    expect(m.maxLosses).toBe(SECRET_MAX_LOSSES)
    expect(realmLayerPips(m)).toHaveLength(SECRET_LAYERS)
    expect(realmLifePips(m)).toHaveLength(SECRET_MAX_LOSSES)
  })

  it('还差几层见底按总层数现算', () => {
    expect(realmProgress(1, 0).toEnd).toBe(SECRET_LAYERS - 1)
    expect(realmProgress(SECRET_LAYERS, 0).toEnd).toBe(0)
    expect(realmProgress(SECRET_LAYERS, 0).deepest).toBe(true)
  })

  it('还能败几次按上限现算', () => {
    expect(realmProgress(1, 0).livesLeft).toBe(SECRET_MAX_LOSSES)
    expect(realmProgress(1, 1).livesLeft).toBe(SECRET_MAX_LOSSES - 1)
    expect(realmProgress(1, SECRET_MAX_LOSSES).livesLeft).toBe(0)
  })
})

describe('秘境进度 · 二、两套读数方向相反', () => {
  it('层数是「已得」:层数越深,实心越多', () => {
    for (let lv = 1; lv <= SECRET_LAYERS; lv += 1) {
      expect(realmLayerPips(realmProgress(lv, 0)).filter(Boolean)).toHaveLength(lv)
    }
  })

  it('败场是「剩余」:败得越多,实心越少', () => {
    for (let lost = 0; lost <= SECRET_MAX_LOSSES; lost += 1) {
      expect(realmLifePips(realmProgress(1, lost)).filter(Boolean)).toHaveLength(SECRET_MAX_LOSSES - lost)
    }
  })

  it('层数与败场的实心数恰好相反 —— 把「还能败一次」读成「已经败一次」是致命的', () => {
    // 一层未败:层数 1 实心,败场 2 实心(满)
    const m = realmProgress(1, 0)
    expect(realmLayerPips(m).filter(Boolean)).toHaveLength(1)
    expect(realmLifePips(m).filter(Boolean)).toHaveLength(SECRET_MAX_LOSSES)
    // 两层败一次:层数 2 实心,败场只剩 1
    const n = realmProgress(2, 1)
    expect(realmLayerPips(n).filter(Boolean)).toHaveLength(2)
    expect(realmLifePips(n).filter(Boolean)).toHaveLength(1)
  })
})

describe('秘境进度 · 三、坏值夹回', () => {
  it('越界与坏值夹到合法区间,不产生负格或超长数组', () => {
    const cases: [number, number][] = [
      [-3, -3],
      [99, 99],
      [Number.NaN, Number.NaN],
      [1, 99],
      [99, 0]
    ]
    for (const [lv, lost] of cases) {
      const m = realmProgress(lv, lost)
      expect(m.layer).toBeGreaterThanOrEqual(0)
      expect(m.layer).toBeLessThanOrEqual(m.layers)
      expect(m.losses).toBeGreaterThanOrEqual(0)
      expect(m.losses).toBeLessThanOrEqual(m.maxLosses)
      expect(realmLayerPips(m)).toHaveLength(m.layers)
      expect(realmLifePips(m)).toHaveLength(m.maxLosses)
      expect(m.livesLeft).toBeGreaterThanOrEqual(0)
    }
  })

  it('层数为 0 也算合法(刚进未战)', () => {
    const m = realmProgress(0, 0)
    expect(realmLayerPips(m).filter(Boolean)).toHaveLength(0)
    expect(m.deepest).toBe(false)
  })
})

describe('秘境进度 · 四、界面接上了', () => {
  it('秘境卡读 realmProgress 并渲染两套刻度', () => {
    expect(CARD, '秘境卡没接 realmProgress').toContain('realmProgress(')
    expect(CARD, '没渲染层数刻度').toContain('realm-layer-pips')
    expect(CARD, '没渲染败场刻度').toContain('realm-life-pips')
  })

  it('两套刻度都给读屏名 —— 几个小点对面是盲的', () => {
    expect(CARD).toContain('`还能败 ${progress.livesLeft} 场`')
    expect(CARD).toContain('/${progress.layers} 层')
  })

  it('两套刻度的形状不同 —— 方向相反的读数不该长得一样', () => {
    const layer = block('.realm-layer-pips i')
    const life = block('.realm-life-pips i')
    expect(layer, '层数用圆点').toContain('border-radius: 999px')
    expect(life, '败场该用别的形状').not.toContain('border-radius: 999px')
  })

  it('形制层不吃指针事件', () => {
    expect(block('.realm-layer-pips,\n.realm-life-pips')).toContain('pointer-events: none')
  })

  it('形制只取既有语义 token', () => {
    const from = CSS.indexOf('.realm-layer-pips,')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
    // 其余用 currentColor(文本色已由外层类给)
    expect(seg).toContain('currentColor')
  })
})
