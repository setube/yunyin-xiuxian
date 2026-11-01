/**
 * 顿悟选项池必须凑得出 3 个不同类型的选项。
 *
 * earlyGameService.mayTriggerEnlightenment 的抽法:
 *   while (options.length < 3 && pool.length > 0) { 随机取一个; 类型没重复才收下; 无论收没收都从池里删 }
 * 池子空了就停 —— 也就是说,若不同类型少于 3 种,它会**静默返回少于 3 个选项**,
 * 而界面按 3 个选项排版。这不是当下的 bug(现有 7 条选项 / 5 种类型,必然凑满 3),
 * 而是「依赖数据分布」的隐性契约:删掉几行数据就可能破,类型上没有任何提示。
 */
import { describe, expect, it } from 'vitest'
import { ENLIGHTENMENT_OPTIONS } from '@/data/earlyGame'

const TYPES = new Set(ENLIGHTENMENT_OPTIONS.map(o => o.type))

describe('顿悟选项池 · 凑得出三个不同类', () => {
  it('不同类型至少 3 种(少于 3 时抽取会静默返回不足 3 个)', () => {
    expect(
      TYPES.size,
      `只有 ${TYPES.size} 种类型,抽取要凑 3 个不同的会凑不满 —— 界面按 3 个排版`
    ).toBeGreaterThanOrEqual(3)
  })

  it('选项总数不少于 3(空池/过小池会让顿悟弹窗空着)', () => {
    expect(ENLIGHTENMENT_OPTIONS.length).toBeGreaterThanOrEqual(3)
  })

  it('每条选项都带 type 与 desc(缺 type 会被当成同一个类丢掉)', () => {
    for (const o of ENLIGHTENMENT_OPTIONS) {
      expect(typeof o.type, `${o.label} 的 type 不是字符串`).toBe('string')
      expect(o.type.length, `${o.label} 的 type 为空`).toBeGreaterThan(0)
      expect(typeof o.desc, `${o.label} 缺 desc`).toBe('string')
    }
  })

  it('点满整池仍能凑出 3 种:按抽取算法的确定性上界复核', () => {
    // 抽取最多走 pool.length 步,每步淘汰一条;只要不同类 >= 3 就一定凑得到,
    // 这里用「最多保留 min(3, 类型数) 个」的直接结论复核一遍数据面
    expect(Math.min(3, TYPES.size)).toBe(3)
  })
})
