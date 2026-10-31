/** 统一随机服务;可注入种子,供概率逻辑测试 */

export type RandFn = () => number

/** mulberry32 伪随机数生成器(测试用种子) */
export function mulberry32(seed: number): RandFn {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class RandomService {
  /** 不用参数属性(`constructor(private rand)`):非可擦除语法,过不了 erasableSyntaxOnly */
  private readonly rand: RandFn

  constructor(rand: RandFn = Math.random) {
    this.rand = rand
  }

  next(): number {
    return this.rand()
  }

  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number {
    return Math.floor(this.rand() * (max - min + 1)) + min
  }

  /** [min, max) 浮点数 */
  float(min: number, max: number): number {
    return this.rand() * (max - min) + min
  }

  /** 概率判定 */
  chance(p: number): boolean {
    return this.rand() < p
  }

  /**
   * 等概率取一项。随机源返回 1(注入的常量/浮点误差)时按最后一档取,
   * 否则 `floor(1*len)` 越界,拼进字符串会变成「undefined」或 NaN,进档则整份损坏。
   */
  pick<T>(arr: readonly T[]): T {
    const i = Math.min(arr.length - 1, Math.floor(this.rand() * arr.length))
    return arr[i]!
  }

  /** 权重随机:weightOf 返回每项权重 */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0
    for (const it of items) total += Math.max(0, weightOf(it))
    if (total <= 0) return this.pick(items)
    let roll = this.rand() * total
    for (const it of items) {
      roll -= Math.max(0, weightOf(it))
      if (roll <= 0) return it
    }
    return items[items.length - 1]!
  }
}

/** 全局默认随机实例 */
export const rng = new RandomService()
