/* eslint-disable no-console */
/**
 * 因果可感知性审计(Phase 34.1 收尾)
 *
 * 34.1 已经解决了「系统内部有因果」:意图由经历催生,不由阈值触发。
 * 但那回答的是**她为什么会开口**,而玩家真正会问的是另一句:
 *
 *   **她为什么在这一刻开口?**
 *
 * 这两个问题必须分开。前者是代码正确性,后者是体验可理解性 ——
 * 后者不能靠「speakIntent 有没有被调用」来验证。
 *
 * ## 三级判据
 *
 *   可追溯  玩家从近期经历中很容易想起:「她一直在找那个东西」
 *   可推断  玩家需要翻道侣资料才能明白:「原来她之前提过」
 *   突兀    玩家几乎无法知道:「为什么偏偏现在?」
 *
 * 判定依据是**玩家可见的信息**,不是代码里有没有那个变量。
 * 内部记着 sparks 序列,玩家看不到,就不算足迹。
 *
 * 本模块只度量,不改任何东西。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SPARK_NAMES, SPARK_WEIGHT } from '@/data/bondIntent'
import { BOND_EVENTS, TRIGGER_NAMES } from '@/data/bondEvents'
import { DAOLU } from '@/data/daolu'

const VIEW = readFileSync(resolve(__dirname, '../views/CharacterView.vue'), 'utf-8')

/** 玩家能否回溯到事件的原因 */
type Traceability = 'traceable' | 'inferable' | 'abrupt'

const LEVEL_NAMES: Record<Traceability, string> = {
  traceable: '可追溯',
  inferable: '可推断',
  abrupt: '突兀'
}

interface CausalLink {
  /** 玩家收到的东西 */
  surface: string
  /** 系统内部的真实原因 */
  cause: string
  /** 玩家在收到之前/当时能看到的证据 */
  evidence: string[]
  /** 原因累积期间玩家收到过几次提示 */
  footprints: number
  level: Traceability
}

/**
 * 判级规则。
 *
 * 关键是 footprints:原因在暗中累积时,玩家有没有收到过任何征兆。
 * 一次都没有 → 事件只能靠当场那句话解释自己 → 至多「可推断」
 */
function levelOf(evidence: string[], footprints: number): Traceability {
  if (footprints >= 2) return 'traceable'
  if (evidence.length > 0) return 'inferable'
  return 'abrupt'
}

/**
 * 当前各条因果链的实际状态。
 *
 * evidence 只填**玩家真的能看到**的东西 —— 界面上有的、
 * 提示里出现过的。内部字段(sparks / ripeness / opportunities)一律不算
 */
const LINKS: CausalLink[] = [
  {
    surface: '她开口提出自己的事',
    cause: '共历 / 支持 / 未了之事的征兆累积到酝酿度上限',
    // 弹窗里常驻「她所求」,故玩家翻一下能明白她为什么想去
    evidence: ['道侣弹窗常驻「她所求」', '开口那句话本身点明了方向'],
    footprints: 0,
    level: 'abrupt'
  },
  {
    surface: '共同事件出现',
    cause: '历练情境(踏入新地界 / 首胜 / 击破首领 / 濒死)+ 机会点冷却',
    evidence: ['事件文本描述了当下的场景', '弹窗里写明她的诉求与底线'],
    footprints: 0,
    level: 'abrupt'
  },
  {
    surface: '途中遇见一个人',
    cause: '每场战斗 6% 概率 + 本世地貌筛选候选',
    evidence: ['提示语「途中遇见一人」'],
    footprints: 0,
    level: 'abrupt'
  },
  {
    surface: '她离你而去',
    cause: '选项直接导致,或信任与契合双双跌破阈值',
    evidence: ['三维进度条常驻可见', '此前每次选择都有她的反应文本'],
    footprints: 0,
    level: 'abrupt'
  }
].map(l => ({ ...l, level: levelOf(l.evidence, l.footprints) }))

describe('因果可感知 · 现状', () => {
  it('四条因果链的可追溯等级', () => {
    console.log('\n玩家收到的            等级      玩家可见的证据')
    for (const l of LINKS) {
      console.log(`${l.surface.padEnd(22)} ${LEVEL_NAMES[l.level].padEnd(8)} ${l.evidence.join(' / ') || '无'}`)
      console.log(`    真实原因:${l.cause}`)
    }
    const abrupt = LINKS.filter(l => l.level === 'abrupt').length
    console.log(`\n可追溯 ${LINKS.filter(l => l.level === 'traceable').length} · 可推断 ${LINKS.filter(l => l.level === 'inferable').length} · 突兀 ${abrupt}`)
  })

  it('没有任何一条因果链达到「可追溯」', () => {
    // 可追溯的条件是原因累积期间留下过足迹。当前全部为 0
    expect(LINKS.every(l => l.footprints === 0)).toBe(true)
    expect(LINKS.some(l => l.level === 'traceable')).toBe(false)
    console.log(
      '\n四条链的足迹数全为 0 —— 原因在暗中累积,玩家收到结果之前' +
        '\n没有任何征兆。这正是「她为什么在这一刻开口」无法回答的原因'
    )
  })

  it('内部确实记着原因,但玩家看不到', () => {
    // sparks 逐条记录了催生意图的经历序列
    console.log('\n内部记录的经历类型:')
    for (const [k, v] of Object.entries(SPARK_NAMES)) {
      console.log(`  ${v.padEnd(24)} ${SPARK_WEIGHT[k as keyof typeof SPARK_WEIGHT] > 0 ? '+' : ''}${SPARK_WEIGHT[k as keyof typeof SPARK_WEIGHT]}`)
    }
    // 但界面里没有任何一处呈现它
    expect(VIEW).not.toMatch(/sparks/)
    expect(VIEW).not.toMatch(/ripeness/)
    console.log(
      '\n界面不含 sparks / ripeness —— 内部有账,玩家无从查阅。' +
        '\n「代码里有原因」不等于「玩家能感知原因」'
    )
  })
})

describe('因果可感知 · 缺的是什么', () => {
  it('缺的不是解释文本,是过程中的足迹', () => {
    // 反例:把因果写进弹窗会把游戏做成系统说明
    const badExample = '因为你已与她同行十六次,并且之前支持过她两次,所以她……'
    expect(VIEW).not.toContain('同行十六次')
    console.log(
      `\n不该做的:「${badExample}」` +
        '\n这会把关系变成系统日志。' +
        '\n\n该做的是在累积途中留下轻量记忆,让玩家自己把节点串起来:' +
        '\n  「她又问起北境的消息。」' +
        '\n  「你注意到她仍在留意北方。」' +
        '\n  「她终于停下脚步。」' +
        '\n  「往北那条路……我想去看看。」'
    )
  })

  it('素材已经就位:每个人的所求都写好了', () => {
    // 轻量记忆不需要新素材,pursuit 已经能长出四句话
    for (const d of DAOLU) expect(d.pursuit.length).toBeGreaterThan(0)
    console.log('\n十位道侣各有所求,足迹文本可由它派生 —— 缺的是机制,不是内容')
    for (const d of DAOLU.slice(0, 3)) console.log(`  ${d.name}:${d.pursuit}`)
  })

  it('共同事件的情境已经写明,但发生前同样没有铺垫', () => {
    console.log('\n事件      发生于')
    for (const e of BOND_EVENTS) {
      console.log(`${e.title.padEnd(8)} ${e.triggers.map(t => TRIGGER_NAMES[t]).join('、')}`)
    }
    // 事件文本描述了当下场景,故比意图稍好 —— 但仍无「之前」
    const eventLink = LINKS.find(l => l.surface === '共同事件出现')!
    expect(eventLink.evidence.length).toBeGreaterThan(0)
    expect(eventLink.footprints).toBe(0)
    console.log('\n每个事件都说清了「此刻在哪」,但没有一个说得清「此前发生过什么」')
  })
})

describe('因果可感知 · 本轮的边界', () => {
  it('这份判级是我的判断,不是玩家实测', () => {
    // evidence 列的是「界面上有什么」,level 是据此推的。
    // 玩家会不会真的回想起来,只有真人玩几世才知道
    expect(LINKS.length).toBeGreaterThan(0)
    console.log(
      '\n判级依据是「界面上玩家能看到什么」,属于可核对的事实;' +
        '\n但「玩家会不会真的把因果串起来」是行为问题,本审计给不出答案。' +
        '\n\n真正的验收标准是玩家能否自己说出:' +
        '\n「她之前一直在找师父,所以这次她想往北走。」'
    )
  })

  it('结论:代码层的因果已经稳了,缺的是让它浮出水面', () => {
    // 34.1 的 907 项测试证明系统内部有因果;
    // 本审计证明这些因果目前没有留下玩家可见的足迹
    expect(LINKS.every(l => l.cause.length > 0)).toBe(true)
    expect(LINKS.every(l => l.footprints === 0)).toBe(true)
    console.log(
      '\n每条链都有真实原因(代码层已验证),但每条链的足迹数都是 0。' +
        '\n下一步不是加功能,是让已有的因果在过程中露出痕迹'
    )
  })
})
