/* eslint-disable no-console */
/**
 * 世界身份的语义完整度审计
 *
 * 命名置信度修好之后,`scattered` 占三成,且只有八种可能的名字
 * (八个规则主题 × 一个固定模式)。但**名字重复不等于世界重复** ——
 * 世界身份的作用是「准确分类」,不是「唯一命名」,这两项职责不该
 * 压在同一个字段上。
 *
 * 于是要问的不是「名字撞了没有」,而是:
 *
 *   **玩家看到的整套身份(名字 + 摘要 + 路线 + 地貌顺序 + 事件节奏 + 生态),
 *   能否把两个同名世界区分开?**
 *
 * 若能,名字重复无害;若连摘要也高度相似,才需要增加身份维度。
 * 本轮只度量,不改命名算法。
 */
import { describe, expect, it } from 'vitest'
import { skeletonDistance, terrainOf, visibleFeatures, worldIdentity } from './mortalIdentity'
import { generateMortalWorld, type MortalWorld } from './mortalWorldGen'

/** 采样一批世界 */
const POOL: MortalWorld[] = Array.from({ length: 240 }, (_, i) => generateMortalWorld((i + 1) * 7919))

function terrainSeq(w: MortalWorld): string[] {
  return w.chain.map(p => terrainOf(p.fromId))
}

/** 按世界名分组 */
function groupByName(pool: MortalWorld[]): Map<string, MortalWorld[]> {
  const m = new Map<string, MortalWorld[]>()
  for (const w of pool) {
    const n = worldIdentity(w).name
    m.set(n, [...(m.get(n) ?? []), w])
  }
  return m
}

/** 玩家可见的身份要素 */
function identityFacets(w: MortalWorld): Record<string, string> {
  const id = worldIdentity(w)
  const v = visibleFeatures(w)
  return {
    名字: id.name,
    摘要: id.summary,
    路线形状: v.shape.join('-'),
    地貌顺序: terrainSeq(w).join('/'),
    事件节奏: v.eventDensity.join(''),
    核心生态: [...new Set(w.chain.flatMap(p => p.enemies))].sort().join(',')
  }
}

describe('语义完整度 · 同名世界能否被区分', () => {
  it('名字重复的规模', () => {
    const groups = groupByName(POOL)
    const dup = [...groups.entries()].filter(([, ws]) => ws.length > 1)
    const byForm = new Map<string, number>()
    for (const w of POOL) {
      const f = worldIdentity(w).form
      byForm.set(f, (byForm.get(f) ?? 0) + 1)
    }
    console.log(`\n${POOL.length} 世共 ${groups.size} 种名字,其中 ${dup.length} 种被复用`)
    console.log(`形态分布:${[...byForm.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
    const top = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3)
    for (const [name, ws] of top) console.log(`  「${name}」出现 ${ws.length} 次`)
    expect(dup.length).toBeGreaterThan(0)
  })

  it('同名世界在其余要素上的差异', () => {
    const groups = groupByName(POOL)
    const dup = [...groups.entries()].filter(([, ws]) => ws.length > 1)
    // 取复用最多的那个名字,逐要素看两世是否相同
    const [name, ws] = dup.sort((a, b) => b[1].length - a[1].length)[0]!
    const a = identityFacets(ws[0]!)
    const b = identityFacets(ws[1]!)
    console.log(`\n同名的两世(「${name}」):`)
    console.log('要素        甲                                乙')
    for (const k of Object.keys(a)) {
      const same = a[k] === b[k]
      console.log(`${k.padEnd(10)} ${(a[k] ?? '').slice(0, 30).padEnd(32)} ${same ? '(相同)' : (b[k] ?? '').slice(0, 30)}`)
    }
    const differing = Object.keys(a).filter(k => a[k] !== b[k])
    console.log(`\n${differing.length}/${Object.keys(a).length} 项要素不同:${differing.join('、')}`)
    expect(differing.length).toBeGreaterThan(0)
  })

  it('逐要素统计:哪些要素真正承担了区分职责', () => {
    const groups = groupByName(POOL)
    const dup = [...groups.entries()].filter(([, ws]) => ws.length > 1)
    const diffCount: Record<string, number> = {}
    let pairs = 0
    for (const [, ws] of dup) {
      for (let i = 0; i < ws.length; i += 1) {
        for (let j = i + 1; j < ws.length; j += 1) {
          pairs += 1
          const a = identityFacets(ws[i]!)
          const b = identityFacets(ws[j]!)
          for (const k of Object.keys(a)) {
            if (a[k] !== b[k]) diffCount[k] = (diffCount[k] ?? 0) + 1
          }
        }
      }
    }
    console.log(`\n同名世界共 ${pairs} 对。各要素的区分率:`)
    for (const [k, v] of Object.entries(diffCount).sort((x, y) => y[1] - x[1])) {
      const rate = v / pairs
      console.log(`  ${k.padEnd(10)} ${(rate * 100).toFixed(0).padStart(3)}%  ${'█'.repeat(Math.round(rate * 20))}`)
    }
    // 名字按定义相同,故其区分率必为 0
    expect(diffCount['名字'] ?? 0).toBe(0)
  })
})

describe('语义完整度 · 摘要是否携带地貌信息', () => {
  it('三种形态的摘要样例', () => {
    const seen = new Set<string>()
    console.log('\n形态       世界名                          摘要')
    for (const w of POOL) {
      const id = worldIdentity(w)
      if (seen.has(id.form)) continue
      seen.add(id.form)
      console.log(`${id.form.padEnd(10)} ${id.name.padEnd(24)} ${id.summary}`)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('发现:分散档的摘要不含实际地貌构成', () => {
    // single/dual 的摘要里有地貌词;scattered 只有「山川无序、诸相杂陈」,
    // 玩家读不出这一世究竟由哪些地貌组成
    const scattered = POOL.filter(w => worldIdentity(w).form === 'scattered')
    expect(scattered.length).toBeGreaterThan(0)
    const withTerrain = scattered.filter(w => {
      const s = worldIdentity(w).summary
      return terrainSeq(w).some(t => s.includes(t))
    })
    console.log(
      `\n分散档 ${scattered.length} 世中,摘要含实际地貌词的有 ${withTerrain.length} 世` +
        `\n摘要模板:「${worldIdentity(scattered[0]!).summary}」` +
        `\n实际构成:${terrainSeq(scattered[0]!).join('、')}` +
        '\n—— 摘要没有把「由哪些地貌组成」告诉玩家'
    )
    expect(withTerrain.length).toBe(0)
  })

  it('分散档摘要的组合空间只有 bias × 主题', () => {
    const scattered = POOL.filter(w => worldIdentity(w).form === 'scattered')
    const summaries = new Set(scattered.map(w => worldIdentity(w).summary))
    const names = new Set(scattered.map(w => worldIdentity(w).name))
    console.log(
      `\n分散档 ${scattered.length} 世:${names.size} 种名字、${summaries.size} 种摘要` +
        '\n名字与摘要都只由「资源偏向 × 规则主题」决定,与地貌、路线、生态无关'
    )
    // 摘要种类远少于世界数 —— 名字之外的第一道区分并没起作用
    expect(summaries.size).toBeLessThan(scattered.length / 2)
  })
})

describe('语义完整度 · 四层职责已确立', () => {
  it('摘要不重复地界列表已给出的构成 —— 这是规则,不是缺陷', () => {
    // 实际页面验证的结论:地貌已逐段写在地界列表右侧,
    // 再写进摘要会变成「世界名说一次 → 摘要再说一次 → 列表第三次说一次」。
    // 故这条断言守的是**信息不冗余**,方向与「补全信息」相反
    const scattered = POOL.filter(w => worldIdentity(w).form === 'scattered')
    for (const w of scattered.slice(0, 20)) {
      const s = worldIdentity(w).summary
      const ts = [...new Set(terrainSeq(w))]
      // 分散档的摘要不该把整套地貌构成再列一遍
      const listed = ts.filter(t => s.includes(t)).length
      expect(listed).toBeLessThan(ts.length)
    }
    console.log(
      '\n四层职责:' +
        '\n  世界名      这是什么类型的世界' +
        '\n  摘要        整体呈现什么气象' +
        '\n  路线/地界   具体由什么组成' +
        '\n  规则        这一世的特殊条件' +
        '\n摘要只补世界名未表达的第一层语义,不做完整描述'
    )
  })

  it('已知问题:资源偏向是纯装饰,不影响任何游戏数值', () => {
    // bias 的全部消费点只有三处摘要文案与新颖度计算(审计用)。
    // 它不影响掉落、不影响资源产出、不影响任何数值 ——
    // 玩家读到「典籍散佚之地」会期待某种资源倾向,实际什么都不会发生。
    //
    // 这比「玩家不知道它意味着什么」更严重:**它根本不意味着什么**。
    // 本轮不改(收尾),但把事实钉在这里,免得日后当成已生效的机制
    const biases = new Set(POOL.map(w => w.bias))
    expect(biases.size).toBeGreaterThan(1)
    console.log(
      `\n资源偏向有 ${biases.size} 种取值:${[...biases].join('、')}` +
        '\n但它只出现在摘要文案与新颖度计算里,不接任何经济或掉落逻辑。' +
        '\n要么给它真实效果,要么从摘要里拿掉 —— 现状是「看似有信息、实际没信息」'
    )
  })
})

describe('语义完整度 · 结论', () => {
  it('结构确实不同:同名世界的骨架距离远大于零', () => {
    const groups = groupByName(POOL)
    const dup = [...groups.entries()].filter(([, ws]) => ws.length > 1)
    const dists: number[] = []
    for (const [, ws] of dup) {
      for (let i = 0; i < ws.length - 1; i += 1) dists.push(skeletonDistance(ws[i]!, ws[i + 1]!))
    }
    const avg = dists.reduce((s, d) => s + d, 0) / Math.max(1, dists.length)
    console.log(`\n同名世界的平均骨架距离 ${avg.toFixed(3)} —— 它们在结构上确实是不同的世界`)
    expect(avg).toBeGreaterThan(0.2)
  })

  it('判定:名字重复无害,但分散档的摘要没有接住区分职责', () => {
    // 用户的设计意图:名字负责「这大概是什么类型的世界」,
    // 摘要与路线负责「这一世具体有什么不同」。
    // 前半成立(结构确实不同),后半在分散档上不成立 ——
    // 摘要与名字同源,没有引入任何新信息
    const scattered = POOL.filter(w => worldIdentity(w).form === 'scattered')
    const pairKeys = new Set(scattered.map(w => `${worldIdentity(w).name}|${worldIdentity(w).summary}`))
    console.log(
      `\n分散档 ${scattered.length} 世只有 ${pairKeys.size} 种「名字+摘要」组合。` +
        '\n路线形状、地貌顺序、事件节奏、生态四项确实各不相同(见上方区分率),' +
        '\n但它们只出现在路线图与地界列表里,没有进入那句摘要。' +
        '\n\n故若要动分散档,该补的是**摘要的信息量**(把实际地貌构成写进去),' +
        '\n而不是扩名字词库 —— 后者只会产出更多同样不携带信息的名字'
    )
    expect(pairKeys.size).toBeLessThan(scattered.length)
  })
})
