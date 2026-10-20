/**
 * 灵根生成 —— 创角与转世时随机灵根
 */
import type { ElementId, LinggenProfile, SpiritRoot } from '@/types'
import type { RandomService } from '@/utils/random'
import { BASIC_ELEMENTS, ELEMENTS, SPECIAL_ELEMENTS } from '@/data/linggen'

const COUNT_WEIGHTS: { count: number; weight: number }[] = [
  { count: 1, weight: 12 },
  { count: 2, weight: 30 },
  { count: 3, weight: 34 },
  { count: 4, weight: 16 },
  { count: 5, weight: 8 }
]

const COUNT_FACTOR: Record<number, number> = { 1: 1.6, 2: 1.35, 3: 1.15, 4: 1.0, 5: 0.9 }

/** 特殊灵根替换概率 */
const SPECIAL_CHANCE = 0.1
const CHAOS_CHANCE = 0.008

export function rollLinggen(rng: RandomService, aptitudeFloor = 0): LinggenProfile {
  // 混沌灵根:极小概率单根成圣
  if (rng.chance(CHAOS_CHANCE)) {
    const aptitude = Math.min(100, rng.int(85, 100) + aptitudeFloor)
    return {
      roots: [{ element: 'chaos', aptitude }],
      gradeName: '混沌灵根',
      growthMult: round2(1.6 * (aptitude / 60) * 1.5)
    }
  }

  const { count } = rng.weighted(COUNT_WEIGHTS, x => x.weight)
  const elements = pickElements(rng, count)
  const roots: SpiritRoot[] = elements.map(element => ({
    element,
    aptitude: Math.min(100, rng.int(40, 100) + aptitudeFloor)
  }))

  const hasSpecial = roots.some(r => ELEMENTS[r.element].special)
  const avgAptitude = roots.reduce((s, r) => s + r.aptitude, 0) / roots.length
  const growthMult = round2((avgAptitude / 60) * (COUNT_FACTOR[count] ?? 1) * (hasSpecial ? 1.2 : 1))

  return { roots, gradeName: gradeName(count, hasSpecial, avgAptitude), growthMult }
}

function pickElements(rng: RandomService, count: number): ElementId[] {
  const pool = [...BASIC_ELEMENTS]
  const out: ElementId[] = []
  for (let i = 0; i < count; i += 1) {
    const idx = rng.int(0, pool.length - 1)
    out.push(pool.splice(idx, 1)[0]!)
  }
  // 一定概率将其中一根替换为特殊灵根
  if (rng.chance(SPECIAL_CHANCE)) {
    const special = rng.weighted(SPECIAL_ELEMENTS, el => (el === 'light' || el === 'dark' ? 2 : 3))
    out[rng.int(0, out.length - 1)] = special
  }
  return out
}

function gradeName(count: number, hasSpecial: boolean, avgAptitude: number): string {
  if (hasSpecial) return '变异灵根'
  if (count === 1) return avgAptitude >= 80 ? '天灵根' : '异灵根'
  if (count === 2) return '真灵根'
  if (count === 3) return avgAptitude >= 70 ? '上灵根' : '伪灵根'
  return '杂灵根'
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * 灵根画像的形状修复 —— 建号草稿与角色灵根都要过这一道。
 *
 * 两处界面都是**裸下标**:`ELEMENTS[root.element].color` 取元素元数据、
 * `growthMult.toFixed(2)` 读倍率。坏档/手改档里出现野元素名或 `growthMult: null`
 * 时,前者对 `undefined` 取属性、后者对 null 调方法,渲染期当场抛错 ——
 * 而 Vue 会不断重试渲染,玩家看到的是「出现异常,已记录」的 toast 反复弹出。
 *
 * 修法:
 *  - 认不出的元素整根剔掉(它既画不出圆章,也不参与任何亲和计算);
 *  - 资质夹回 1~100 的整数(0 资质只是不可信的坏数,不是「废灵根」);
 *  - 倍率非有限/非正回落 1(与 `linggen?.growthMult ?? 1` 的缺省同一口径);
 *  - 一根都不剩时整份作废(没有灵根的画像不是画像):建号页会重新掷牌,
 *    角色页各处本就按「无灵根」分支显示。
 */
export function sanitizeLinggen(raw: unknown): LinggenProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const p = raw as Partial<LinggenProfile>
  const roots: SpiritRoot[] = []
  for (const r of Array.isArray(p.roots) ? p.roots : []) {
    if (!r || typeof r !== 'object') continue
    const element = (r as Partial<SpiritRoot>).element
    if (typeof element !== 'string' || !ELEMENTS[element as ElementId]) continue
    const aptitude = (r as Partial<SpiritRoot>).aptitude
    roots.push({
      element: element as ElementId,
      aptitude: Math.min(100, Math.max(1, Math.floor(Number.isFinite(aptitude) ? (aptitude as number) : 1)))
    })
  }
  if (roots.length === 0) return null
  const growthMult = Number.isFinite(p.growthMult) && (p.growthMult as number) > 0 ? (p.growthMult as number) : 1
  return {
    roots,
    gradeName: typeof p.gradeName === 'string' && p.gradeName ? p.gradeName : '灵根',
    growthMult
  }
}
