/**
 * 卦画形制。
 *
 * 卦画原来是六行文字条(「▬▬▬」「▬ ▬ ○ 动」),而且**自上而下照着 lines 数组铺**:
 *   lines 自下而上(初爻在前),页面却从头往下排 —— 整幅卦画是倒着的。
 *   「下卦为身、上卦为境」这句话,在倒着的图上正好读反。
 *   之卦更只剩一个卦名,卦象本身没有画出来 —— 事要从哪里转,看不见。
 *
 * 判据:
 *   一 次序:初爻在下、上爻在上;页面照返回序直接铺就是正的。
 *   二 爻题:阳称九、阴称六;初与上把位名放前(初九、上六),其余放后(九二、六三)。
 *   三 动爻:○ 为老阳、× 为老阴,与「三背/零背为动爻」的摇法一致;不动无记号。
 *   四 之卦:由动爻反向得出,与 reading.changed 同源,不另算一卦。
 *   五 外卦在上、内卦在下,与「下卦为身、上卦为境」对得上。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HEXAGRAMS, TRIGRAMS } from '@/data/yijing'
import { readingOfLines } from '@/core/divination'
import { changedLines, hexFigure, hexLines, hexagramLines, movingCount } from './hexagramFigure'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/RealmCodexView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

/** 既济:下离(1,0,1) 上坎(0,1,0) */
const JIJI = [1, 0, 1, 0, 1, 0]

describe('卦画 · 一、次序不再倒竖', () => {
  it('自上而下:上爻在前,初爻在末 —— 页面照此序铺就是正的', () => {
    const lines = hexLines(JIJI, [])
    expect(lines.map(l => l.position)).toEqual([6, 5, 4, 3, 2, 1])
    expect(lines[0]!.label).toBe('上六')
    expect(lines[5]!.label).toBe('初九')
  })

  it('传进来的六爻仍是自下而上 —— 与 core/divination 同一口径,不在入口处又翻一次', () => {
    const lines = hexLines([1, 1, 1, 0, 0, 0], [])
    // 自下而上:下乾上坤 = 否;倒过来读会变成泰
    expect(lines.filter(l => l.yang).every(l => l.position <= 3)).toBe(true)
    expect(lines.filter(l => !l.yang).every(l => l.position >= 4)).toBe(true)
  })

  it('六爻一个不少,位次 1~6 不重不丢', () => {
    const lines = hexLines(JIJI, [])
    expect(new Set(lines.map(l => l.position)).size).toBe(6)
  })
})

describe('卦画 · 二、爻题依古法', () => {
  it('阳称九、阴称六;初与上把位名放前,中间四爻放后', () => {
    const labels = hexLines(JIJI, []).map(l => l.label)
    // 自上而下:上六、九五、六四、九三、六二、初九
    expect(labels).toEqual(['上六', '九五', '六四', '九三', '六二', '初九'])
  })

  it('六爻皆阳取乾:初九、九二、九三、九四、九五、上九', () => {
    const labels = hexLines([1, 1, 1, 1, 1, 1], []).map(l => l.label).reverse()
    expect(labels).toEqual(['初九', '九二', '九三', '九四', '九五', '上九'])
  })

  it('六爻皆阴取坤:初六、六二、六三、六四、六五、上六', () => {
    const labels = hexLines([0, 0, 0, 0, 0, 0], []).map(l => l.label).reverse()
    expect(labels).toEqual(['初六', '六二', '六三', '六四', '六五', '上六'])
  })
})

describe('卦画 · 三、动爻古记号', () => {
  it('阳动记 ○,阴动记 × —— 与三背/零背为动爻同一套摇法', () => {
    const lines = hexLines(JIJI, [2, 5])
    expect(lines.find(l => l.position === 2)!.yang).toBe(false)
    expect(lines.find(l => l.position === 2)!.mark).toBe('×')
    expect(lines.find(l => l.position === 5)!.yang).toBe(true)
    expect(lines.find(l => l.position === 5)!.mark).toBe('○')
  })

  it('不动之爻没有记号,也不许给一个空格假装有', () => {
    for (const l of hexLines(JIJI, [2])) {
      if (l.position !== 2) expect(l.mark).toBe('')
    }
  })

  it('动爻数与 changingAt 一致 —— 「动爻越多,卦力越盛」那句有据', () => {
    expect(movingCount(hexLines(JIJI, [1, 3, 6]))).toBe(3)
    expect(movingCount(hexLines(JIJI, []))).toBe(0)
  })
})

describe('卦画 · 四、之卦与 reading 同源', () => {
  it('动爻反向即之卦之爻,与 reading.changed 一致', () => {
    const reading = readingOfLines(JIJI, [2, 5])!
    expect(reading.changed).not.toBeNull()
    const fig = hexFigure(reading)
    expect(fig.changed).not.toBeNull()
    // 本卦与之卦只在动爻位不同,其余四爻同
    const a = fig.lines
    const b = fig.changed!
    for (const [i, line] of a.entries()) {
      if (line.changing) expect(b[i]!.yang).toBe(!line.yang)
      else expect(b[i]!.yang).toBe(line.yang)
    }
  })

  it('六爻不动就没有之卦 —— 不编一列空卦画', () => {
    const reading = readingOfLines(JIJI, [])!
    expect(reading.changed).toBeNull()
    expect(hexFigure(reading).changed).toBeNull()
  })

  it('之卦之爻的位次与爻题按反向后的阴阳重算', () => {
    const changed = changedLines(JIJI, [5])
    // 九五(阳)动成阴 → 六五
    expect(changed.find(l => l.position === 5)!.label).toBe('六五')
    expect(changed.find(l => l.position === 5)!.yang).toBe(false)
  })

  it('之卦不带动爻记号 —— 动已在本卦那一列标过', () => {
    for (const l of changedLines(JIJI, [1, 2, 3, 4, 5, 6])) expect(l.mark).toBe('')
  })
})

describe('卦画 · 五、外卦在上、内卦在下', () => {
  it('上三爻属外卦,下三爻属内卦 —— 与「下卦为身、上卦为境」对得上', () => {
    const lines = hexLines(JIJI, [])
    expect(lines.slice(0, 3).every(l => l.part === 'upper')).toBe(true)
    expect(lines.slice(3).every(l => l.part === 'lower')).toBe(true)
  })

  it('内卦三爻的阴阳,就是数据表里那个单卦的爻', () => {
    // 下离 = (1,0,1);自上而下排是本卦最后三行,倒回自下而上再比
    const lower = hexLines(JIJI, []).filter(l => l.part === 'lower').reverse()
    const li = TRIGRAMS.find(t => t.id === 'li')!
    expect(lower.map(l => (l.yang ? 1 : 0))).toEqual([...li.lines])
  })

  it('外卦三爻的阴阳,就是数据表里那个单卦的爻', () => {
    const upper = hexLines(JIJI, []).filter(l => l.part === 'upper').reverse()
    const kan = TRIGRAMS.find(t => t.id === 'kan')!
    expect(upper.map(l => (l.yang ? 1 : 0))).toEqual([...kan.lines])
  })
})

describe('卦画 · 六、界面与形制', () => {
  it('模板按 hexFigure 铺,不再自己把 lines 正序排一遍', () => {
    expect(VIEW).toContain('hexFigure')
    expect(VIEW).toMatch(/v-for="line in figure\.lines"/)
    // 倒竖的根源:正序铺 lines 数组
    expect(VIEW).not.toMatch(/v-for="\(bar, i\) in drawnLines"/)
  })

  it('本卦与之卦并排,各画各的六爻', () => {
    expect(VIEW).toMatch(/v-for="line in figure\.changed"/)
    expect(VIEW).toContain('hex-figure')
  })

  it('盘面不吃指针事件,整幅卦画的读法留给 aria-label', () => {
    expect(block('.hex-figure')).toContain('pointer-events: none')
    expect(VIEW).toContain(':aria-label="figureAria"')
  })

  it('阳爻一条实线、阴爻两段 —— 形状本身分得开,不靠颜色', () => {
    expect(VIEW).toContain('hex-line__bar--yin')
    // 阴爻的断口就是形制:两段之间的空隙,与阳爻整条相对
    expect(block('.hex-line__bar--yin')).toContain('gap:')
    expect(VIEW).toMatch(/<template v-else><i \/><i \/><\/template>/)
  })

  it('动爻另有一档形制,在一列六爻里认得出', () => {
    const moving = block('.hex-line--moving .hex-line__bar')
    expect(moving).toContain('cinnabar')
    const seg = CSS.slice(CSS.indexOf('.hex-figure {'), CSS.indexOf('/* =================', CSS.indexOf('.hex-figure {')))
    // 六爻里只有动爻带色 —— 其余爻走墨色,一列里唯一有色那爻就是动爻
    expect(seg.match(/cinnabar/g)?.length, '只有动爻与 ○ × 记号带朱').toBeLessThanOrEqual(3)
  })

  it('盘面只取既有语义 token', () => {
    const from = CSS.indexOf('.hex-figure {')
    expect(from, 'style.css 里找不到 .hex-figure').toBeGreaterThan(-1)
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['ink', 'ink-faint', 'cinnabar'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })

  it('字色不叠透明度 —— 9px 小字半透明墨在纸上只有 2:1,读不清', () => {
    const from = CSS.indexOf('.hex-figure {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    // 只许整色 token:rgb(var(--color-x-rgb) / a) 这种写法一个都不许有
    expect(seg, '卦画的字与爻线都走整色 token').not.toMatch(/rgb\(var\(--color-[a-z-]+-rgb\)\s*\//)
  })

  it('本卦与之卦同形 —— 易里两幅卦象地位相当,不靠压淡哪一幅分主次', () => {
    const seg = CSS.slice(CSS.indexOf('.hex-figure {'), CSS.indexOf('/* =================', CSS.indexOf('.hex-figure {')))
    // 只有动爻那一档带色;之卦没有自己的颜色档
    expect(seg, '之卦不该另有一档色').not.toContain('.hex-line--changed .hex-line__bar')
    expect(VIEW, '模板上之卦与本卦走同一套 hex-line').toContain('class="hex-line hex-line--changed"')
  })
})

describe('卦画 · 七、谱表里的重卦', () => {
  it('上卦三爻在上、下卦三爻在下 —— 一眼认得出是哪一卦', () => {
    // 乾上坤下 = 否;倒过来说成坤上乾下就成了泰
    const qian = TRIGRAMS.find(t => t.id === 'qian')!
    const kun = TRIGRAMS.find(t => t.id === 'kun')!
    const lines = hexagramLines(qian.lines, kun.lines)
    expect(lines.filter(l => l.yang).every(l => l.position >= 4)).toBe(true)
    expect(lines.filter(l => !l.yang).every(l => l.position <= 3)).toBe(true)
  })

  it('谱表每一卦都画得出六爻,认不出的单卦才留白', () => {
    for (const x of HEXAGRAMS) {
      const upper = TRIGRAMS.find(t => t.id === x.upper)!
      const lower = TRIGRAMS.find(t => t.id === x.lower)!
      expect(hexagramLines(upper.lines, lower.lines), `${x.name}卦`).toHaveLength(6)
    }
  })

  it('谱表不带动爻记号 —— 谱是词典,不是这一卦', () => {
    const qian = TRIGRAMS.find(t => t.id === 'qian')!
    for (const l of hexagramLines(qian.lines, qian.lines)) expect(l.mark).toBe('')
  })

  it('谱表里的阴爻断口留得出来 —— 2px 的线挨成一片就成了粗横杠', () => {
    expect(block('.hex-figure--inline .hex-line__bar--yin')).toContain('gap:')
    expect(block('.hex-figure--inline')).toContain('gap:')
  })

  it('视图按 hexRows 铺,不再并排两个单卦符号', () => {
    expect(VIEW).toContain('hexRows')
    expect(VIEW).toMatch(/v-for="row in hexRows"/)
    expect(VIEW).not.toContain("trigramDef(x.upper)?.symbol")
  })
})
