/** 灵根生成:创角与转世时随机灵根 */
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

/**
 * 修行倍率上界(读档守卫用)。
 *
 * 生成器的理论最大是混沌灵根:1.6 ×(100/60)× 1.5 = 4.0;
 * 普通灵根单根带特殊是 (100/60)× 1.6 × 1.2 = 3.2。
 * 取 5 留一档余量 —— 正常掷值到不了,越过的必定是坏档。
 * 不设上界时 `toFixed(2)` 在 1e21 起改用科学计数法,角色页会印出「×1e+300」。
 */
export const GROWTH_MULT_MAX = 5
const CHAOS_CHANCE = 0.008

export function rollLinggen(rng: RandomService, aptitudeFloor = 0): LinggenProfile {
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
 * 灵根画像的形状修复,建号草稿与角色灵根都要过这一道。
 * 界面裸下标读 `ELEMENTS[root.element].color` 与 `growthMult.toFixed(2)`:野元素名或
 * `growthMult: null` 会在渲染期抛错。
 *  - 认不出的元素整根剔掉;
 *  - 资质夹回 1~100 的整数(0 资质是坏数,不是「废灵根」);
 *  - 倍率非有限/非正回落 1(与 `linggen?.growthMult ?? 1` 的缺省同一口径);
 *  - 一根都不剩时返回 null:建号页会重新掷牌,角色页按「无灵根」分支显示。
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
  /*
   * 上界不是「够大就行」:`toFixed(2)` 在 1e21 起改用科学计数法 ——
   * 坏档写 `growthMult: 1e300` 时角色页会印出「×1e+300」(实测)。
   *
   * 上界取生成器的理论最大:混沌灵根 1.6 ×(100/60)× 1.5 = 4.0;
   * 普通灵根 (100/60)× 1.6(单根)× 1.2(特殊)= 3.2。
   * 留一档余量到 5,正常掷值绝无可能越过,越过的必定是坏档。
   */
  const rawMult = p.growthMult
  const growthMult =
    Number.isFinite(rawMult) && (rawMult as number) > 0 ? Math.min(GROWTH_MULT_MAX, rawMult as number) : 1
  return {
    roots,
    gradeName: typeof p.gradeName === 'string' && p.gradeName ? p.gradeName : '灵根',
    growthMult
  }
}
