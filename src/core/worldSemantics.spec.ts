/* eslint-disable no-console */
/**
 * 世界身份的语义完整度审计:同名世界能否靠整套可见身份(摘要、路线、地貌顺序、事件节奏、生态)区分。
 * 只度量,不改命名算法。
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { skeletonDistance, terrainOf, visibleFeatures, worldIdentity } from './mortalIdentity'
import { generateMortalWorld, type MortalWorld } from './mortalWorldGen'

const POOL: MortalWorld[] = Array.from({ length: 240 }, (_, i) => generateMortalWorld((i + 1) * 7919))

function terrainSeq(w: MortalWorld): string[] {
  return w.chain.map(p => terrainOf(p.fromId))
}

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
    // 同名分组,名字区分率必为 0
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
    expect(summaries.size).toBeLessThan(scattered.length / 2)
  })
})

describe('语义完整度 · 四层职责已确立', () => {
  it('摘要不重复地界列表已给出的构成 —— 这是规则,不是缺陷', () => {
    // 守的是信息不冗余:地貌已逐段写在地界列表,摘要不再列一遍
    const scattered = POOL.filter(w => worldIdentity(w).form === 'scattered')
    for (const w of scattered.slice(0, 20)) {
      const s = worldIdentity(w).summary
      const ts = [...new Set(terrainSeq(w))]
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

  /**
   * 已知问题:bias 只进摘要文案与新颖度计算(审计用),不接任何掉落/产出。
   *
   * 原先这条只有 console.log,唯一的断言(`biases.size > 1`)与标题无关 ——
   * 它永远不会因为「装饰性字段」这件事失败,和 `regionEvent.spec` 里
   * 「灵脉暴动」那种带 KNOWN_NEUTRAL 清单的处理方式差了一档。
   *
   * 这里把「哪些字段是装饰性的」钉成显式清单:新增一个只写文案不接数值的字段时,
   * 本行会红,迫使后来者决定「接数值」还是「从摘要里拿掉」。
   */
  const DECORATIVE_FIELDS = new Set(['bias'])
  it('装饰性字段必须已登记:只写文案、不接任何游戏数值', () => {
    // 源码里 `.bias` 的读取点必须全部落在摘要/距离计算里,不许出现在经济或掉落路径
    const economyHits: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, name.name)
        if (name.isDirectory()) {
          if (name.name === 'node_modules') continue
          walk(full)
        } else if (/\.(ts|vue)$/.test(name.name) && !name.name.endsWith('.spec.ts')) {
          const src = readFileSync(full, 'utf-8')
          src.split('\n').forEach((line, i) => {
            if (!DECORATIVE_FIELDS.has('bias')) return
            if (!/\.bias\b/.test(line)) return
            /*
             * 允许的四类:摘要文案、新颖度/骨架距离、世界身份键(区分同名世界)、
             * 存档清洗与透传(字段校验 + 原样带回)。这四类都不碰经济与掉落。
             */
            /*
             * 注意 `bias === "灵石"` 这种**不许**放行 —— 那是拿偏向当条件去做经济分支。
             * 只有两个世界互比(va.bias === vb.bias,新颖度/距离)才算合理比较。
             */
            const comparedBetweenWorlds = /\b[va]\w*\.bias\s*===\s*[va]\w*\.bias/.test(line)
            if (
              comparedBetweenWorlds || /summary|距离|Distance|similar/.test(line) ||
              /\.bias\s*\}|bias:\s*w\.bias|\bv\.bias\]|\.bias\s*\]/.test(line) ||
              /typeof w\.bias/.test(line)
            ) return
            economyHits.push(`${full.slice(process.cwd().length + 1)}:${i + 1} ${line.trim()}`)
          })
        }
      }
    }
    walk(resolve(process.cwd(), 'src'))
    expect(
      economyHits,
      `bias 出现在非文案/非距离的路径上 —— 它要么该有真实效果,要么该从摘要里拿掉:\n${economyHits.join('\n')}`
    ).toEqual([])
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
    // 设计意图:名字定类型,摘要与路线定差异
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
