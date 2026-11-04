/**
 * 五维评级的刻度。
 *
 * 流派页的「五维评级」只给一排星,而 core 早算好了连续得分与那道阈值表。
 * 「进攻 3 星」与「进攻 3 星」之间差多少、再堆多少才够 4 星,读不出来。
 *
 * 判据:
 *   一 得分与星级取 core 原值,本层不另判一次星级。
 *   二 每维按**自己那四道线**归一 —— 五维阈值本就不同,共尺会把两把尺量成一个样。
 *   三 跨度为 0 时退化而不除零。
 *   四 满 5 星时进度 1、不再报下一星。
 *   五 最短板取「未满且进度最小」,并列取原序靠前。
 *   六 界面真的接上了 thresholds。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PowerDimension, PowerRating } from '@/core/powerRating'
import { gaugeFill, ratingGauge, ratingGauges, weakestGauge } from './ratingGauge'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/BuildView.vue'), 'utf-8')

function dim(key: PowerDimension['key'], score: number, stars: number, name = key): PowerDimension {
  return { key, name, stars, score, terms: [] }
}

/** 与 core/powerRating 的 THRESHOLDS 同形:四道线 */
const LINES = [0.25, 0.6, 1.0, 1.6]

describe('五维刻度 · 一、取 core 的原值', () => {
  it('得分与星级原样转发', () => {
    const g = ratingGauge(dim('attack', 0.42, 2), LINES)
    expect(g.score).toBe(0.42)
    expect(g.stars).toBe(2)
    expect(g.key).toBe('attack')
  })

  it('坏值不抛错:得分收成 0,星级夹进 1~5', () => {
    expect(ratingGauge(dim('attack', Number.NaN, Number.NaN), LINES).score).toBe(0)
    expect(ratingGauge(dim('attack', 0.1, 0), LINES).stars).toBe(1)
    expect(ratingGauge(dim('attack', 0.1, 99), LINES).stars).toBe(5)
  })
})

describe('五维刻度 · 二、按本维自己的线归一', () => {
  it('落在两线之间时,进度就是这一段里的比例', () => {
    // 第 2 星:下界 0.25、上界 0.6,中点 0.425
    const g = ratingGauge(dim('attack', 0.425, 2), LINES)
    expect(g.progress).toBeCloseTo(0.5, 5)
    expect(g.toNext).toBeCloseTo(0.175, 5)
    expect(g.nextLabel).toBe('3 星')
  })

  it('1 星时下界为 0 —— 不把第一段算成「已过一半」', () => {
    const g = ratingGauge(dim('attack', 0.125, 1), [0.25, 0.6, 1.0, 1.6])
    expect(g.progress).toBeCloseTo(0.125 / 0.25, 5)
  })

  it('五维阈值不同,同样的得分给出不同的进度 —— 这就是不共尺的理由', () => {
    // toStars 的规矩是「score ≥ 线就加一星」,故 3 星对应 [线2, 线3)。
    // 同为 0.7 分,落在两套线里的位置不同:
    //   身法(0.15/0.4/0.7/1.1):0.7 已过第三道线 → 4 星,这一段(0.7~1.1)刚起步
    //   进攻(0.25/0.6/1.0/1.6):0.7 仍是 2 星,在第 2 星那段(0.6~1.0)里走了四分之一
    const spd = ratingGauge(dim('speed', 0.7, 4), [0.15, 0.4, 0.7, 1.1])
    const atk = ratingGauge(dim('attack', 0.7, 3), LINES)
    expect(spd.progress, '身法:刚跨过第三道线').toBeCloseTo(0, 5)
    expect(atk.progress, '进攻:在 [0.6, 1.0) 这一段走了四分之一').toBeCloseTo(0.25, 5)
    // 同一分数在两把尺上给出不同进度 —— 共尺会把这件事抹平
    expect(spd.progress).not.toBeCloseTo(atk.progress, 2)
  })

  it('星级与阈值表自洽:刚跨过一道线,下一段从 0 起步', () => {
    const lines = [0.15, 0.4, 0.7, 1.1]
    // toStars:score ≥ 线就加一星。故刚跨过第 i 道线时星级是 i+2,该段进度为 0
    for (const [i, line] of lines.entries()) {
      const g = ratingGauge(dim('speed', line, i + 2), lines)
      expect(g.stars, `跨过线 ${line} 后应是 ${i + 2} 星`).toBe(i + 2)
      if (i + 1 < lines.length) {
        // 非最后一道:刚跨过线时这一段从 0 起步,差到下一星 = 下一道线 - 当前分
        expect(g.progress, `刚过线时这一段应从头起步(线 ${line})`).toBeCloseTo(0, 4)
        expect(g.toNext).toBeCloseTo(lines[i + 1]! - line, 5)
      } else {
        // 最后一道线跨过去就是满星:进度 1、无下一星
        expect(g.progress, '满星时进度应为 1').toBe(1)
        expect(g.nextLabel).toBeNull()
      }
    }
  })
})

describe('五维刻度 · 二之二、条长与星数同向', () => {
  /*
   * 条形原先只画本档进度:1 星走了 93% 的「身法」,比 4 星走了 67% 的「机制」更长 ——
   * 两根条并排时读者比的是长度,画面上正好传达了相反的意思。
   * 现条长 = (已过档数 + 本档进度) / 5:与星数同向,又与星数互补。
   *
   * 故障注入:把 gaugeFill 改回 return g.progress,第一条即红。
   */
  const mk = (stars: number, progress: number): Parameters<typeof gaugeFill>[0] => ({
    key: 'attack' as never,
    name: '进攻',
    score: 0,
    stars,
    progress,
    toNext: 0,
    nextLabel: null,
    terms: []
  })

  it('星少条必短 —— 1 星走满也短于 4 星刚起步', () => {
    expect(gaugeFill(mk(1, 1))).toBeLessThan(gaugeFill(mk(4, 0)))
  })

  it('同星时,本档进度决定长短', () => {
    expect(gaugeFill(mk(3, 0.1))).toBeLessThan(gaugeFill(mk(3, 0.9)))
  })

  it('五档各自的刻度:1 星起点 0,5 星满 1', () => {
    expect(gaugeFill(mk(1, 0))).toBe(0)
    expect(gaugeFill(mk(5, 1))).toBe(1)
    // 每档起点等距
    for (let s = 1; s <= 5; s += 1) {
      expect(gaugeFill(mk(s, 0))).toBeCloseTo((s - 1) / 5, 6)
    }
  })

  it('始终落在 0~1,坏值也不越界', () => {
    for (const [s, p] of [[0, 0], [9, 2], [Number.NaN, Number.NaN], [3, -1]] as const) {
      const v = gaugeFill(mk(s as number, p as number))
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('视图用 gaugeFill,不再直接画 progress', () => {
    const view = readFileSync(resolve(__dirname, '../views/BuildView.vue'), 'utf-8')
    expect(view, '该调 gaugeFill').toContain('gaugeFill(g)')
    expect(view, '不该再直接画本档进度').not.toMatch(/width: `\$\{g\.progress/)
  })
})

describe('五维刻度 · 三、零跨度不除零', () => {
  it('阈值全相同也不产出 NaN', () => {
    const g = ratingGauge(dim('attack', 0.5, 2), [0.5, 0.5, 0.5, 0.5])
    expect(Number.isFinite(g.progress)).toBe(true)
    expect(g.progress).toBeGreaterThanOrEqual(0)
    expect(g.progress).toBeLessThanOrEqual(1)
  })

  it('空阈值表:不崩,进度有界', () => {
    const g = ratingGauge(dim('attack', 9, 5), [])
    expect(Number.isFinite(g.progress)).toBe(true)
  })
})

describe('五维刻度 · 四、满档不再报下一星', () => {
  it('5 星时进度 1、toNext 0、无下一星', () => {
    const g = ratingGauge(dim('attack', 9, 5), LINES)
    expect(g.progress).toBe(1)
    expect(g.toNext).toBe(0)
    expect(g.nextLabel).toBeNull()
  })

  it('4 星时仍报下一星,差的是最后那道线', () => {
    const g = ratingGauge(dim('attack', 1.2, 4), LINES)
    expect(g.nextLabel).toBe('5 星')
    expect(g.toNext).toBeCloseTo(0.4, 5)
  })
})

describe('五维刻度 · 五、最短板', () => {
  const rating = (labels: PowerDimension[]): PowerRating => ({
    attack: 1,
    survival: 1,
    speed: 1,
    recovery: 1,
    mechanics: 1,
    labels,
    thresholds: {
      attack: [0.25, 0.6, 1.0, 1.6],
      survival: [0.25, 0.6, 1.0, 1.6],
      speed: [0.15, 0.4, 0.7, 1.1],
      recovery: [0.15, 0.4, 0.8, 1.3],
      mechanics: [0.3, 0.55, 0.8, 1.1]
    }
  })

  it('未满且进度最小的那一维', () => {
    const rows = ratingGauges(
      rating([dim('attack', 1.5, 4), dim('survival', 0.3, 2), dim('speed', 0.9, 4)])
    )
    expect(weakestGauge(rows)!.key).toBe('survival')
  })

  it('全满时没有短板 —— 那是到底了,不是差得远', () => {
    const rows = ratingGauges(rating([dim('attack', 9, 5), dim('speed', 9, 5)]))
    expect(weakestGauge(rows)).toBeNull()
  })

  it('并列最短取原序靠前的那个', () => {
    const rows = ratingGauges(rating([dim('attack', 0.4, 2), dim('speed', 0.4, 2)]))
    expect(weakestGauge(rows)!.key).toBe('attack')
  })

  it('空表给 null', () => {
    expect(weakestGauge([])).toBeNull()
  })
})

describe('五维刻度 · 六、界面接上了 thresholds', () => {
  it('流派页按 ratingRows 铺,不再只给一排星', () => {
    expect(VIEW).toContain('ratingGauges')
    expect(VIEW).toMatch(/v-for="g in ratingRows"/)
  })

  it('每维一根条,与星并列 —— 星说在哪档,条说这一档走了多少', () => {
    expect(VIEW, '该有刻度条').toContain('rating-gauge')
    expect(VIEW, '该把距下一星写出来').toContain('toNext')
  })

  it('最短板标出来 —— 四条长短要拿眼睛比,不如直接点名', () => {
    expect(VIEW).toContain('weakestRating')
  })

  it('阈值不再只算不吃:ratingGauges 真去读了 core 的 thresholds', () => {
    // 视图只传 powerRating 进来;真正吃 thresholds 的是本层的 ratingGauges
    expect(VIEW).toContain('ratingGauges(powerRating.value)')
    const SRC = readFileSync(resolve(ROOT, 'src/ui/ratingGauge.ts'), 'utf-8')
    expect(SRC, 'ratingGauges 该把 thresholds 传下去').toContain('rating.thresholds[l.key]')
    // 端到端:同一份 core 输出里,阈值不同的两维刻度不该相同
    const rating = {
      labels: [
        { key: 'attack' as const, name: '进攻', stars: 2, score: 0.7, terms: [] },
        { key: 'speed' as const, name: '身法', stars: 4, score: 0.7, terms: [] }
      ],
      thresholds: {
        attack: [0.25, 0.6, 1.0, 1.6] as [number, number, number, number],
        speed: [0.15, 0.4, 0.7, 1.1] as [number, number, number, number],
        survival: [0.25, 0.6, 1.0, 1.6] as [number, number, number, number],
        recovery: [0.15, 0.4, 0.8, 1.3] as [number, number, number, number],
        mechanics: [0.3, 0.55, 0.8, 1.1] as [number, number, number, number]
      }
    }
    const rows = ratingGauges(rating as never)
    expect(rows[0]!.progress).not.toBe(rows[1]!.progress)
  })
})
