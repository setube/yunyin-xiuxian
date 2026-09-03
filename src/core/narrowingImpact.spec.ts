/* eslint-disable no-console */
/**
 * 收窄后果审计
 *
 * 问题已钉死:不是「轮回奖励太多」,而是浅轮回同时推进了太多彼此独立的
 * 永久成长轴——金丹一世七项齐涨,没有一样非深修不可。
 *
 * 本套用例度量收窄方案的后果。审计对象不是「某项是否强」,而是:
 * **移除后,金丹轮回是否从「全能成长循环」变成「有明确取舍的循环」。**
 *
 * 两个主指标:覆盖比例(浅轮回能推进多少)与互斥度(深修独有占比)。
 * 只有互斥度足够大,玩家才会真正面对「这一世刷得快,还是活得深」。
 */
import { describe, expect, it } from 'vitest'
import { ASSETS, coverageAfter, coverageInsightVeinsOnly, coverageNow, deepExclusive, movedOut } from './narrowingImpact'

const fmt = (c: ReturnType<typeof coverageNow>): string =>
  `覆盖 ${c.shallow}/${c.total}(${(c.ratio * 100).toFixed(0)}%) · 深修独有 ${c.deepOnly}/${c.total}(${(c.exclusivity * 100).toFixed(0)}%)`

describe('收窄后果 · 覆盖比例', () => {
  it('三种情形的对照', () => {
    console.log(`\n现状:       ${fmt(coverageNow())}`)
    console.log(`只移两项:   ${fmt(coverageInsightVeinsOnly())}`)
    console.log(`定案(移三): ${fmt(coverageAfter())}`)
    console.log('\n逐项:')
    for (const a of ASSETS) {
      console.log(
        `  ${a.name.padEnd(12)} 现浅${a.shallowNow ? '✓' : '✗'} 后浅${a.shallowAfter ? '✓' : '✗'} ` +
          `深${a.deep ? '✓' : '✗'} [${a.action}]  ${a.note}`
      )
    }
  })

  it('现状确认:金丹循环覆盖近八成永久资产', () => {
    const now = coverageNow()
    expect(now.ratio).toBeGreaterThan(0.75)
    // 深修独有只剩两项(高阶认知、道源道痕)
    expect(now.deepOnly).toBe(2)
  })

  it('只移宿慧与灵脉停在五成半,进不了目标区间', () => {
    // 设计意图是让覆盖降到 3/8~4/8(约 38%~50%)。
    // 中间方案得到 5/9 = 56%,仍偏高——这是数据给出的结论,不是预设阈值
    const mid = coverageInsightVeinsOnly()
    expect(mid.ratio).toBeGreaterThan(0.5)
    console.log(`\n只移两项 ${(mid.ratio * 100).toFixed(0)}%,尚未进入 38%~50% 的目标区间`)
  })

  it('定案追加移出先天之姿,覆盖降到四成四并进入目标区间', () => {
    const now = coverageNow()
    const after = coverageAfter()
    expect(after.ratio).toBeLessThan(0.5)
    expect(after.ratio).toBeGreaterThan(0.38)
    // 互斥度翻倍不止
    expect(after.exclusivity).toBeGreaterThan(now.exclusivity * 1.9)
    console.log(
      `\n覆盖 ${(now.ratio * 100).toFixed(0)}% → ${(after.ratio * 100).toFixed(0)}%,` +
        `互斥度 ${(now.exclusivity * 100).toFixed(0)}% → ${(after.exclusivity * 100).toFixed(0)}%`
    )
  })

  it('首次出现「深修独有多于浅轮回可得」的格局', () => {
    const after = coverageAfter()
    expect(after.exclusivity).toBeGreaterThan(0.5)
    expect(after.deepOnly).toBeGreaterThan(after.shallow)
    console.log(`\n定案:${fmt(after)}——深修独有首次超过浅轮回可得`)
  })
})

describe('收窄后果 · 互斥收益面', () => {
  it('收窄后深修独有五项,首次形成可辨识的另一条路线', () => {
    const list = deepExclusive().map(a => a.name)
    expect(list).toHaveLength(5)
    expect(list).toContain('宿慧')
    expect(list).toContain('灵脉')
    expect(list).toContain('先天之姿')
    expect(list).toContain('高阶认知')
    expect(list).toContain('道源与道痕')
    console.log(`\n深修独有:${list.join('、')}`)
  })

  it('浅轮回仍保住四项,不至于变成纯功利计算', () => {
    const kept = ASSETS.filter(a => a.shallowAfter).map(a => a.name)
    expect(kept).toHaveLength(4)
    expect(kept).toContain('道果')
    expect(kept).toContain('灵兽')
    expect(kept).toContain('成就与图鉴')
    expect(kept).toContain('基础认知')
    console.log(`\n浅轮回保留:${kept.join('、')}——留住「活过一世总有所得」的感觉`)
  })

  it('移出的三项都符合「无界或短周期却影响长期」的特征', () => {
    const out = movedOut()
    expect(out.map(a => a.name)).toEqual(['宿慧', '先天之姿', '灵脉'])
    // 宿慧:无界 + 按境界发放 + 影响其他成长效率
    // 先天之姿:本应体现「活得多深」,却能被次数堆满
    // 灵脉:第二世即吃满却影响长期效率,最易形成「前几世必做」的固定路线
    for (const a of out) expect(a.action).toBe('move')
  })
})

describe('收窄后果 · 一个容易搞错的前提', () => {
  it('深修路过金丹,故浅能拿的深也能拿——互斥不在「能否」而在「效率」', () => {
    // 表里每一项 shallowAfter=true 的资产,deep 也必为 true。
    // 这意味着收窄并不产生「深修拿不到的东西」,
    // 真正的取舍是:深修要放弃多少道果效率去换那四项独有资产
    for (const a of ASSETS) {
      if (a.shallowAfter) expect(a.deep).toBe(true)
    }
  })

  it('师承是唯一不属于任何一条路线的资产——一次性历史', () => {
    const mentor = ASSETS.find(a => a.id === 'mentor')!
    expect(mentor.action).toBe('onetime')
    expect(mentor.shallowNow).toBe(false)
    expect(mentor.deep).toBe(false)
    // 它证明「一次性永久选择」可以成为轮回历史而无须每世发奖,
    // 是收窄浅轮回收益面时可以照抄的样板
  })

  it('高阶认知的边界现状即已存在,收窄只是把它写明', () => {
    const deepLore = ASSETS.find(a => a.id === 'loreDeep')!
    // minRealm 硬过滤本就挡住了高阶丹方/功法,shallowNow 已是 false。
    // 所谓「拆认知」不是新增限制,而是承认这条边界并让它显式化
    expect(deepLore.shallowNow).toBe(false)
    expect(deepLore.shallowAfter).toBe(false)
    expect(deepLore.action).toBe('split')
  })
})
