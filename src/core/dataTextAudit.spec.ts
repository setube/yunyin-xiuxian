/**
 * 文案数值对账 —— 「写了多少,就得给多少」
 *
 * 玩家最容易撞见的缺陷不是崩溃,而是**说明与实现不一致**:文案写「攻击 +20%」,
 * 数据里却是 0.15;或者规则改过一版,文案忘了跟。这类问题单元测试看不见
 * (两边各自都"对"),静态审计也看不见(类型不关心数字),只有把两者对起来才现形。
 *
 * 判据只钉**形状保证配对**的那几张表:条目自带说明文本、也自带数值负载
 * (变数、秘境随机规则、增益)。其余地方文案里的数字可能来自别的表
 * (例如顿悟选项的数值挂在 buffs 上),硬对只会误报,故不在此列。
 *
 * 编码有三种,都要认:
 *   x      —— 0.15 表示 +15%(概率、词条)
 *   1+x    —— 1.15 表示 +15%(敌方/治疗倍率)
 *   1-x    —— 0.25 与「-75%」同义(治疗压制)
 * 另有「降低/减少/下降」这类反向措辞,允许数值为负。
 */
import { describe, expect, it } from 'vitest'
import { MUTATORS } from '@/data/mutators'
import { SECRET_RULES } from '@/data/secretRealms'
import { BUFFS } from '@/data/buffs'
import { PACTS } from '@/data/pacts'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { cnNumber } from '@/utils/format'
import { REALMS, WORLDS, ascensionLeap } from '@/data/realms'
import { VEIN_MAIN_CAPACITY, VEIN_SIDE_CAP, VEIN_TOTAL_CAPACITY } from '@/data/constants'
import { VEINS } from '@/data/veins'
import { BUILD_PROFILES } from '@/core/buildSim'
import { HEXAGRAMS, TRIGRAMS } from '@/data/yijing'
import { PALACES, STARS } from '@/data/ziwei'
import { MANSIONS } from '@/data/xiangxiu'
import { GATES } from '@/data/qimen'
import { SECRET_LAYERS } from '@/data/secretRealms'
import { ARTIFACT_MAX_SLOTS, ARTIFACT_SLOT_UNLOCK_MAJOR } from '@/data/artifacts'
import { EXPEDITION_ROUTE_LAYERS } from '@/data/endgame'
import { MUTATION_FIGHTS } from '@/core/expedition'
import { PROFILE_MIN_MARKS } from '@/core/identity'
import { AFFIXES } from '@/data/affixes'
import { STAT_NAMES } from '@/data/statNames'

/** 文案里的百分比是否能在同一条目的数值里找到对应 */
function percentBacked(percent: number, nums: number[]): boolean {
  const p = percent / 100
  return nums.some(v => {
    const candidates = [v, Math.abs(v)]
    for (const c of candidates) {
      if (Math.abs(c - p) < 1e-9) return true // x
      if (Math.abs(c - 1 - p) < 1e-9) return true // 1+x
      if (Math.abs(c - (1 - p)) < 1e-9) return true // 1-x
      if (Math.abs(c - percent) < 1e-9) return true // 直接写了百分数
    }
    return false
  })
}

function percentsOf(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => Number(m[1]!))
}

describe('文案数值对账 · 天道变数', () => {
  it('每条变数说明里的百分比,都能在它自己的 rules 里找到', () => {
    let checked = 0
    for (const m of MUTATORS) {
      const nums = Object.values(m.rules).flatMap(v =>
        typeof v === 'number' ? [v] : typeof v === 'object' && v !== null ? Object.values(v) : []
      ) as number[]
      for (const pc of percentsOf(m.text)) {
        checked += 1
        expect(percentBacked(pc, nums), `变数「${m.name}」文案写 ${pc}%,数值里对不上:${m.text} · [${nums.join(', ')}]`).toBe(true)
      }
    }
    expect(checked, '一条百分比都没扫到,断言形同虚设').toBeGreaterThanOrEqual(5)
  })
})

describe('文案数值对账 · 词条说明的名字只有一处', () => {
  /**
   * 说明曾经逐条手写:「造成伤害提升」「受到伤害降低」「生命上限提升」,
   * 而面板、战报、图鉴里同一个键叫「伤害增幅」「伤害减免」「气血上限」。
   * 同一个键两套名字,玩家没法把装备上那条与面板上那条对上号。
   *
   * 现在 desc 由 STAT_NAMES[key] 派生,数值位只留一个 {v}。
   * 故障注入:把任一条 desc 改回手写旧名 → 本条红。
   */
  it('每条词条说明以自己的键名为开头,且 {v} 恰好一个', () => {
    const offenders = AFFIXES.flatMap(a => {
      const name = STAT_NAMES[a.key]
      if (!a.desc.startsWith(name)) return [`${a.id}「${a.name}」:${a.desc} —— 该以「${name}」开头`]
      const holes = a.desc.split('{v}').length - 1
      if (holes !== 1) return [`${a.id}「${a.name}」:${a.desc} —— {v} 有 ${holes} 个`]
      return []
    })
    expect(offenders, '词条说明自己手写了第二套名字').toEqual([])
    expect(AFFIXES.length, '词条池没读到,判据会假绿').toBeGreaterThan(100)
  })
})

describe('文案数值对账 · 秘境随机规则', () => {
  it('每条规则的说明与它自己的 rules 一致', () => {
    let checked = 0
    for (const r of SECRET_RULES) {
      const nums = Object.values(r.rules).flatMap(v =>
        typeof v === 'number' ? [v] : typeof v === 'object' && v !== null ? Object.values(v) : []
      ) as number[]
      for (const pc of percentsOf(r.text)) {
        checked += 1
        expect(percentBacked(pc, nums), `秘境规则「${r.text}」的 ${pc}% 对不上:[${nums.join(', ')}]`).toBe(true)
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3)
  })
})

describe('文案数值对账 · 增益(Buff)', () => {
  it('每味增益的说明百分比,都能在它自己的 mods 里找到', () => {
    let checked = 0
    for (const b of BUFFS) {
      const nums = Object.values(b.mods) as number[]
      for (const pc of percentsOf(b.desc)) {
        checked += 1
        expect(percentBacked(pc, nums), `增益「${b.name}」说明写 ${pc}%,mods 里对不上:${b.desc} · [${nums.join(', ')}]`).toBe(true)
      }
    }
    expect(checked, '增益说明里扫到的百分比太少,判据覆盖不足').toBeGreaterThanOrEqual(8)
  })
})

describe('文案数值对账 · 天道契约', () => {
  /**
   * 契约的规则文案里有两类数字:
   *   ① 数值型 —— maxRounds / playerStartHpPct 等,写在 rules 里;
   *   ② 特殊约束 —— 如 `special: 'endHp80'`(每场战后气血须 ≥80%),
   *      数值就藏在特殊标记的名字里,故额外允许"百分比数字出现在 special 字符串里"。
   */
  it('每条契约的规则文案,数字都能在它自己的 rules / sourceMult / special 里找到', () => {
    let checked = 0
    for (const p of PACTS) {
      const rules = p.rules ?? {}
      const nums = Object.values(rules).flatMap(v =>
        typeof v === 'number' ? [v] : typeof v === 'object' && v !== null ? Object.values(v) : []
      ) as number[]
      if (typeof p.sourceMult === 'number') nums.push(p.sourceMult)
      for (const pc of percentsOf(p.ruleText)) {
        checked += 1
        const inSpecial = typeof p.special === 'string' && p.special.includes(String(pc))
        expect(
          inSpecial || percentBacked(pc, nums),
          `契约「${p.name}」文案写 ${pc}%,rules/特殊约束里对不上:${p.ruleText}`
        ).toBe(true)
      }
    }
    expect(checked).toBeGreaterThanOrEqual(1)
  })

  it('契约文案里的**裸数字**也要对得上(「回合上限 25」这类不带宽高符号的写法)', () => {
    // 只扫 % 会漏掉契约最典型的写法:「回合上限 25」「道源 ×1.6」。
    // 契约文案是公式化的,故这里连裸数字一起对账(变数/增益的文案更散文,不适用)。
    let checked = 0
    for (const p of PACTS) {
      const rules = p.rules ?? {}
      const nums = Object.values(rules).flatMap(v =>
        typeof v === 'number' ? [v] : typeof v === 'object' && v !== null ? Object.values(v) : []
      ) as number[]
      if (typeof p.sourceMult === 'number') nums.push(p.sourceMult)
      for (const m of p.ruleText.matchAll(/(\d+(?:\.\d+)?)/g)) {
        const n = Number(m[1])
        checked += 1
        const inSpecial = typeof p.special === 'string' && p.special.includes(String(n))
        expect(inSpecial || percentBacked(n, nums), `契约「${p.name}」文案里的 ${n} 对不上:${p.ruleText}`).toBe(true)
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4)
  })
})

/**
 * 视图文案也要对账 —— 这一类更难自动核:模板里的数字可能是常量、也可能来自别的表。
 * 故只钉**已经确认过归属**的几处:它们曾经手抄过数字(注释还写着"唯一来源是 X",
 * 数字却是手打的),改常数就会撒谎。判据 = 引用来源 + 不再出现那个字面量。
 */
describe('文案数值对账 · 视图不手抄数字', () => {
  const src = (from: string): string =>
    readFileSync(resolve(__dirname, from), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('人物页的道果说明与边际收益都取自 DAO_FRUIT_* 常数', () => {
    // 轮回弹窗拆出后判据随本体走
    const view = src('../components/character/RebirthDialog.vue')
    expect(view, '道果每枚加成应读常数').toContain('DAO_FRUIT_CULT_BONUS')
    expect(view, '道躯加成应读常数').toContain('DAO_FRUIT_COMBAT_BONUS')
    // 手抄过的两处字面量必须消失(改了常数却忘了改文案,正是这条要拦的)
    expect(view).not.toContain('修行 +3%')
    expect(view).not.toContain('道躯 +1.5%')
    expect(view, '边际收益里的 ×3 也是手抄的,应改成常数').not.toMatch(/effective \* 3\b/)
  })

  it('修行页的闭关文案取自 buffs.ts 的 retreat 本体', () => {
    // 闭关卡拆出后判据随本体走
    const view = src('../components/cultivation/RetreatCard.vue')
    expect(view, '闭关时长与加成应读 buff 定义').toContain("buffDef('retreat')")
    expect(view).not.toContain('5 分钟,修炼速度 +150%')
    expect(view).not.toContain('5分钟 修炼 +150%')
  })

  it('坊市售出段的四类价签取自同一套定价函数', () => {
    // 售出段随本体迁入 MarketSellSection:判据跟着走
    const sell = src('../components/market/MarketSellSection.vue')
    for (const fn of ['consignPrice(', 'herbSellBatch(', 'materialSellPrice(', 'pillSellPrice(']) {
      expect(sell, `售出段该读 ${fn} 定价`).toContain(fn)
    }
    expect(sell, '批量售出的门槛与按钮文案同源').toContain('MARKET_MAT_COUNT')
    const host = src('../views/MarketView.vue')
    expect(host, '宿主只切签,不再自己拼售出价').not.toMatch(/consignPrice\(|herbSellBatch\(|materialSellPrice\(|pillSellPrice\(/)
  })

  it('坊市悬赏板的可交判据与页签圆点读同一份订单投影', () => {
    // 悬赏板随本体迁入 BountyBoardSection,投影收进 useBountyRows
    const board = src('../components/market/BountyBoardSection.vue')
    const rows = src('../composables/useBountyRows.ts')
    const host = src('../views/MarketView.vue')
    expect(rows, '订单投影该由 composable 统一给出').toContain('function renderBounty(')
    expect(rows, '可交判据按四类存货分别算').toContain('inventory.bagItems.some(e => e.tier >= s.tier)')
    expect(board, '悬赏板读同一份投影').toContain('useBountyRows()')
    expect(host, '页签圆点也读同一份投影').toContain('useBountyRows()')
    expect(host, '宿主不再自己摊订单').not.toContain('renderBounty(')
    expect(host, '圆点不得另起一套可交判据').not.toMatch(/bounty\.orders\.some\(/)
  })

  it('坊市的墙钟倒计时不随引擎暂停冻结', () => {
    const sell = src('../components/market/MarketSellSection.vue')
    const rows = src('../composables/useBountyRows.ts')
    for (const [name, text] of [
      ['售出段', sell],
      ['悬赏订单投影', rows]
    ] as const) {
      expect(text, `${name}应读墙钟读数`).toContain('useWallNow()')
      expect(text, `${name}不得走暂停冻结的游戏时钟`).not.toMatch(/useNow\(|useGameClock\(/)
    }
  })

  it('可冻结倒计时读游戏时钟,不读真实墙钟', () => {
    const now = src('../composables/useNow.ts')
    expect(now, 'useNow 要与到期结算同一把尺').toContain('gameNow()')
    expect(now, '暂停时读数不该继续按真实墙钟往下跑').not.toContain('Date.now()')
    const cultivation = src('../views/CultivationView.vue')
    expect(cultivation, '修行页状态胶囊读 now.value').toContain('(b.endsAt - now.value) / 1000')
    const buff = src('../components/cultivation/BuffDialog.vue')
    expect(buff, 'Buff 详情倒计时读 now.value').toContain('(inst.value.endsAt - now.value) / 1000')
    const combat = src('../components/adventure/CombatPanel.vue')
    expect(combat, '历练倒计时读 now.value').toContain('(session.value.endsAt - now.value) / 1000')
  })

  it('设置页各段随本体迁出,宿主不再自带实现', () => {
    const host = src('../views/SettingsView.vue')
    const pref = src('../components/settings/SettingsPreferenceSection.vue')
    const save = src('../components/settings/SettingsSaveSection.vue')
    const diag = src('../components/settings/SettingsDiagnosticsSection.vue')
    const about = src('../components/settings/SettingsAboutSection.vue')
    for (const [name, text, marker] of [
      ['偏好段', pref, 'settings.musicOn'],
      ['存档段', save, 'importSaveText('],
      ['诊断段', diag, 'diag.errors'],
      ['关于段', about, 'markReleaseSeen(']
    ] as const) {
      expect(text, `${name}应持有原实现`).toContain(marker)
    }
    expect(host, '宿主只摆节标题与顺序').toContain('<SettingsPreferenceSection />')
    expect(host, '宿主不再自己读设置项').not.toContain('settings.musicOn')
    expect(host, '宿主不再自己接存档流程').not.toMatch(/importSaveText\(|resetGame\(|exportSaveToDevice\(/)
    expect(host, '宿主不再自己摊诊断').not.toContain('diag.errors')
    expect(host, '宿主不再自己开关于浮层').not.toContain('markReleaseSeen(')
  })

  it('导入确认前摊开备份身份与版本,过高版本提前置灰', () => {
    const save = src('../components/settings/SettingsSaveSection.vue')
    expect(save, '确认前应摊开备份身份').toContain('importInspect.name')
    expect(save, '确认前应摊开备份版本').toContain('importInspect.version')
    expect(save, '过高版本应提前置灰').toContain(':disabled="importInspect?.tooNew === true"')
    expect(save, '版本过高与否取自 inspect,不另写死').toContain('inspectImportText(text)')
  })
})

/**
 * 数量也要对账 —— 「四界二十一境」「六十四卦」「三层」这类写法,数字同样是手抄的。
 *
 * 与百分比不同:数量不会自己变,只有**内容增长**时才变 —— 那正是最容易漏的时刻
 * (加了界域、加了卦,没人会想起界面上还有一句写着旧数字)。故这里逐处钉:
 * 页面写的数量必须由来源表数出来,且原来的字面量必须消失。
 *
 * 判据同时钉住「值没变」:算法换了,玩家看到的还得是原来那句(四界二十一境、
 * 六十四卦、三层……),否则接线就成了改文案的借口。
 */
describe('文案数值对账 · 视图不手抄数量', () => {
  const src = (from: string): string =>
    readFileSync(resolve(__dirname, from), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('接线换的是算法,不是玩家看到的数', () => {
    expect(`${cnNumber(WORLDS.length)}界${cnNumber(REALMS.length)}境`).toBe('四界二十一境')
    expect(cnNumber(TRIGRAMS.length)).toBe('八')
    expect(cnNumber(HEXAGRAMS.length)).toBe('六十四')
    expect(cnNumber(PALACES.length)).toBe('十二')
    expect(cnNumber(STARS.length)).toBe('十四')
    expect(cnNumber(MANSIONS.length)).toBe('二十八')
    expect(cnNumber(GATES.length)).toBe('八')
    expect(cnNumber(SECRET_LAYERS)).toBe('三')
    expect(cnNumber(EXPEDITION_ROUTE_LAYERS)).toBe('三')
    expect(cnNumber(MUTATION_FIGHTS)).toBe('六')
    expect(cnNumber(PROFILE_MIN_MARKS)).toBe('五')
    expect(cnNumber(ARTIFACT_MAX_SLOTS)).toBe('二')
    expect(REALMS[ARTIFACT_SLOT_UNLOCK_MAJOR]?.name, '法宝位门槛写的是第几个境界,名字得从境界表取').toBe('元婴')
  })

  it('洛书排布句是一张地图:八门各占一宫、中五无门', () => {
    // 视图把这句从 GATES 推出来;表里若出现两门同宫、或门落到中五,那句话就会说谎
    const palaces = GATES.map(g => g.palace)
    expect(new Set(palaces).size, '两门同宫 —— 排布句会漏掉一门').toBe(GATES.length)
    expect(palaces.every(p => p >= 1 && p <= 9)).toBe(true)
    expect(palaces.includes(5), '中五无门,不得有门占中宫').toBe(false)
  })

  it('界域志入口的数量取自 REALMS / WORLDS', () => {
    const view = src('../views/CharacterView.vue')
    expect(view).toContain('cnNumber(WORLDS.length)')
    expect(view).toContain('cnNumber(REALMS.length)')
    expect(view).not.toContain('四界二十一境')
  })

  it('界域志各门的数量取自各自的表(易 / 紫微 / 星象 / 奇门)', () => {
    const view = src('../views/RealmCodexView.vue')
    for (const ref of ['TRIGRAMS.length', 'HEXAGRAMS.length', 'PALACES.length', 'STARS.length', 'MANSIONS.length', 'GATES.length']) {
      expect(view, `界域志应读 ${ref}`).toContain(ref)
    }
    expect(view, '洛书排布句应由 GATES 推出').toContain('luoshuGatesText')
    expect(view, '四象配四界那句应由 IMAGES 推出').toContain('imageWorldMap')
    for (const hand of ['六十四卦', '十二宫所主', '十四主星', '二十八宿']) {
      expect(view, `手抄的「${hand}」应改成从表里数`).not.toContain(hand)
    }
  })

  it('秘境层数取自 SECRET_LAYERS(凡境与天界共用一张卡)', () => {
    const card = src('../components/adventure/SecretRealmCard.vue')
    expect(card).toContain('cnNumber(SECRET_LAYERS)')
    expect(card).not.toContain('三层 · 出则散')
  })

  it('远征行程与变数连战数取自 EXPEDITION_* / MUTATION_FIGHTS', () => {
    // 远征册拆出后判据随本体走。宿主与子面板合扫:拆分只搬了位置,数仍只有一份
    const view =
      src('../views/CelestialView.vue') +
      src('../components/celestial/ExpeditionPanel.vue') +
      src('../components/celestial/TrialPanel.vue')
    expect(view).toContain('cnNumber(EXPEDITION_ROUTE_LAYERS)')
    expect(view).toContain('cnNumber(MUTATION_FIGHTS)')
    expect(view, '界主层判定读常数,不写 3').toContain('EXPEDITION_GUARDIAN_LAYER')
    expect(view, '行程点列不该自己数一遍重数').not.toContain("'一重', '二重', '三重'")
    expect(view).not.toContain('三重已过')
    expect(view).not.toContain('六连战')
  })

  it('法宝位与门槛取自 artifacts.ts,界面与切换构筑共用一份', () => {
    // 法宝册拆出后判据随本体走。宿主与子面板合扫:拆分只搬了位置,规则仍只有一份
    const view = src('../views/InventoryView.vue') + src('../components/inventory/ArtifactPanel.vue')
    expect(view).toContain('artifactSlotsFor(player.major)')
    expect(view).toContain('ARTIFACT_SLOT_UNLOCK_MAJOR')
    expect(view).not.toContain('元婴境开启第二法宝位')
    expect(view, '法宝位规则不该在界面里再写一遍').not.toMatch(/major >= 3 \? 2 : 1/)
    const svc = src('./loadoutService.ts')
    expect(svc, '切换构筑的截断也读同一份规则').toContain('artifactSlotsFor(player.major)')
    expect(svc).not.toMatch(/major >= 3 \? 2 : 1/)
  })

  it('画像门槛与构筑维度取自各自模块', () => {
    const legacy = src('../views/LegacyView.vue')
    expect(legacy).toContain('cnNumber(PROFILE_MIN_MARKS)')
    expect(legacy).not.toContain('道痕未满五则')
    const build = src('../views/BuildView.vue')
    expect(build).toContain('cnNumber(powerRating.labels.length)')
    expect(build).not.toContain('五维评级 ——')
  })
})

/**
 * 手写的门槛与容量 —— 数字的另一种写法:阿拉伯数字 + 单位。
 *
 * 「主脉可投 70 点」「可行流派 3/6」这类句子里的数字同样是抄的,只是长得不像
 * 「二十一境」那样明显。它们抄的是**另一张表**(容量常数、构筑流派数),
 * 而这张表正是最常被调的东西 —— 调完数值,句子还在说旧数。
 */
describe('文案数值对账 · 手写的门槛与容量', () => {
  const src = (from: string): string =>
    readFileSync(resolve(__dirname, from), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('灵脉卡的自陈数字取自 constants(接线换的是算法,不是玩家看到的数)', () => {
    expect(VEIN_MAIN_CAPACITY).toBe(70)
    expect(VEIN_SIDE_CAP).toBe(30)
    expect(VEIN_TOTAL_CAPACITY).toBe(100)
    const card = src('../components/dongfu/VeinInvestCard.vue')
    for (const ref of ['VEIN_MAIN_CAPACITY', 'VEIN_SIDE_CAP', 'VEIN_TOTAL_CAPACITY']) {
      expect(card, `灵脉卡的自陈应读 ${ref}`).toContain(ref)
    }
    for (const hand of ['70 点', '30 点', '总容量 100']) {
      expect(card, `手抄的「${hand}」应改成读常数`).not.toContain(hand)
    }
    // 开启境界那句前瞻也读同一枚 VEIN_UNLOCK_MAJOR:门槛动,「金丹境方启」必须跟着动
    const view = src('../views/DongfuView.vue')
    expect(view, '前瞻应读 VEIN_UNLOCK_MAJOR 所在的境名').toContain('veinGateRealm')
    expect(view, '前瞻不应再手抄「金丹境方启」').not.toContain('金丹境方启此脉')
  })

  it('「不能全部点满」是算术事实:全部脉的上限之和确实超过总容量', () => {
    // 文案这么说,是因为投满所有脉需要的点数 > 总容量;若哪天不成立了,取舍就没了
    const allIn = VEIN_MAIN_CAPACITY + VEIN_SIDE_CAP * (VEINS.length - 1)
    expect(allIn, `共 ${VEINS.length} 条脉,投满需 ${allIn} 点,总容量 ${VEIN_TOTAL_CAPACITY}`)
      .toBeGreaterThan(VEIN_TOTAL_CAPACITY)
  })

  it('「可行流派 x/N」的分母取自 BUILD_PROFILES(界面与生态健康度同源)', () => {
    expect(BUILD_PROFILES.length).toBe(6)
    // 今日天道与挑战书的「可行流派 x/N」随试炼册迁入 components/celestial/TrialPanel.vue
    const view = src('../views/CelestialView.vue') + src('../components/celestial/TrialPanel.vue')
    expect(view, '分母应读构筑流派数').toContain('BUILD_PROFILES.length')
    expect(view, '界面里的分母不该手写').not.toMatch(/\}\}\s*\/6\b/)
    const health = src('./ecosystemHealth.ts')
    expect(health, '健康度的多样性分母也读构筑流派数').toContain('BUILD_PROFILES.length')
    expect(health).not.toMatch(/\/ ?6\b/)
  })

  it('「渡劫→真仙的大跃倍数」由寿元曲线推出(此前文案写 ×100,数据是 ×102)', () => {
    expect(ascensionLeap()).toBe(102)
    const dialog = src('../components/common/ProgressionDialog.vue')
    expect(dialog, '大跃倍数应读 ascensionLeap()').toContain('ascensionLeap()')
    expect(dialog, '手写的 约 ×100 与寿元表差了一档').not.toContain('约 ×100')
  })

  /**
   * 「七/二十 战」这种数字长得最像人话,也最容易被当成装饰 ——
   * 可它读的是一个会变的门槛。界面必须从 SUPPRESS_THRESHOLDS 现取。
   */
  it('镇压门槛的「20」与「胜」都取自 SUPPRESS_THRESHOLDS,界面不手抄', () => {
    // 判据分两处:门槛总纲仍在宿主,逐行进度随地界卡迁走
    const view = src('../views/AdventureView.vue')
    const card = src('../components/adventure/RegionCard.vue')
    expect(view, '总纲应读 minWins').toContain('SUPPRESS_THRESHOLDS.minWins')
    expect(card, '进度应读 needWins').toContain('row.progress.needWins')
    // 这一项数的是胜场:写成「战」会让人以为败场也算(曾因此误导过一次修复)
    expect(view, '门槛说成「胜」而不是「战」').toContain('胜 {{ SUPPRESS_THRESHOLDS.minWins }} 场')
    expect(card, '进度也说成「胜」').toContain('}} 胜')
    expect(view + card, '手写的「20 战」应改读常数').not.toContain('20 战')
  })

  /**
   * 八门带的是**真规则**,不是文案。界面上必须由 rules 派生,
   * 否则改 rules 时那句散文不会跟,玩家读到的与结算里的数当场分家。
   */
  it('八门的行军数值由 gateRuleSummary 派生,图鉴与选门都不手写', () => {
    const view = src('../views/RealmCodexView.vue')
    // 择门在远征准备弹窗里,随远征册迁入 components/celestial/ExpeditionPanel.vue
    const celestial = src('../views/CelestialView.vue') + src('../components/celestial/ExpeditionPanel.vue')
    expect(view, '奇门册应读 gateRuleSummary').toContain('gateRuleSummary(g.rules)')
    expect(celestial, '选门详情应读 gateRuleSummary').toContain('gateRuleSummary(selectedGate.rules)')
  })
})

/**
 * 术语一致性 —— 同一个东西只能有一个名字
 *
 * 起因:同一个"历练中偶遇的随机事件"在项目里有四个近义叫法——奇遇(词条名/成就文案)、
 * 际遇(成就名)、机缘(ft_ 取弃事件)、奇缘(我后来接的连锁)。它们各自是**不同机制**,
 * 但四个近义词并排出现时,玩家会把它们当成一件事(「奇遇概率」涨的是哪一类?)。
 *
 * 约定(写进判据,不再靠记性):
 *   际遇 = 历练中偶遇的随机事件(eventLuck 词条、经历计数)
 *   机缘 = 稀有的取/弃事件(ft_,界域志的机缘取弃)
 *   奇缘 = 阶段性连锁(奇缘录)
 * 另:vein 系统一律叫"灵脉"(不再混用"地脉")。
 */
describe('术语一致性 · 用户可见文本', () => {
  /** 数据里的字符串字面量 + 视图模板(即玩家真正读得到的那部分) */
  const userText = (): { file: string; text: string }[] => {
    const out: { file: string; text: string }[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(resolve(__dirname, dir))) {
        const rel = `${dir}/${entry}`
        if (entry.endsWith('.spec.ts')) continue
        const stat = statSync(resolve(__dirname, rel))
        if (stat.isDirectory()) {
          walk(rel)
          continue
        }
        const src = readFileSync(resolve(__dirname, rel), 'utf8')
        if (entry.endsWith('.vue')) {
          // 只取模板(去掉注释)
          out.push({ file: rel, text: src.split('</script>')[0]!.replace(/<!--[\s\S]*?-->/g, '') })
        } else if (entry.endsWith('.ts')) {
          const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
          out.push({ file: rel, text: [...body.matchAll(/'([^'\\\n]{2,})'/g)].map(m => m[1]!).join('\n') })
        }
      }
    }
    walk('../data')
    walk('../views')
    walk('../components')
    walk('../ui') // 词条名表就在这儿(属性面板上的标签)
    walk('../core') // toast 与区域事件文案也算玩家可见
    return out
  }

  /** 允许保留的例外:这里的地脉说的是村子的风水脉,不是洞府灵脉系统 */
  const ALLOWED = ['须惊动山下一整座村子的地脉']

  it('随机事件一律叫「际遇」:用户可见文本里不再出现「奇遇」', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,16}奇遇.{0,16}/g)) {
        if (ALLOWED.some(a => m[0].includes(a))) continue
        hits.push(`${file} 「${m[0]}」`)
      }
    }
    expect(hits, `「奇遇」应统一为「际遇」(奇缘=连锁、机缘=取弃事件,各留一名):\n${hits.join('\n')}`).toEqual([])
  })

  it('洞府灵脉一律叫「灵脉」:用户可见文本里不再出现用作系统名的「地脉」', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,16}地脉.{0,16}/g)) {
        if (ALLOWED.some(a => m[0].includes(a))) continue
        hits.push(`${file} 「${m[0]}」`)
      }
    }
    expect(hits, `「地脉」应统一为「灵脉」:\n${hits.join('\n')}`).toEqual([])
  })

  it('历练一律叫「历练」:用户可见文本里不再用「探索」指代这件活动', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,16}探索.{0,16}/g)) hits.push(`${file} 「${m[0]}」`)
    }
    expect(hits, `「探索」应统一为「历练」:\n${hits.join('\n')}`).toEqual([])
  })

  it('三个词各指一件事:机缘/际遇/奇缘在用户可见文本里都真的在用', () => {
    const all = userText().map(u => u.text).join('\n')
    for (const term of ['机缘', '际遇', '奇缘']) {
      expect(all, `${term} 一个例子都没有 —— 术语约定与内容脱节了`).toContain(term)
    }
  })

  /**
   * 名与机制同形:先手判定(speed)那条**阈值**不许再叫「出手速度」。
   *
   * 「出手速度提升 6%」读起来是连续收益,真相是「1 + 修正 ≥ 对手速度」的开关:
   * 差一点就完全没有。术语不对,玩家对词条的理解就必然是错的 ——
   * 这条红线盯的是名字,战后分析(两数 + 差额)盯的是解释。
   */
  it('「出手速度」这个名字退休:它实际是阈值判定,一律叫「先手判定」', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,16}出手速度.{0,16}/g)) hits.push(`${file} 「${m[0]}」`)
    }
    expect(hits, `「出手速度」已改名「先手判定」(它是阈值不是连续收益):\n${hits.join('\n')}`).toEqual([])
  })

  it('「历练速度」这个名字退休:它实际只加密同程遭遇,一律叫「历练遇敌」', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,16}历练速度.{0,16}/g)) hits.push(`${file} 「${m[0]}」`)
    }
    expect(hits, `「历练速度」已改名「历练遇敌」(不缩短行程):\n${hits.join('\n')}`).toEqual([])
  })

  it('「历练遇敌加快」退休:加快读起来像缩短行程', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,16}遇敌加快.{0,16}/g)) hits.push(`${file} 「${m[0]}」`)
    }
    expect(hits, `应写成「同程遇敌」(不缩短行程):\n${hits.join('\n')}`).toEqual([])
  })

  it('「灵石获取」「炼器减耗」「际遇概率」这三个过度承诺的名字退休', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,16}(?:灵石获取|炼器减耗|炼器消耗|际遇概率).{0,16}/g)) {
        hits.push(`${file} 「${m[0]}」`)
      }
    }
    expect(hits, `应改成「战利灵石 / 强化减耗 / 历练际遇」:\n${hits.join('\n')}`).toEqual([])
  })

  it('玩家可见处把修炼速度叫修炼速度,不另起修行速度', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      if (file.includes('.spec.')) continue
      for (const m of text.matchAll(/.{0,12}修行速度.{0,12}/g)) hits.push(`${file} 「${m[0]}」`)
    }
    expect(hits, `应与词条名「修炼速度」对齐:\n${hits.join('\n')}`).toEqual([])
  })

  it('「战斗收益更高」退休:好战性格不另加修为或灵石', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,12}战斗收益更高.{0,12}/g)) hits.push(`${file} 「${m[0]}」`)
    }
    expect(hits, `好战只抬遇险与成色:\n${hits.join('\n')}`).toEqual([])
  })

  it('「冲击境界」「突破稳当」退休:进阶成功率不管大关', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/.{0,12}(?:冲击境界|突破稳当|突破前服用).{0,12}/g)) {
        hits.push(`${file} 「${m[0]}」`)
      }
    }
    expect(hits, `应写成小进阶,别承诺破大关:\n${hits.join('\n')}`).toEqual([])
  })

  it('先手判定与首回合伤害各留一名,不许互相借名', () => {
    const all = userText().map(u => u.text).join('\n')
    expect(all, '先手判定(speed)应当出现在用户可见文本里').toContain('先手判定')
    expect(all, '首回合伤害(firstStrike)应当出现在用户可见文本里').toContain('首回合伤害')
    expect(all, '「先手伤害」这个旧名会让两件事混为一谈').not.toContain('先手伤害')
  })
})

/**
 * 界面读同源函数,而不是各写一份。
 *
 * 这一条与上面「视图不手抄数字」同源,只是对象换成了**功能**:法宝的神通说明
 * 会随祭炼等级变(×1.72),装备详情要报共鸣件数,图鉴要讲功用 —— 这些都有
 * 现成的同源函数(artifactActiveText / setCounts / codex 的几个 FuncText)。
 * 界面若绕开它们自己拼,今夜是对的,改数值那一夜就开始撒谎。
 *
 * 故障注入:把 InventoryView 的神通行换回 `row.def.active.desc`,本文件立刻红。
 */
describe('文案数值对账 · 用具三类的界面读同源函数', () => {
  const src = (from: string): string =>
    readFileSync(resolve(__dirname, from), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('法宝卡片的神通说明随祭炼走,等级也不叫「阶」', () => {
    // 法宝册拆出后判据随本体走(components/inventory/ArtifactPanel.vue)
    const view = src('../components/inventory/ArtifactPanel.vue')
    expect(view, '神通说明应读 artifactActiveText(与战斗同一份数值)').toContain('artifactActiveText(')
    expect(view, '不许直接印 0 级文案').not.toMatch(/\.active\.desc/)
    expect(view, '等级说法应读 artifactLevelLabel(「重」,不是「阶」)').toContain('artifactLevelLabel(')
    // 祭炼给多少、至多重:取自 artifacts 的常数,不在界面里另写一份
    expect(view, '祭炼每重的增幅应读 ARTIFACT_LEVEL_BONUS').toContain('ARTIFACT_LEVEL_BONUS')
    expect(view, '祭炼上限应读 ARTIFACT_MAX_LEVEL').toContain('ARTIFACT_MAX_LEVEL')
  })

  /**
   * 付不起时按钮置灰只是第一层:玩家还得看得见差哪一样、差多少。
   * 故障注入:把 canUp 改回只查布尔、删掉行内缺口 → 本条红。
   */
  it('法宝炼化按缺口置灰,行内写清悟道点与灵石各差多少', () => {
    const view = src('../components/inventory/ArtifactPanel.vue')
    expect(view, '禁用态读同一份缺口判定').toContain('artifactShortfall(upCost)')
    expect(view, '禁用态按缺的那一样判,不能拿整个缺口对象当布尔').toContain(
      ':disabled="row.short?.short != null"'
    )
    expect(view, '行内写悟道缺口').toContain('悟道尚差 ${short.wudao}')
    expect(view, '行内写灵石缺口').toContain('灵石尚差 ${formatGN(short.stone)}')
    expect(view, '提示按缺的那一样走').toContain('artifactShortToast(short.short!, {')
    expect(view, '提示与行内读同一份差额').toContain('wudao: short.wudao')
    expect(view, '灵石差额也走同源').toContain('stone: formatGN(short.stone)')
    expect(view, '不许再用笼统的「悟道或灵石不足」').not.toContain('悟道或灵石不足')
  })

  it('功法进修按缺口置灰,行内写清悟道点与残页各差多少', () => {
    const view = src('../components/cultivation/GongfaDialog.vue')
    expect(view, '禁用态读同一份缺口判定').toContain('gongfaUpgradeShort(upCost.value)')
    expect(view, '付得起才不置灰').toContain(':disabled="upShort !== null"')
    expect(view, '行内写悟道缺口').toContain('悟道点尚差 ${Math.max(0, c.wudao - resources.wudao)}')
    expect(view, '行内写残页缺口').toContain('残页尚差 ${Math.max(0, c.page - resources.page)}')
    expect(view, '不许再用笼统的「悟道点或残页不足」').not.toContain('悟道点或残页不足')
  })

  it('装备详情写着共鸣与界域', () => {
    const view = src('../components/equipment/EquipmentDetailDialog.vue')
    expect(view, '共鸣状态应读 setCounts').toContain('setCounts(')
    expect(view, '界域应读 worldNameOfTier').toContain('worldNameOfTier(')
  })

  it('图鉴的用具三类取自 itemText 的功用函数', () => {
    // 装备/法宝/丹药三类已收进 codex 的派生视图,功用行在那里拼;
    // 功法阁仍是两态列表,由视图直接拼 —— 两边都得取同一份文案函数
    const codexSrc = src('../ui/codex.ts')
    for (const fn of ['equipFuncText', 'equipMetaText', 'artifactFuncText', 'artifactMetaText', 'pillFuncText', 'pillMetaText']) {
      expect(codexSrc, `图鉴该用 ${fn} 讲功用与出处`).toContain(fn)
    }
    const view = src('../views/CollectionView.vue')
    for (const fn of ['gongfaFuncText', 'gongfaMetaText']) {
      expect(view, `功法阁该用 ${fn}`).toContain(fn)
    }
  })

  it('功法的神通把几率与威力一起写出来', () => {
    const dlg = src('../components/cultivation/GongfaDialog.vue')
    expect(dlg, '神通几率与主修门槛走同一句').toContain('gongfaSkillLine')
    expect(dlg, '未习得也要给得出圆满账').toContain('previewRows')
  })

  it('丹药详情与丹方清单说得出「服下去会怎样」', () => {
    // 丹方清单随开炉弹窗迁入 BrewingDialog;丹药详情仍在宿主 —— 两处合扫,防只查宿主假绿
    const view = src('../views/InventoryView.vue') + src('../components/inventory/BrewingDialog.vue')
    // 两处都要读同一份:丹药详情弹窗 + 开炉炼丹的方子清单
    const uses = view.match(/pillFuncText\(/g)?.length ?? 0
    expect(uses, '丹药详情与方子清单都该写清效果(同一份 pillFuncText)').toBeGreaterThanOrEqual(2)
    // 熟练度读 lore.recipeMastery 留在宿主(丹药详情),丹方清单本身不重复一份
    expect(src('../views/InventoryView.vue'), '丹方读到几分熟取自 lore.recipeMastery').toContain('recipeMastery(')
  })

  it('丹方熟练度的来路与机制同向 —— 三路都点名', () => {
    // 成功开炉 +0.01、炸炉 +0.02、藏经阁被动钻研都会积累熟练;
    // 文案三路都说清,不把任何一条真实来路藏起来。
    const view = src('../views/InventoryView.vue')
    expect(view, '要说明开炉成功也精进').toContain('开炉')
    expect(view, '要说明藏经阁钻研这条主路').toContain('藏经阁钻研')
    expect(view, '炸炉也长记性是该机制的独特性格').toContain('炸炉都会长记性')
  })

  /**
   * 议题 #130:缺料只说「未足」而不给去路,玩家得自己翻到坊市、再自己往下滚找草。
   * 这条锁住两端:① 缺草时真的给一条带 focus=herb 的入口;② 坊市真接得住这个参数,
   * 且只在渲染出灵草格时才高亮 —— 货架六格随机,没有草还硬指一格就是指错路。
   */
  it('炼丹缺草给去坊市的去路,坊市接住 focus=herb 并只高亮灵草格', () => {
    // 方子行随开炉弹窗迁入 BrewingDialog,判据随本体走
    const inv = src('../components/inventory/BrewingDialog.vue')
    expect(inv, '缺草/草石都缺时该给「去坊市续草」').toMatch(
      /name: 'market', query: \{ focus: 'herb', grade: String\(r\.cost\.grade\) \}/,
    )
    expect(inv, '入口只该在草是短板时出现(不该给掌握不足指路)').toMatch(
      /r\.plan\.reason === 'herb' \|\| r\.plan\.reason === 'both'/,
    )
    // 货架段随本体迁入 MarketShelfSection:判据跟着走
    const market = src('../components/market/MarketShelfSection.vue')
    expect(market, '货架段要读 focus 参数').toContain("route.query.focus === 'herb'")
    expect(market, '按方子要的品阶挑草格(缺灵品却亮凡品,买回来照样开不了炉)').toContain(
      'focusHerbSlot(market.stock, want,'
    )
    expect(market, '认到灵草格后要滚进视口').toContain('scrollIntoView(')
    // 货架六格随机,碰上没有草的那一架:不许静默停住,得说清「这一架没有」
    expect(market, '这一架没有灵草时要明说').toContain('data-focus-herb-missing')
    const host = src('../views/MarketView.vue')
    expect(host, '宿主只切签,不再自己算落点').not.toContain('focusHerbSlot(')
  })

  it('坊市买不起时按钮写出实际差额,不把总价或笼统「灵石不足」当答案', () => {
    const market = src('../components/market/MarketShelfSection.vue')
    expect(market, '卡面要有实际缺口字段').toContain('stoneShort:')
    expect(market, '卡面缺口用指数感知减法').toContain('subClamp(slot.price, resources.spiritStone)')
    expect(market, '按钮直接写出尚差多少').toContain('`尚差 ${formatGN(c.stoneShort)}`')
    expect(market, '扣款瞬时失败也报实际差额').toContain('灵石尚差 ${formatGN(renderSlot(slot).stoneShort)}')
    expect(market, '不再用笼统的灵石不足作按钮文案').not.toContain("? '灵石不足'")
  })

  it('天界道源付不起时按钮置灰并写出实际差额', () => {
    // 天界各册共用 daoSourceShortfall;付不起仍可点,等于让玩家拿一次点击去试余额。
    // 故障注入:把任一处的 `daoSourceShortText(` 换回 `道源不足`,或删掉 :disabled → 本条红。
    const trial = src('../components/celestial/TrialPanel.vue')
    const expedition = src('../components/celestial/ExpeditionPanel.vue')
    const marks = src('../components/celestial/MarksPanel.vue')
    const furnace = src('../components/celestial/FurnaceDialog.vue')
    const souls = src('../views/SoulsView.vue')
    for (const [name, view] of [
      ['试炼册', trial],
      ['远征册', expedition],
      ['道痕册', marks],
      ['天道熔炉', furnace],
      ['器魂', souls]
    ] as const) {
      expect(view, `${name}该用同一份道源差额`).toContain('daoSourceShortText(')
      expect(view, `${name}不许退回笼统道源不足`).not.toContain('道源不足')
    }
    expect(trial, '今日天道付不起要置灰').toContain('endgame.daoSource < CHALLENGE_ENTRY_COST')
    expect(trial, '天道变数付不起要置灰').toContain(':disabled="endgame.daoSource < MUTATION_ENTRY_COST"')
    expect(trial, '天道试炼付不起要置灰').toContain(':disabled="endgame.daoSource < trial.entryCost"')
    expect(expedition, '特殊世界付不起要置灰').toContain('endgame.daoSource < world.entryCost')
    expect(expedition, '虚界重摇付不起要置灰').toContain('endgame.daoSource < VOID_REROLL_COST')
    expect(marks, '道痕重写付不起要置灰').toContain(':disabled="endgame.daoSource < REWRITE_ENTRY_COST"')
    expect(furnace, '道果付不起要置灰').toContain(':disabled="fruitShort.short.m > 0"')
    expect(furnace, '灵石熔铸付不起也要置灰').toContain(':disabled="stoneShort.m > 0"')
    expect(furnace, '灵石熔铸按钮就地写实际差额').toContain('灵石尚差 ${formatGN(stoneShort)}')
    expect(furnace, '灵石熔铸差额走指数感知减法').toContain('subClamp(cost, resources.spiritStone)')
    expect(furnace, '灵石熔铸价与扣费同源').toContain('const cost = furnaceStoneCost()')
    expect(furnace, '灵石熔铸未付时直接写尚差').toContain('熔铸(灵石尚差 ${formatGN(stoneShort)})')
  })

  it('器魂与道童付不起时置灰并写出实际差额', () => {
    const souls = src('../views/SoulsView.vue')
    expect(souls, '凝炼入口读同一份道源缺口').toContain('daoSourceShortfall(SOUL_REFINE_COST, endgame.daoSource)')
    expect(souls, '入炉与确认凝炼都按缺口置灰').toMatch(
      /:disabled="refineShort\.short\.m > 0"[\s\S]{0,500}?:disabled="refineShort\.short\.m > 0"/
    )
    expect(souls, '入炉按钮就地写尚差').toContain('入 炉(尚差${daoSourceShortText(SOUL_REFINE_COST, endgame.daoSource)})')

    const apprentice = src('../views/ApprenticeView.vue')
    expect(apprentice, '道童报价与缺口同源').toContain('apprenticeRecruitShortfall(player.major, resources.spiritStone)')
    expect(apprentice, '招募付不起要置灰').toContain(':disabled="slotsFull || !canAffordRecruit"')
    expect(apprentice, '招募按钮就地写实际差额').toContain('尚差 ${formatGN(recruitShort)} 灵石')
    expect(apprentice, '招募失败 toast 也报实际差额').toContain('灵石尚差 ${formatGN(recruitShort.value)}')
  })

  it('强化缺料时置灰并写出实际差额', () => {
    const detail = src('../components/equipment/EquipmentDetailDialog.vue')
    const panel = src('../components/equipment/UpgradePanel.vue')
    expect(detail, '强化按钮按缺口置灰').toContain(':disabled="upShort !== null"')
    expect(detail, '强化按钮就地写石差/尘差').toContain('强 化(石差')
    expect(detail, '强化按钮就地写尘差').toContain('强 化(尘差')
    expect(panel, '强化面板列实际缺口').toContain('器灵尘尚差 {{ gap.dust }}')
    expect(panel, '强化面板列灵石缺口').toContain('灵石尚差 {{ formatGN(gap.stone) }}')
  })

  /**
   * 只缺灵石时同理:灵石只能从历练/悬赏挣,坊市是花灵石的地方。
   * 若给「去坊市」就是把玩家指反了方向 —— 那里只会再缺一次。
   */
  it('炼丹只缺灵石时指去历练,不给坊市(那儿只有花灵石)', () => {
    const inv = src('../components/inventory/BrewingDialog.vue')
    expect(inv, '只缺灵石给历练去路').toMatch(/r\.plan\.reason === 'stone'/)
    expect(inv, '两条去路互斥,同屏只摆一条').toMatch(/v-else-if="r\.plan\.reason === 'stone'"/)
    // 目标路由也要锁:只断言标签的话,把 link 改回 market 这条测试照样绿
    expect(inv, '灵石那条必须指向历练').toMatch(
      /v-else-if="r\.plan\.reason === 'stone'"[\s\S]{0,200}?:to="\{ name: 'adventure' \}"[\s\S]{0,200}?去历练攒石 →/,
    )
  })

  it('灵兽的性子带数,出处与结算同源', () => {
    const view = src('../views/TitlesView.vue')
    expect(view, '性子该读 petTraitText(与 core/petPersonality 同源)').toContain('petTraitText(')
    expect(view, '出战加成仍走同一份 modsText').toContain('modsText(')
  })

  it('图鉴的用具三类走带深度的派生视图,而不是就地拼两态', () => {
    const view = src('../views/CollectionView.vue')
    for (const fn of ['equipCodex()', 'artifactCodex()', 'pillCodex()']) {
      expect(view, `图鉴该用 ${fn}(含收录深度)`).toContain(fn)
    }
    expect(view, '收录时刻的口径收在 codex,界面不再自己写一份').toContain('collectedTimeText(')
    expect(view, '界面里不该再出现日期格式化的第二份').not.toContain('toLocaleString(')
  })

  it('建号页未定格前有回到欢迎页的入口 —— 否则 web 端建号无退路可比', () => {
    const create = src('../views/CreateView.vue')
    // 路由守卫允许 create→welcome(未开始前);建号全程可逆(无限重掷),
    // 但没有「上一步」控件时 web 端就只能卡在这一页(手机可借系统返回,桌面无处退)
    expect(create, '建号页该有回欢迎页的 RouterLink').toMatch(
      /<RouterLink[\s\S]{0,120}to="\/welcome"[\s\S]{0,240}欢迎/,
    )
  })

  it('登临导览的「天道熔炉」是真按钮 —— 无 href 的 <a> 键盘到不了', () => {
    // 导览弹窗拆出后判据随本体走,宿主与子组件合扫(防只查宿主假绿)
    const view = src('../views/CelestialView.vue') + src('../components/celestial/TutorialDialog.vue')
    expect(view, '天道熔炉该是可聚焦的 button').toMatch(
      /<button[\s\S]{0,240}@click="emit\('close'\)"[\s\S]{0,80}天道熔炉/,
    )
    // 无 href 却挂 @click 的 <a>:不在 Tab 序列里,读屏也只念「链接」
    const deadLinks = [...view.matchAll(/<a\b[^>]*>/g)]
      .map(m => m[0])
      .filter(tag => !/\shref=/.test(tag) && /@click=/.test(tag))
    expect(deadLinks, `这些 <a> 没有 href 却挂了点击:${deadLinks.join(' | ')}`).toEqual([])
  })

  it('凝道果先采样首次教学标志,再执行凝果 —— 否则教学弹窗永不弹出', () => {
    // doCondense 随熔炉/道果弹窗搬进了 components/celestial/FurnaceDialog.vue
    const view = src('../components/celestial/FurnaceDialog.vue')
    const body = /function doCondense\(\)[^{]*\{([\s\S]*?)\n  \}/.exec(view)?.[1] ?? ''
    expect(body, '没读到 doCondense —— 判据会假绿').toContain('shouldShowFruitTutorial')
    // condenseDaoFruit 首次成功时会自己置 seen=true,后读判定恒为假
    const sampleAt = body.indexOf('shouldShowFruitTutorial()')
    const condenseAt = body.indexOf('condenseDaoFruit()')
    expect(sampleAt, 'doCondense 里先采样 shouldShowFruitTutorial()').toBeGreaterThanOrEqual(0)
    expect(condenseAt, 'doCondense 里应调用 condenseDaoFruit()').toBeGreaterThanOrEqual(0)
    expect(sampleAt, 'shouldShowFruitTutorial() 必须在 condenseDaoFruit() 之前采样').toBeLessThan(
      condenseAt,
    )
  })
})
