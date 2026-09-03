/* eslint-disable no-console */
/**
 * 跨世复利审计
 *
 * 指标换了:不再问「浅轮回能推进多少永久资产」,而问
 * **一次金丹轮回留下多少「可影响下一世效率」的永久增益**。
 *
 * 判据是硬链路:该资产是否自动汇入下一世的 cultivationSpeed 或战力。
 * `灵兽 +1` 是永久资产却不加速轮回;`资质地板 +5` 只是个数字,
 * 却持续作用于整个生命周期 —— 这两者不该记在同一张表上。
 */
import { describe, expect, it } from 'vitest'
import {
  COMPOUND_ASSETS,
  FRUIT_PER_GOLD_LIFE,
  attributionAt,
  autoCompounding,
  expectedAptitude,
  expectedGrowthMult,
  floorAtLife,
  lifeTable,
  marginalSpeedup,
  missedByAssetTable,
  saturationLife,
  speedupAt
} from './compoundingAudit'

describe('复利链 · 谁真的会让下一世更快', () => {
  it('按复利性质重新归类', () => {
    const KIND = {
      'auto-unbounded': '自动·无上限',
      'auto-saturating': '自动·会饱和',
      manual: '需操作',
      inert: '不进效率链'
    }
    console.log('\n资产        性质          汇入通道')
    for (const a of COMPOUND_ASSETS) {
      console.log(`${a.name.padEnd(10)} ${KIND[a.kind].padEnd(12)} ${a.channel ?? '—'}`)
      console.log(`    ${a.evidence}`)
      if (a.saturateAt) console.log(`    饱和于:${a.saturateAt}`)
    }
  })

  it('只有两项是真正的自动复利,其余是收藏或需操作', () => {
    const auto = autoCompounding()
    const unbounded = auto.filter(a => a.kind === 'auto-unbounded')
    // 无上限的只有道果一项
    expect(unbounded).toHaveLength(1)
    expect(unbounded[0]!.name).toBe('道果')
    console.log(
      `\n自动复利 ${auto.length} 项:${auto.map(a => a.name).join('、')}` +
        `\n其中无上限的只有「${unbounded[0]!.name}」,其余三项都会饱和`
    )
  })

  it('此前那张永久资产表漏掉了两条自动复利通道', () => {
    const missed = missedByAssetTable().map(a => a.name)
    expect(missed).toContain('资质地板')
    expect(missed).toContain('称号')
    console.log(
      `\n漏项:${missed.join('、')} —— 两者都自动汇入 cultivationSpeed,` +
        `\n却都不在「浅轮回还剩几项」的计数里。` +
        `\n用资产数量算健康度会低估复利面,这正是要换指标的原因`
    )
  })

  it('认知不构成自动复利:它走炼制链,要玩家真去炼才兑现', () => {
    const lore = COMPOUND_ASSETS.find(a => a.id === 'lore')!
    expect(lore.kind).toBe('manual')
    expect(lore.channel).toContain('craftability')
    console.log(`\n认知:${lore.evidence}`)
  })
})

describe('复利链 · 资质地板', () => {
  it('资质地板饱和得很快', () => {
    const sat = saturationLife()
    console.log('\n世代  地板  期望资质  期望成长倍率')
    for (const life of [1, 3, 6, 9, 12, 17, 30]) {
      const f = floorAtLife(life)
      console.log(
        `${String(life).padStart(4)} ${String(f).padStart(5)} ` +
          `${expectedAptitude(f).toFixed(1).padStart(9)} ${expectedGrowthMult(f).toFixed(3).padStart(13)}`
      )
    }
    // 地板 ≥60 后任何 roll 都顶到 100,再轮回不再改善资质
    expect(sat).toBeGreaterThan(1)
    expect(sat).toBeLessThan(20)
    console.log(`\n第 ${sat} 世地板达 ${floorAtLife(sat)},此后任何 roll 都顶满 100 —— 资质地板到此为止`)
  })

  it('它的总提升幅度有限,但来得极早', () => {
    const sat = saturationLife()
    const lo = expectedGrowthMult(floorAtLife(1))
    const hi = expectedGrowthMult(floorAtLife(sat))
    const span = hi / lo
    // 全程只涨三成上下,远不是主导项
    expect(span).toBeGreaterThan(1.2)
    expect(span).toBeLessThan(1.5)
    console.log(
      `\n成长倍率 ${lo.toFixed(3)} → ${hi.toFixed(3)}(×${span.toFixed(2)}),` +
        `\n全部发生在前 ${sat} 世 —— 幅度不大,但恰好落在玩家最可能反复轮回的区间`
    )
  })
})

describe('复利链 · 逐世曲线', () => {
  it('重修到金丹的耗时随世代如何压缩', () => {
    console.log(`\n金丹一世凝道果 ${FRUIT_PER_GOLD_LIFE} 枚`)
    console.log('世代  地板  灵根倍率  累计道果  灵根加成  道果加成  相对首世耗时')
    for (const r of lifeTable(30)) {
      if (![1, 2, 3, 6, 9, 12, 17, 20, 25, 30].includes(r.life)) continue
      console.log(
        `${String(r.life).padStart(4)} ${String(r.floor).padStart(5)} ` +
          `${r.linggenMult.toFixed(3).padStart(9)} ${String(r.fruit).padStart(9)} ` +
          `${r.cultFromLinggen.toFixed(3).padStart(9)} ${r.cultFromFruit.toFixed(3).padStart(9)} ` +
          `${(r.vsFirst * 100).toFixed(1).padStart(11)}%`
      )
    }
  })

  it('三十世后重修金丹的耗时被压到首世的零头', () => {
    const t = lifeTable(30)
    const last = t[t.length - 1]!
    expect(last.vsFirst).toBeLessThan(0.5)
    console.log(
      `\n第 30 世重修到金丹只要首世的 ${(last.vsFirst * 100).toFixed(1)}%,` +
        `即提速 ${speedupAt(30).toFixed(2)} 倍 —— 这就是「轮回越多越快」的量化形态`
    )
  })

  it('归因:道果自始至终主导,资质地板只是配角', () => {
    console.log('\n世代   全开   仅资质   仅道果   资质占比')
    for (const life of [3, 6, 12, 20, 30]) {
      const a = attributionAt(life)
      console.log(
        `${String(life).padStart(4)} ${a.both.toFixed(3).padStart(7)} ` +
          `${a.linggenOnly.toFixed(3).padStart(8)} ${a.fruitOnly.toFixed(3).padStart(8)} ` +
          `${(a.linggenShare * 100).toFixed(0).padStart(8)}%`
      )
    }
    const early = attributionAt(3)
    const late = attributionAt(30)
    // 份额随世代单调让位给道果,但即便最早期它也不过半
    expect(early.linggenShare).toBeLessThan(0.5)
    expect(late.linggenShare).toBeLessThan(early.linggenShare)
    console.log(
      `\n第 3 世资质地板占提速的 ${(early.linggenShare * 100).toFixed(0)}%,` +
        `第 30 世降到 ${(late.linggenShare * 100).toFixed(0)}% ——` +
        `\n它**从未主导过**:道果从第二世起就已经是提速的大头`
    )
  })

  it('修正一个直觉:资质地板性质危险,量级却不危险', () => {
    // 直觉上「每轮回一次,下一世永久更容易」比一次性收藏更危险。
    // 性质判断没错——它确实自动、确实永久、确实作用于整个生命周期。
    // 但实测量级不支持这个担忧:份额峰值不到两成,且十二世即封顶
    const shares = [2, 3, 6, 9, 12, 17, 20, 30].map(l => attributionAt(l).linggenShare)
    const peak = Math.max(...shares)
    expect(peak).toBeLessThan(0.25)
    const sat = saturationLife()
    const lg = attributionAt(30).linggenOnly
    // 单独看资质地板,三十世总共只提速一成四
    expect(lg).toBeLessThan(1.2)
    console.log(
      `\n资质地板份额峰值 ${(peak * 100).toFixed(0)}%,单独作用三十世也只提速 ${((lg - 1) * 100).toFixed(1)}%,` +
        `\n且第 ${sat} 世即封顶。性质上它确实是「下一世永久变容易」,` +
        `\n但它不是正反馈的发动机 —— 真正无界的只有道果一条`
    )
  })
})

describe('复利链 · 正反馈会不会失控', () => {
  it('边际提速逐世递减,不存在发散', () => {
    const m = marginalSpeedup(30)
    console.log('\n世代  相对上一世提速')
    for (const r of m) {
      if (![2, 3, 6, 12, 20, 30].includes(r.life)) continue
      console.log(`${String(r.life).padStart(4)}  ${(r.gain * 100).toFixed(2)}%`)
    }
    const first = m[0]!.gain
    const last = m[m.length - 1]!.gain
    expect(last).toBeLessThan(first)
    expect(last).toBeGreaterThan(0)
    console.log(
      `\n第 2 世 +${(first * 100).toFixed(1)}%,第 30 世 +${(last * 100).toFixed(2)}% ——` +
        `\n递减但**不归零**:道果无上限,故正反馈永远不会完全停下`
    )
  })

  it('结论:复利面比资产数量表显示的更宽,但强度可控', () => {
    // 浅轮回名义上只剩四项资产,实际自动复利通道有四条
    // (道果、资质地板、称号、灵兽),其中两条不在那张表里
    const auto = autoCompounding()
    expect(auto.length).toBeGreaterThanOrEqual(4)
    const s30 = speedupAt(30)
    // 30 世累计提速在两倍上下,不是数量级失控
    expect(s30).toBeGreaterThan(1.5)
    expect(s30).toBeLessThan(4)
    console.log(
      `\n自动复利通道 ${auto.length} 条,30 世累计提速 ${s30.toFixed(2)} 倍。` +
        `\n没有数量级失控,但三条会饱和的通道都在前十几世走完 ——` +
        `\n之后唯一还在推的就是道果,与轮回 ROI 审计的结论对上了:` +
        `\n浅轮回长期只剩「刷道果」一件事,而它恰好永不封顶`
    )
  })
})
