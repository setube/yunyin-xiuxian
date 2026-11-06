import type { WorldId } from '@/types'
import { worldOf } from '@/data/realms'

/**
 * 法球的界域形制。
 *
 * 法球是全游戏被看得最多的一个东西 —— 首页仪表盘正中、修炼页正中,
 * 从炼气一路看到混沌道祖。而它 21 个境界长得一模一样:
 * 同样的三圈光环、同样的金粒子、同样的八卦环。
 *
 * 于是「我已经到仙界了」这件事,界面上只有一行字说得出;
 * 那颗球本身没有任何变化。这是本项目里最大的一处长期空白 —— 它该随界域变形。
 *
 * 这一层只做一件事:按界域给法球一组可挂的类名与数据,全是既有语义 token。
 * 四界各一态,且**四态在静态下就分得开**(不靠动效):环数、粒子数、八卦环的有无。
 *
 * 铁律:
 *   一 不改判据:只读 data/realms,不新增事实源;
 *   二 不抢内容:法球是装饰,组件整体不进读屏(见 ui/orbDecorative.spec);
 *   三 尊重减少动效:静态形制自己站得住 —— 环数、粒子数、有无八卦环都在静态下成立。
 */

/** 法球态:环数、粒子数、是否挂八卦环 */
export interface OrbForm {
  /** 外环数(1~4):一界一圈,越界越多 —— 这是静态下最易数的那一样 */
  rings: number
  /** 外圈粒子数 */
  particles: number
  /** 是否挂八卦环:只有人间界挂 —— 八卦是「还在山门里学」的记号 */
  bagua: boolean
  /** 中心符:四界各一个 */
  glyph: string
  /** 读屏与 title 的说法(法球整体 aria-hidden,这一项只供宿主页的 title 用) */
  label: string
}

/**
 * 四界的形态。数字刻意排成「能一眼数出来的递增」:
 *   人间界 1 环 8 粒 · 仙界 2 环 12 粒 · 神界 3 环 16 粒 · 混沌海 4 环 24 粒
 * 粒数取 8 的倍数(八卦那一圈本来就是 8),四界之间至少差 4 粒 ——
 * 少到数不出来就白加了。
 *
 * 中心符:凡取「道」(山门所学)、仙取「仙」、神取「神」、沌取「混」。
 * 已挂载 slots 的调用点仍可用自己的内容覆盖。
 */
const FORMS: Record<WorldId, Omit<OrbForm, 'label'>> = {
  mortal: { rings: 1, particles: 8, bagua: true, glyph: '道' },
  immortal: { rings: 2, particles: 12, bagua: false, glyph: '仙' },
  god: { rings: 3, particles: 16, bagua: false, glyph: '神' },
  chaos: { rings: 4, particles: 24, bagua: false, glyph: '混' }
}

/** 某个大境界的法球形制;越界钳到首尾界域,与 worldOf 同一口径 */
export function orbForm(major: number): OrbForm {
  const m = Number.isFinite(major) ? Math.max(0, Math.min(21, Math.floor(major))) : 0
  const world = worldOf(m)
  const form = FORMS[world.id] ?? FORMS.mortal
  return { ...form, label: `${world.name}法球` }
}

/**
 * 环的序号表:rings 是几就几圈。模板按它 v-for,不在模板里写死三个 div。
 */
export function orbRingIndexes(form: OrbForm): number[] {
  return Array.from({ length: Math.max(0, Math.floor(form.rings)) }, (_, i) => i)
}

/** 粒子的序号表;与 orbRingIndexes 同一口径 */
export function orbParticleIndexes(form: OrbForm): number[] {
  return Array.from({ length: Math.max(0, Math.floor(form.particles)) }, (_, i) => i)
}

