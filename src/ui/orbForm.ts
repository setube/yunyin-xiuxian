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
  /** 球心那个字:四界共用「道」,不随界域换 */
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
 * 球心那个字一律是「道」:修的是道,走到哪一界都是这一个字。
 * 界域的差异全交给外面那三样可数的东西 —— 环数、粒子数、八卦环。
 * 已挂载 slots 的调用点仍可用自己的内容覆盖。
 */
const FORMS: Record<WorldId, Omit<OrbForm, 'label' | 'glyph'>> = {
  mortal: { rings: 1, particles: 8, bagua: true },
  immortal: { rings: 2, particles: 12, bagua: false },
  god: { rings: 3, particles: 16, bagua: false },
  chaos: { rings: 4, particles: 24, bagua: false }
}

/** 球心那一个字:四界共用 —— 修的是道,走到哪一界都是这一个字 */
const ORB_GLYPH = '道'

/** 某个大境界的法球形制;越界钳到首尾界域,与 worldOf 同一口径 */
export function orbForm(major: number): OrbForm {
  const m = Number.isFinite(major) ? Math.max(0, Math.min(21, Math.floor(major))) : 0
  const world = worldOf(m)
  const form = FORMS[world.id] ?? FORMS.mortal
  return { ...form, glyph: ORB_GLYPH, label: `${world.name}法球` }
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

/** 进度环的半径与周长(与组件里的 <circle r="54"> 同一份) */
export const ORB_PROGRESS_RADIUS = 54
export const ORB_PROGRESS_CIRCUMFERENCE = 2 * Math.PI * ORB_PROGRESS_RADIUS

/**
 * 进度环的 dashoffset:0 表示画满一圈,周长表示一圈都不画。
 *
 * 与 ProgressBar 的 width 同一种缺陷:`Math.min(1, NaN)` 仍是 NaN,
 * 拼出来的 `stroke-dashoffset: NaN` 属 CSS 语法错误,整条声明被丢弃 ——
 * 首帧就有时等于没写,环按 `stroke-dasharray` 的默认偏移画成满圈;
 * 运行中才赋值时元素保持上一个读数。两条都会让「修为才一两成」显示成满环,且不报错。
 *
 * 坏值按 0 画:与 ProgressBar 的「坏值按 0%」同一处置,不为一颗装饰环另立一套。
 */
export function orbDashOffset(progress: number): number {
  if (!Number.isFinite(progress)) return ORB_PROGRESS_CIRCUMFERENCE
  return ORB_PROGRESS_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)))
}

