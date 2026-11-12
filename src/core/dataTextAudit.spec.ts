/**
 * 文案数值对账:说明文本里的数字须与实现一致。
 *
 * 只钉条目自带说明、也自带数值负载的表(变数、秘境随机规则、增益);
 * 其余文案的数字可能来自别的表,硬对只会误报。
 */
import { describe, expect, it } from 'vitest'
import { ARTIFACTS } from '@/data/artifacts'
import { PETS } from '@/data/pets'
import { GONGFA } from '@/data/gongfa'
import { TITLES } from '@/data/titles'
import { SOUL_TYPES } from '@/data/souls'
import { EVENTS, FORTUNE_EVENTS } from '@/data/events'
import { PILLS } from '@/data/pills'
import { MUTATORS } from '@/data/mutators'
import { SECRET_RULES } from '@/data/secretRealms'
import { BUFFS, buffDef } from '@/data/buffs'
import { PACTS } from '@/data/pacts'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
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
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { BUILDINGS } from '@/data/buildings'
import { modsText } from '@/data/statNames'
import { AFFIXES } from '@/data/affixes'
import { STAT_NAMES } from '@/data/statNames'
import { classicalDuration } from '@/data/timeUnits'
import { MARKET_CONSIGN_SECONDS, MARKET_REFRESH_SECONDS } from '@/data/market'

/** 文案里的百分比是否能在同一条目的数值里找到;「降低/减少/下降」类反向措辞允许数值为负 */
function percentBacked(percent: number, nums: number[]): boolean {
  const p = percent / 100
  return nums.some(v => {
    const candidates = [v, Math.abs(v)]
    for (const c of candidates) {
      if (Math.abs(c - p) < 1e-9) return true // x:0.15 = +15%(概率、词条)
      if (Math.abs(c - 1 - p) < 1e-9) return true // 1+x:1.15 = +15%(敌方/治疗倍率)
      if (Math.abs(c - (1 - p)) < 1e-9) return true // 1-x:0.25 = -75%(治疗压制)
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
   * desc 由 STAT_NAMES[key] 派生,数值位只留一个 {v}。
   * 故障注入:把任一条 desc 改回手写旧名,本用例红。
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

describe('文案数值对账 · 天界世界', () => {
  it('世界规则文案的每个百分比,都能在它自己的 rules 里找到', () => {
    let checked = 0
    for (const w of CELESTIAL_WORLDS) {
      const nums = Object.values(w.rules ?? {}).flatMap(v =>
        typeof v === 'number' ? [v] : typeof v === 'object' && v !== null ? Object.values(v) : []
      ) as number[]
      for (const pc of percentsOf(w.ruleText.join(' '))) {
        checked += 1
        expect(percentBacked(pc, nums), `世界「${w.name}」文案写 ${pc}%,rules 里对不上:${w.ruleText.join(' / ')}`).toBe(true)
      }
    }
    expect(checked, '一个百分比都没查到,审计形同虚设').toBeGreaterThan(0)
  })

  /**
   * 反向门:rules 里每个机制都须有一条文案提到它。
   * 实测漏过 —— 四个世界的 enemyExtraMods.critRate(敌方暴击率 +10%~12%)全程生效却没人说过,
   * 玩家只会觉得「这个世界的敌人怎么老暴击」。故障注入:删掉任一条「敌人暴击率」文案即红。
   */
  it('世界 rules 的每个机制都有文案提到,不藏条件', () => {
    /** 数值键 → 文案里该出现的说法;ExtraMods 按「每条词条各给一个判据」查 */
    const HINTS: Record<string, RegExp> = {
      enemyAtkMult: /敌人攻击|敌方攻击/,
      playerAtkMult: /自身攻击|我方攻击/,
      enemyHpMult: /敌方生命|敌人生命|血/,
      healMult: /治疗/,
      shieldCapRatio: /护盾/,
      maxRounds: /回合/,
      perRounds: /每.*回合/
    }
    /** StatMods 键 → 文案说法;新增词条键时这里必须补一行,否则本用例直接红 */
    const MOD_HINTS: Record<string, RegExp> = {
      critRate: /暴击率/,
      critDamage: /暴击伤害/,
      dodgeRate: /闪避/,
      armorPen: /防御|破甲/,
      damageReduction: /受到伤害|减伤/,
      speed: /出手/,
      lifesteal: /吸血/,
      damageBonus: /伤害/,
      defensePct: /防御/
    }
    for (const w of CELESTIAL_WORLDS) {
      const txt = w.ruleText.join(' ')
      for (const [key, val] of Object.entries(w.rules ?? {})) {
        if (key === 'playerExtraMods' || key === 'enemyExtraMods') {
          const who = key === 'playerExtraMods' ? '我' : '敌'
          for (const modKey of Object.keys(val as Record<string, number>)) {
            const hint = MOD_HINTS[modKey]
            expect(hint, `词条键 ${modKey} 没有登记文案判据`).toBeDefined()
            expect(
              hint!.test(txt) && new RegExp(who).test(txt),
              `世界「${w.name}」的 ${key}.${modKey} 全程生效,文案里却没有:${w.ruleText.join(' / ')}`
            ).toBe(true)
          }
          continue
        }
        const hint = HINTS[key]
        expect(hint, `rules 键 ${key} 没有登记判据`).toBeDefined()
        expect(hint!.test(txt), `世界「${w.name}」的 ${key} 全程生效,文案里却没有:${w.ruleText.join(' / ')}`).toBe(true)
      }
    }
  })
})

describe('文案数值对账 · 天道契约', () => {
  /** 契约文案的数字来自 rules,或藏在 special 标记名里(如 'endHp80' 即战后气血 ≥80%),两处都认 */
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
    // 契约文案公式化(「回合上限 25」「道源 ×1.6」),裸数字一起对账;变数/增益文案不适用
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

/** 视图文案对账:只钉已确认归属的几处。判据 = 引用来源 + 不再出现那个字面量 */
describe('文案数值对账 · 视图不手抄数字', () => {
  const src = (from: string): string =>
    readFileSync(resolve(__dirname, from), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('人物页的道果说明与边际收益都取自 DAO_FRUIT_* 常数', () => {
    const view = src('../components/character/RebirthDialog.vue')
    expect(view, '道果每枚加成应读常数').toContain('DAO_FRUIT_CULT_BONUS')
    expect(view, '道躯加成应读常数').toContain('DAO_FRUIT_COMBAT_BONUS')
    expect(view).not.toContain('修行 +3%')
    expect(view).not.toContain('道躯 +1.5%')
    expect(view, '边际收益里的 ×3 也是手抄的,应改成常数').not.toMatch(/effective \* 3\b/)
  })

  it('修行页的闭关文案取自 buffs.ts 的 retreat 本体', () => {
    const view = src('../components/cultivation/RetreatCard.vue')
    expect(view, '闭关时长与加成应读 buff 定义').toContain("buffDef('retreat')")
    expect(view).not.toContain('5 分钟,修炼速度 +150%')
    expect(view).not.toContain('5分钟 修炼 +150%')
  })

  it('坊市售出段的四类价签取自同一套定价函数', () => {
    const sell = src('../components/market/MarketSellSection.vue')
    for (const fn of ['consignPrice(', 'herbSellBatch(', 'materialSellPrice(', 'pillSellPrice(']) {
      expect(sell, `售出段该读 ${fn} 定价`).toContain(fn)
    }
    expect(sell, '批量售出的门槛与按钮文案同源').toContain('MARKET_MAT_COUNT')
    const host = src('../views/MarketView.vue')
    expect(host, '宿主只切签,不再自己拼售出价').not.toMatch(/consignPrice\(|herbSellBatch\(|materialSellPrice\(|pillSellPrice\(/)
  })

  /**
   * 工期文案从秒数常量经 classicalDuration 现算,旧字面量不许回来。
   * 故障注入:把任一处的 `classicalDuration(...)` 换回手打古语,或把常量改掉而文案不动,本用例红。
   */
  it('工期文案从秒数常量现算,不手打古语时辰', () => {
    // 只钉实测写错过的具体字面量,不用泛古语正则(「这一刻」含「刻」,会误伤)
    const shelf = src('../components/market/MarketShelfSection.vue')
    expect(shelf, '货架换新工期应读 MARKET_REFRESH_SECONDS').toContain('MARKET_REFRESH_SECONDS')
    expect(shelf, '货架工期应现算古语对照').toContain('classicalDuration(MARKET_REFRESH_SECONDS)')
    expect(shelf, '货架换新周期是 7200s(一个时辰),不许再写「两时辰」').not.toContain('两时辰')

    const sell = src('../components/market/MarketSellSection.vue')
    expect(sell, '寄卖工期应读 MARKET_CONSIGN_SECONDS').toContain('MARKET_CONSIGN_SECONDS')
    expect(sell, '寄卖工期应现算古语对照').toContain('classicalDuration(MARKET_CONSIGN_SECONDS)')
    expect(sell, '寄卖是 2400s(40 分钟),不许再写「一炷香」(30 分钟)').not.toContain('一炷香')

    const retreat = src('../components/cultivation/RetreatCard.vue')
    expect(retreat, '闭关时长应现算古语对照').toContain('classicalDuration(')
    expect(retreat, '闭关是 300s(5 分钟),不许再写「一炷香」(30 分钟)').not.toContain('一炷香')

    expect(classicalDuration(MARKET_REFRESH_SECONDS)).toBe('一个时辰(2 小时)')
    expect(classicalDuration(MARKET_CONSIGN_SECONDS)).toBe('两刻有余(40 分钟)')
    expect(classicalDuration(buffDef('retreat')!.durationSec)).toBe('将近一刻(5 分钟)')
  })

  it('发布说明里的寄卖工期与 MARKET_CONSIGN_SECONDS 同向', () => {
    // 只断言措辞已改对
    const notes = src('../ui/releaseNotes.ts')
    expect(notes, '寄卖工期不许再写「一炷香」').not.toMatch(/寄卖[\s\S]{0,40}一炷香/)
    expect(notes, '寄卖工期该写「两刻有余(40 分钟)」').toContain('两刻有余')
  })

  it('坊市悬赏板的可交判据与页签圆点读同一份订单投影', () => {
    const board = src('../components/market/BountyBoardSection.vue')
    const rows = src('../composables/useBountyRows.ts')
    const host = src('../views/MarketView.vue')
    expect(rows, '订单投影该由 composable 统一给出').toContain('function renderBounty(')
    expect(rows, '可交判据按四类存货分别算').toContain('inventory.bagItems.some(e => e.tier >= s.tier)')
    expect(rows, '交不齐时给出实际差量').toContain('shortText: anyGrade ? null :')
    expect(board, '按钮直接写投影给出的差量').toContain("b.ready ? '交货' : b.shortText")
    expect(board, '不足回执也带实际差量').toContain('view?.shortText')
    expect(board, '不再退回笼统暂不足').not.toContain("'暂不足'")
    expect(board, '悬赏板读同一份投影').toContain('useBountyRows()')
    expect(host, '页签圆点也读同一份投影').toContain('useBountyRows()')
    expect(host, '宿主不再自己摊订单').not.toContain('renderBounty(')
    expect(host, '圆点不得另起一套可交判据').not.toMatch(/bounty\.orders\.some\(/)
  })

  /**
   * 首页六个入口格:原只有两个带副信息(本世之界、洞府营造),
   * 其余四格各自都有可数的状态,却要打开对应页面才看得到。
   * 现六格都报出实况,且每一条都取既有的同源算法 —— 不另算一遍。
   *
   * 故障注入:把任一条改成写死的字面量,本条红。
   */
  it('首页六格都报实况,且各取同源算法', () => {
    const home = src('../views/HomeView.vue')
    const WANT: Array<[string, string]> = [
      ['天界', '今日天道未应'],
      ['坊市', '刷新中'],
      ['道童', '无道童'],
      ['修行志', '日课余'],
      ['洞府', '已启']
    ]
    for (const [tile, word] of WANT) {
      expect(home, `${tile}格没有实况`).toContain(word)
    }
    // 每条实况都从既有算法来,不自己判断
    expect(home, '天劫闸门须与 store 同一份').toContain('dailyDoneDay')
    expect(home, '坊市倒计时须走 marketService').toContain('marketRemainingSec(')
    expect(home, '道童闲置须查 task').toContain("apprentices.filter(a => !a.task)")
    expect(home, '日课余数须由 dailyRows 现算').toContain('dailyRows.value.filter(t => !t.done)')
    // 货架未同步过时不报倒计时:那时 remainingSec 也是 0,会写成「刷新中」
    expect(home, '未同步时不报').toContain('market.stockedAt > 0 ?')
  })

  it('首页修行志格报出未成的日课数,且与弹窗同源', () => {
    const home = src('../views/HomeView.vue')
    expect(home, '格上该报余数').toContain('日课余')
    expect(home, '余数须由 dailyRows 现算').toContain('dailyRows.value.filter(t => !t.done)')
    // 弹窗与格上读同一份 dailyRows,不各算一遍(模板里不带 .value,computed 里带)
    expect(home, '弹窗该读 dailyRows').toContain('v-for="t in dailyRows"')
    // 模板里那一行必须真的插值 dailyLeft,不是写死的数
    expect(home, '格上该插值 dailyLeft').toMatch(/\{\{\s*dailyLeft\s*>\s*0\s*\?/)
  })

  it('墙钟域的倒计时不随引擎暂停冻结', () => {
    const sell = src('../components/market/MarketSellSection.vue')
    const rows = src('../composables/useBountyRows.ts')
    const home = src('../views/HomeView.vue')
    for (const [name, text] of [
      ['售出段', sell],
      ['悬赏订单投影', rows],
      ['主页日课倒计时', home]
    ] as const) {
      expect(text, `${name}应读墙钟读数`).toContain('useWallNow()')
      expect(text, `${name}不得走暂停冻结的游戏时钟`).not.toMatch(/useNow\(|useGameClock\(/)
    }
    expect(home, '日课倒计时要以墙钟读数驱动本地午夜计算').toContain(
      'formatCountdown(secsUntilNextMidnight(now.value))'
    )
  })

  it('今日天道题面随墙钟日号刷新,不许停在跨午夜的旧题上', () => {
    const trial = src('../components/celestial/TrialPanel.vue')
    expect(trial, '试炼册要读墙钟日号').toContain('useWallNow()')
    expect(trial, '日号要从墙钟读数派生').toContain('localDayNum(wallNow.value)')
    // 裁判是分块异步的(单次 54ms × 最多 32 候选,同步跑会卡住页签);仍须接收响应式日号
    expect(trial, '天道裁判要接收响应式日号').toContain('todayChallengeAsync(day)')
    // 日号变化要能触发重算 —— 挂在 watch 上而不是只算一次
    expect(trial, '日号变化须触发重算').toMatch(/watch\([\s\S]{0,200}wallDay\.value/)
    expect(trial, '不许退回无参 todayChallenge(),否则跨午夜不会重算').not.toMatch(
      /const daily = computed\(\(\) => \(endgame\.daoPath \? todayChallenge\(\) : null\)\)/
    )
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

  /**
   * 可冻结域的到期判定读 gameNow(),不读 Date.now()(纪律见 enginePause 头注释)。
   * 这五份文件的到期时间都在 shiftTimedState 的顺延名单里(player.ts / adventure.ts / earlyGameService.ts)。
   * 故障注入:把其中任何一处 gameNow() 改回 Date.now(),本用例红。
   */
  it('可冻结域的到期判定不读墙钟', () => {
    const strip = (from: string): string =>
      readFileSync(resolve(__dirname, from), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
    for (const rel of [
      './eventEngine.ts',
      './earlyGameService.ts',
      './regionEvent.ts',
      './divinationService.ts',
      './pillService.ts'
    ] as const) {
      expect(strip(rel), `${rel} 不得直接读 Date.now()(可冻结域)`).not.toMatch(/Date\.now\(\)/)
    }
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
 * 视图数量对账:页面写的数量(四界二十一境、六十四卦、三层…)由来源表数出,原字面量须消失;
 * 同时钉住数值不变。
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
    // 排布句由 GATES 推出:两门同宫或门落中五,该句即失真
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
    expect(card, '秘境入口该读统一在途判据').toContain('endgameBusy(endgame.worldRun, player.secretRealm, useAdventureStore().session)')
    /*
     * 一行的事实收在 realmRow 里一次算齐(原先模板对同一处反复调用十二次),
     * 故这三条按**字段**认,不再按模板里的函数调用认 —— 语义不变:
     * 在途原因要显示、disabled 要同时拒绝在途、拒因取自统一判据。
     */
    expect(card, '在途原因要显示到卡面').toContain(':title="row.block ?? undefined"')
    expect(card, '卡面也要把拒因写出来').toContain('{{ row.block }}')
    expect(card, '入口 disabled 必须走合判据').toContain(':disabled="!row.payable"')
    expect(card, 'canPay 必须同时拒绝在途活动').toContain("const block = busy.value ? busy.value.reason : (short?.reason ?? null)")
  })

  /**
   * 在途互斥是双向的:别的活动在途时不许开历练,历练在途时也不许开别的。
   * 若远征在途时放行「出发」,历练心跳与 runSnap 携带气血会同时推进。
   * core 的 startExploration 与历练页「出发」都问统一判据 endgameBusy。
   * 故障注入:删掉 core 里那一支,core 断言红;把界面前置改回只问闭关,界面断言红。
   */
  it('历练与终局的在途互斥是双向的,核心与界面共用 endgameBusy', () => {
    const core = src('./exploration.ts')
    expect(core, 'startExploration 该问统一在途判据').toContain('endgameBusy(useEndgameStore().worldRun, null, null)')
    expect(core, '拒因取判据本体,不再手抄一句').toContain('ui.toast(busy.reason, \'warn\')')
    const view = src('../views/AdventureView.vue')
    expect(view, '出发前置也要认出远征/秘境在途').toContain('endgameBusy(endgame.worldRun, player.secretRealm, null)')
    expect(view, '前置拒因同样取判据本体').toContain('ui.toast(busy.reason, \'warn\')')
    // 秘境入口也归入同一份判据
    const secret = src('./secretRealm.ts')
    expect(secret, '秘境入口该读统一在途判据').toContain('endgameBusy(endgame.worldRun, player.secretRealm, useAdventureStore().session)')
    expect(secret, '秘境入口拒因取判据本体').toContain('return { ok: false, reason: busy.reason }')
    expect(secret, '秘境入口不许再手抄一份拒因').not.toContain('须先结束远征方能入秘境')
  })

  /**
   * 四个在途状态词以 endgameActivity 的 BUSY_REASON 为准(AGENTS.md 明文)。
   *
   * 有六处拒绝路径并不经过 endgameBusy(闭关与历练互斥的两端、秘境入口自己那道门、
   * 首页状态行、以及历练页开模式窗前的闭关拦截),从前各自手抄一份字面量 ——
   * 改词就得全仓搜,漏一处就出现两套说法。
   *
   * 闭关与历练互斥是**一对**:startRetreat 拦「历练在途」、chooseMode 与 startExploration
   * 拦「闭关中」。前四处早改成了常量,这一对的两处一直手抄着 ——
   * 于是「改词」这件事在互斥关系的两端只剩一边有人管。
   *
   * 故障注入:把任一处改回字面量,本条红。
   */
  it('四个在途状态词只有一份出处,各处取 BUSY_REASON', () => {
    const SITES = [
      ['../core/exploration.ts', 'startExploration'],
      ['../core/earlyGameService.ts', 'startRetreat'],
      ['../core/secretRealm.ts', '秘境入口'],
      ['../ui/homeStatus.ts', '首页状态行'],
      ['../views/AdventureView.vue', '历练页的闭关拦截'],
      ['../core/endgameActivity.ts', '判据本体']
    ] as const
    const WORDS = ['闭关中', '远征在途', '身在秘境', '历练在途']
    for (const [path, name] of SITES) {
      const body = src(path)
      for (const w of WORDS) {
        // 判据本体是唯一允许写字面量的地方
        if (name === '判据本体') continue
        expect(body, `${name}又手抄了「${w}」`).not.toContain(`'${w}'`)
      }
    }
    // 判据本体确实定义了四个词
    const hub = src('../core/endgameActivity.ts')
    for (const w of ['闭关中', '远征在途', '身在秘境', '历练在途']) {
      expect(hub, `BUSY_REASON 缺「${w}」`).toContain(`'${w}'`)
    }
    expect(hub, '该导出成常量').toContain('export const BUSY_REASON')
  })

  /**
   * 入口前置拒因同规:一句话只写一处。
   *
   * 「未择道途」拦的是真仙已至却还没去道途页选道 —— 远征 / 天道试炼 / 天道变数 /
   * 虚界窥探四个入口各抄了一遍。与在途那四个词同一种毛病:改词得全仓搜。
   */
  it('入口前置拒因也只有一份出处', () => {
    const SITES = [
      ['../core/expedition.ts', '远征与虚界'],
      ['../core/endgameService.ts', '试炼与变数']
    ] as const
    for (const [path, name] of SITES) {
      expect(src(path), `${name}又手抄了「未择道途」`).not.toContain("'未择道途'")
      expect(src(path), `${name}该读 ENTRY_REASON`).toContain('ENTRY_REASON.noDaoPath')
    }
    const hub = src('../core/endgameActivity.ts')
    expect(hub, 'ENTRY_REASON 缺「未择道途」').toContain("noDaoPath: '未择道途'")
  })

  /**
   * 紫微十二宫各有「所给之路」:data/ziwei 的 channel(修行/同道/因缘/灵兽…)。
   * 原先界面只写「所主 · 管什么」,说不到它落在哪一路 —— 而十二宫各管一路正是这张盘的骨架。
   *
   * 故障注入:把模板里那枚签删掉,本条红。
   */
  it('紫微逐宫标出所给之路,且取 data 的 channel', () => {
    const view = src('../views/RealmCodexView.vue')
    expect(view, '逐宫说明该带 channel').toContain('row.palace.channel')
    expect(view, '该挂一枚签').toContain('fate-channel')
    // 十二宫的 channel 两两不同(各管一路),数据侧也要对
    const channels = PALACES.map(p => p.channel)
    expect(new Set(channels).size, '十二宫的 channel 有重复').toBe(channels.length)
    for (const c of channels) expect(c.length, `channel「${c}」过长`).toBeLessThanOrEqual(3)
  })

  it('窄屏下宫名与说明不挤成竖条(flex-wrap 不可去)', () => {
    const view = src('../views/RealmCodexView.vue')
    // 320 宽下宫名 + 签 + 星名 + 说明挤不下,说明会被压成每行两三个字
    const at = view.indexOf('row.palace.channel')
    // 取那一段:往前到上一处 v-for,往后到这一段结束
    const start = view.lastIndexOf('v-for="row in fateRows"', at)
    const seg = view.slice(start, at)
    expect(seg, '那一行该允许换行').toContain('flex-wrap')
    // 说明列的下界在签之后
    const tail = view.slice(at, at + 800)
    expect(tail, '说明列该有下界').toContain('min-w-')
  })

  /**
   * 词条名是玩家在行囊卡、转移面板、战报里认词条的唯一凭据:
   * 曾有两个都叫「破妄」(增伤 dmg1 与 命中 ac2),同屏两个「破妄」加不同效果,分不清谁是谁。
   * 故障注入:把任一词条名改成与另一条相同,本条红。
   */
  it('词条名唯一', () => {
    const byName = new Map<string, string[]>()
    for (const a of AFFIXES) {
      const ids = byName.get(a.name) ?? []
      ids.push(`${a.id}(${a.key})`)
      byName.set(a.name, ids)
    }
    const dup = [...byName.entries()].filter(([, ids]) => ids.length > 1)
    expect(dup.map(([n, ids]) => `${n}: ${ids.join('/')}`), '词条重名会让同屏两件装备的说明分不清').toEqual([])
  })

  /**
   * 建筑的 mods 走卡片另一行 modsText(见 BuildingCard.modLine),不进 effectText:
   * effectText 只写主职能,词条行把 mods 逐项译成中文名(修炼速度 / 灵气恢复 / 战斗修为…)。
   * 判据:mods 的每个键都要能被 modsText 译出中文名,不许漏出原始键名。
   * 故障注入:往任一建筑 mods 里塞一个 statNames 不认识的键,本条红。
   */
  it('建筑 mods 的每一项都由词条行译出中文名', () => {
    let checked = 0
    for (const b of BUILDINGS) {
      if (!b.mods) continue
      const text = modsText(b.mods(b.maxLevel))
      for (const key of Object.keys(b.mods(b.maxLevel))) {
        expect(text, `建筑「${b.name}」的 ${key} 没有中文名,词条行会漏出原始键`).toMatch(/[\u4e00-\u9fa5]/)
        checked += 1
      }
      expect(text, `建筑「${b.name}」词条行漏出原始 StatMods 键`).not.toMatch(/[a-z][A-Z]|Pct\b/)
    }
    expect(checked, '一个键都没查到,审计形同虚设').toBeGreaterThan(0)
  })

  /**
   * 在途拒因不许在界面重抄一遍:endgameBusy 已经给出 reason,
   * 手写 `busy.kind === 'expedition' ? '远征在途' : …` 抄了三处九份,改词就会漏改。
   *
   * 判据里的 `.value` 必须先抹掉:面板里的 busy 是 `computed`,写出来是 `busy.value.kind`,
   * 而原先的正则只认 `busy.kind` —— TrialPanel 的「立 约」按 kind 三元映射重抄了一份,
   * 这条守卫从头到尾都是绿的。抹掉后两种写法同一把尺,漏抄才会被抓。
   *
   * 故障注入:把任一面板改回三元映射,本条红。
   */
  it('终局面板的在途拒因一律取 busy.reason,不再按 kind 手抄', () => {
    // 抹掉 computed 的 .value:否则 `busy.value.kind` 绕过下面所有按 `busy.` 写的判据
    const panels = ['ExpeditionPanel', 'TrialPanel', 'MarksPanel'].map(n =>
      src(`../components/celestial/${n}.vue`).replace(/\.value\b/g, '')
    )
    let hits = 0
    for (const [i, body] of panels.entries()) {
      const name = ['远征', '天劫', '道痕'][i]!
      expect(panels[i], `${name}面板该读 busy.reason`).toContain('busy.reason')
      expect(panels[i], `${name}面板又按 kind 手抄了在途拒因`).not.toMatch(/busy\.kind\s*===/)
      hits += (body.match(/busy\.reason/g) ?? []).length
    }
    expect(hits, '一处 busy.reason 都没读到,断言形同虚设').toBeGreaterThanOrEqual(5)
  })

  it('入口按钮只写代价与余量 —— 收益归卡面,不塞进主词后面把自己撑成两行', () => {
    /*
     * 实测:390 宽下「启 程(道源 20 · 余 1,200 · 破界底赏 60)」折成两行,
     * 括号里断在「破界底赏 / 60」处。三样里面「破界底赏」是**收益**,
     * 按本站文案纪律(按钮写代价或拒因,收益归卡面)不该在按钮里。
     *
     * 远征改掉之后,天道变数与天道试炼还留着同一个写法(「破解得 55」「功成得 45」),
     * 同屏对比「启 程(道源 20 · 余 1,200)」一眼就看出两套 —— 故三处一并扫。
     */
    const expedition = src('../components/celestial/ExpeditionPanel.vue')
    expect(expedition, '卡面要摊出入界代价与破界底赏').toMatch(/入界 \{\{ world\.entryCost \}\} 道源 · 破界底赏/)
    expect(expedition, '虚界之门同样摊在卡面').toMatch(/入界 \{\{ endgame\.voidWorld\.entryCost \}\} 道源 · 破界底赏/)
    // 按钮里的文案不许再出现收益:它只报代价与余量
    for (const m of expedition.matchAll(/启 程\(([^`]*?)`/g)) {
      expect(m[1] ?? '', `启程按钮里不该夹收益:${(m[1] ?? '').slice(0, 60)}`).not.toContain('破界底赏')
    }

    const trial = src('../components/celestial/TrialPanel.vue')
    expect(trial, '变数卡面要摊出入界代价与破解所得').toMatch(
      /入界 \{\{ MUTATION_ENTRY_COST \}\} 道源 · 破解得 \{\{ MUTATION_BASE_REWARD \}\}/
    )
    expect(trial, '试炼卡面要摊出入界代价与功成所得').toMatch(
      /入界 \{\{ row\.def\.entryCost \}\} 道源 · 功成得 \{\{ row\.def\.rewardDaoSource \}\}/
    )
    // 按钮里同样只报代价与余量;两种主词(应 战 / 应 试)都扫
    for (const m of trial.matchAll(/应 [战试]\(([^`]*?)`/g)) {
      const inner = m[1] ?? ''
      for (const word of ['破解得', '功成得', 'rewardDaoSource', 'MUTATION_BASE_REWARD']) {
        expect(inner, `天道变数/试炼按钮里不该夹收益(${word}):${inner.slice(0, 60)}`).not.toContain(word)
      }
    }
  })

  it('远征行程与变数连战数取自 EXPEDITION_* / MUTATION_FIGHTS', () => {
    // 宿主与子面板合扫
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
    // 宿主与子面板合扫
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

/** 手写门槛与容量对账(阿拉伯数字 + 单位,如「主脉可投 70 点」「可行流派 3/6」):须读容量常数与构筑流派数 */
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
    const view = src('../views/DongfuView.vue')
    expect(view, '开启境界应读 VEIN_UNLOCK_MAJOR 所在的境名').toContain('veinGateRealm')
    expect(view, '开启境界不应手抄「需金丹境」').not.toContain('需金丹境')
  })

  it('「不能全部点满」是算术事实:全部脉的上限之和确实超过总容量', () => {
    const allIn = VEIN_MAIN_CAPACITY + VEIN_SIDE_CAP * (VEINS.length - 1)
    expect(allIn, `共 ${VEINS.length} 条脉,投满需 ${allIn} 点,总容量 ${VEIN_TOTAL_CAPACITY}`)
      .toBeGreaterThan(VEIN_TOTAL_CAPACITY)
  })

  it('「可行流派 x/N」的分母取自 BUILD_PROFILES(界面与生态健康度同源)', () => {
    expect(BUILD_PROFILES.length).toBe(6)
    // 今日天道与挑战书的「可行流派 x/N」在 TrialPanel
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

  it('镇压门槛的「20」与「胜」都取自 SUPPRESS_THRESHOLDS,界面不手抄', () => {
    // 门槛总纲在宿主,逐行进度在地界卡
    const view = src('../views/AdventureView.vue')
    const card = src('../components/adventure/RegionCard.vue')
    expect(view, '总纲应读 minWins').toContain('SUPPRESS_THRESHOLDS.minWins')
    expect(card, '进度应读 needWins').toContain('row.progress.needWins')
    // 数的是胜场:写成「战」会被读成败场也算
    expect(view, '门槛说成「胜」而不是「战」').toContain('胜 {{ SUPPRESS_THRESHOLDS.minWins }} 场')
    expect(card, '进度也说成「胜」').toContain('}} 胜')
    expect(view + card, '手写的「20 战」应改读常数').not.toContain('20 战')
  })

  it('八门的行军数值由 gateRuleSummary 派生,图鉴与选门都不手写', () => {
    const view = src('../views/RealmCodexView.vue')
    // 择门在远征准备弹窗里
    const celestial = src('../views/CelestialView.vue') + src('../components/celestial/ExpeditionPanel.vue')
    expect(view, '奇门册应读 gateRuleSummary').toContain('gateRuleSummary(g.rules)')
    expect(celestial, '选门详情应读 gateRuleSummary').toContain('gateRuleSummary(selectedGate.rules)')
  })
})

/**
 * 术语一致性:同一个东西只能有一个名字。
 *   际遇 = 历练中偶遇的随机事件(eventLuck 词条、经历计数)
 *   机缘 = 稀有的取/弃事件(ft_,界域志的机缘取弃)
 *   奇缘 = 阶段性连锁(奇缘录)
 *   vein 系统一律叫"灵脉",不叫"地脉"
 */
describe('视图 · 跨天读数须挂响应式时间源', () => {
  /*
   * localDayNum(Date.now()) 写在 computed 里没有响应式依赖:时间推进不会触发重算。
   * 玩家开着首页跨过午夜,同屏的「距换日 N」会归零重计,而「今日天道已应」还停在昨天。
   *
   * 实测(playwright clock,23:59 → 00:01):
   *   Date.now() 版:已应 → 已应(不变,错)
   *   now.value 版:已应 → 未应(对)
   *
   * 同一文件里 marketLeft / tilRollover 读的都是 now.value,只有这一处漏了。
   * 本条把「凡按墙钟日判的 computed,时间参数不得是 Date.now()」钉住。
   */
  const WALL_DAY_FILES = ['views/HomeView.vue', 'components/celestial/TrialPanel.vue']

  it('HomeView 的今日天道读 now.value,不读 Date.now()', () => {
    const src = readFileSync(resolve(__dirname, '../views/HomeView.vue'), 'utf-8')
    // 跳过 import 那一行,取真正的调用处
    const line = src.split('\n').find(l => l.includes('localDayNum(') && !l.trimStart().startsWith('import'))
    expect(line, '找不到 localDayNum 调用').toBeDefined()
    expect(line!, '时间参数须是响应式的 now.value').not.toContain('Date.now()')
    expect(line!, '应读 now.value').toContain('now.value')
  })

  it('TrialPanel 的今日试炼同样读响应式墙钟', () => {
    const src = readFileSync(resolve(__dirname, '../components/celestial/TrialPanel.vue'), 'utf-8')
    const line = src.split('\n').find(l => l.includes('localDayNum(') && !l.trimStart().startsWith('import'))
    expect(line, '找不到 localDayNum 调用').toBeDefined()
    expect(line!, '时间参数须是响应式的 wallNow.value').not.toContain('Date.now()')
    expect(line!, '应读 wallNow.value').toContain('wallNow.value')
  })

  it('两处都用了墙钟组合式,不是游戏时钟', () => {
    // 今日闸门按墙钟日(本地日)判,游戏暂停时不该冻住 —— 故用 useWallNow 而非 useNow
    const home = readFileSync(resolve(__dirname, '../views/HomeView.vue'), 'utf-8')
    const trial = readFileSync(resolve(__dirname, '../components/celestial/TrialPanel.vue'), 'utf-8')
    expect(home, 'HomeView 该用 useWallNow').toContain('useWallNow')
    expect(trial, 'TrialPanel 该用 useWallNow').toContain('useWallNow')
  })

  it('这两份文件确实在 walls 清单里 —— 新增同类页面时记得补进来', () => {
    for (const f of WALL_DAY_FILES) {
      expect(readFileSync(resolve(__dirname, '..', f.replace(/^src\//, '')), 'utf-8'), `${f} 不在清单内`).toContain('localDayNum')
    }
  })
})

describe('术语一致性 · 用户可见文本', () => {
  /** 用户可见文本:数据里的字符串字面量 + 视图模板 */
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
    walk('../ui') // 含词条名表
    walk('../core') // toast 与区域事件文案
    /*
     * 扫到的文件数下限。
     *
     * 上面五条术语检查全是 `expect(hits).toEqual([])` 的形状 —— 扫不到文件,
     * hits 自然为空,五条全绿,而它们什么都没验。
     * 实测把五处 walk 全指向一个空目录:只有两条恰好带独立完整性断言的报红,
     * 另外三条静默通过。目录改名、.vue 改成别的后缀、walk 漏掉某个入口,都会走到这条路上。
     *
     * 下限按现网规模取:改动时若真删了整片文件,这条会提醒一并下调。
     */
    if (out.length < 60) {
      throw new Error(`用户可见文本只扫到 ${out.length} 个文件(应 ≥60)—— 术语检查没扫到东西`)
    }
    return out
  }

  /**
   * 空态文案须是「暂无 + 具体名词」或「无可 + 动词」,不许用泛化的兜底词。
   *
   * 规范里空态一节写的是「优先『暂无 + 具体名词』(暂无战报 / 暂无丹药 / 暂无灵兽);
   * 有对象但无可操作的写『无可 + 动词』(无可化尘)」。
   * 实测踩过:属性构成弹窗(标题「XX · 来源明细」)空着时写的是「暂无数据」——
   * 「数据」是抽象兜底词,玩家看不出到底是缺什么。改为「暂无来源」后与标题对得上。
   *
   * 只禁这两个已经踩过的泛化词,不做「名词必须来自白名单」那种强约束 ——
   * 名词是本项目的自然语言,列白名单会逼着每加一个空态就改一次 spec。
   */
  const VAGUE_EMPTY = ['暂无数据', '暂无内容']

  /** 例外:此处「地脉」指村子的风水脉,不是洞府灵脉系统 */
  const ALLOWED = ['须惊动山下一整座村子的地脉']

  it('空态不用泛化的兜底词', () => {
    const bad: string[] = []
    for (const { file, text } of userText()) {
      for (const phrase of VAGUE_EMPTY) {
        if (text.includes(phrase)) bad.push(`${file} → 「${phrase}」`)
      }
    }
    expect(bad, '空态写「暂无数据」这类抽象词,玩家看不出缺的是什么').toEqual([])
  })

  /**
   * 数字与单位之间的空格,两个方向都踩过:
   *   阿拉伯数字紧贴单位(「3分钟」「949.6万灵石」) —— 全站规约是留一个空格
   *   汉字数字也加了空格(「至多 六 重」) —— 中文里「六重」不该断开,而同句的「祭炼一重」正是无空格
   *
   * 判据按两种数字分开查:formatGN / Math.round 一类出阿拉伯数字,`cnNumber` 出汉字数字。
   * 故障注入:任一处改回去,本条红。
   */
  it('数字与单位之间的空格:阿拉伯数字留、汉字数字不留', () => {
    /*
     * 「回合」原本不在表里,于是四处「{{ row.rounds }}回合」一路粘着没人管 ——
     * 而同一个界面的旁处(GauntletPanel / TrialPanel / RegionCard)写的是「}} 回合」。
     * 漏一档就等于漏了一整类写法,表宁全勿缺。
     */
    const ARABIC_UNITS = ['分钟', '小时', '灵石', '修为', '灵草', '玄铁', '器灵尘', '回合']
    const CN_UNITS = ['重', '层', '阶', '场', '次', '部', '卦', '档', '主星', '连战', '位']

    for (const { file, text } of userText()) {
      // 阿拉伯数字紧贴单位。只认「数字类插值」——「{{ 品阶 }}灵草」是构词(上品灵草),不是数字接单位
      for (const u of ARABIC_UNITS) {
        const hits = [...text.matchAll(new RegExp(`\\{\\{([^}]*)\\}\\}(?!\\s)${u}`, 'g'))]
        const glued = hits
          /*
           * 认「这一格是数字」。除了格式化函数与算术,还要认 `rounds` / `Rounds` ——
           * 它们本身就是整数读数,而 `{{ row.rounds }}回合` 正是原先漏掉的那一类:
           * 只按 Math.round 认的话,这四个字一辈子抓不到(第一次写就是这样,注入后仍绿)。
           */
          .filter(m => /formatGN|formatNum|formatGap|Math\.round|Math\.floor|\.toFixed|Cost|Short|price|Price|rounds|Rounds/.test(m[1]!))
          .map((): string => `}}${u}`)
        expect(glued, `${file}:「}}${u}」缺空格`).toEqual([])
      }
      // 汉字数字后面又加空格
      for (const u of CN_UNITS) {
        // 中间隔着模板的 }} —— 汉字数字经 cnNumber 出来后先落到模板,再到单位
        const spaced = text.match(new RegExp(`cnNumber\\([^)]*\\)\\s*\\}\\}\\s{2,}${u}`, 'g')) ?? []
        expect(spaced, `${file}:cnNumber 之后「${u}」前多了空格`).toEqual([])
      }
    }
  })

  /**
   * 冒号:中文文本里全站用半角,403 处如此;全角只有 3 处,且都是「名字 + 说明」这一种结构 ——
   * 同类结构在 ArtifactPanel 里写的是半角(「}}」:{{ … }})。同一种结构两种标点,读者会以为有别。
   *
   * 故障注入:把任一处改回全角,本条红。
   */
  it('冒号一律半角,与全站同一', () => {
    const hits: string[] = []
    for (const { file, text } of userText()) {
      for (const m of text.matchAll(/[\u4e00-\u9fa5》」]\s*：/g)) {
        hits.push(`${file} 「${m[0]}」`)
      }
    }
    expect(hits, `这些地方用了全角冒号:\n${hits.join('\n')}`).toEqual([])
  })

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

  /** 先手判定(speed)是「1 + 修正 ≥ 对手速度」的阈值开关,不是连续收益 */
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
 * 界面读同源函数(artifactActiveText / setCounts / codex 的几个 FuncText),不自己拼。
 * 故障注入:把 ArtifactPanel 的神通行换回 `row.def.active.desc`,本用例红。
 */
describe('文案数值对账 · 用具三类的界面读同源函数', () => {
  const src = (from: string): string =>
    readFileSync(resolve(__dirname, from), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('法宝卡片的神通说明随祭炼走,等级也不叫「阶」', () => {
    const view = src('../components/inventory/ArtifactPanel.vue')
    expect(view, '神通说明应读 artifactActiveText(与战斗同一份数值)').toContain('artifactActiveText(')
    expect(view, '不许直接印 0 级文案').not.toMatch(/\.active\.desc/)
    expect(view, '等级说法应读 artifactLevelLabel(「重」,不是「阶」)').toContain('artifactLevelLabel(')
    expect(view, '祭炼每重的增幅应读 ARTIFACT_LEVEL_BONUS').toContain('ARTIFACT_LEVEL_BONUS')
    expect(view, '祭炼上限应读 ARTIFACT_MAX_LEVEL').toContain('ARTIFACT_MAX_LEVEL')
    /**
     * 神鞭/无相念珠的神通主体、神魔镜的回补不随祭炼再涨,总纲不得无条件承诺神通也涨。
     * 故障注入:把「通常」删回「被动与神通各强」,本用例红。
     */
    expect(view, '总纲要留出「并非每件都涨神通」的余地').toContain('通常各强')
    expect(view, '不许再无条件承诺神通也涨').not.toContain('被动与神通各强')
  })

  /** 故障注入:把 canUp 改回只查布尔、删掉行内缺口,本用例红 */
  it('法宝炼化按缺口置灰,行内写清悟道点与灵石各差多少', () => {
    const view = src('../components/inventory/ArtifactPanel.vue')
    expect(view, '禁用态读同一份缺口判定').toContain('artifactShortfall(upCost)')
    // 满重时也禁用(按钮不再消失),故判据取「缺一样 + 满重」两段都写出来
    expect(view, '禁用态按缺的那一样判,不能拿整个缺口对象当布尔').toContain(':disabled="!row.upCost || row.short?.short != null"')
    expect(view, '满重不隐藏按钮,改为禁用并写原因').toContain('<template v-else>已至上限</template>')
    expect(view, '行内写悟道缺口').toContain('悟道点尚差 ${short.wudao}')
    expect(view, '行内写灵石缺口').toContain('灵石尚差 ${formatGap(short.stone)}')
    expect(view, '行内不再缀 toast 的来路提示').not.toContain('artifactShortToast(')
    expect(view, '不许再用笼统的「悟道或灵石不足」').not.toContain('悟道或灵石不足')
  })

  it('功法进修按缺口置灰,行内写清悟道点与残页各差多少', () => {
    const view = src('../components/cultivation/GongfaDialog.vue')
    expect(view, '禁用态读同一份缺口判定').toContain('gongfaUpgradeShort(upCost.value)')
    // 满级时 upCost 为 null:那颗钮改为禁用并写状态词,不再消失(见 masteryMark.spec 的同族判据)
    expect(view, '付得起才不置灰,且满级时不放行').toContain(':disabled="!upCost || upShort !== null"')
    expect(view, '行内复用 core 的短差').toContain('gongfaUpgradeShortfall(c)')
    expect(view, '短差交给同一份拒因文案').toContain('gongfaUpShortToast(s, gongfaUpgradeShortfall(c))')
    expect(view, '不许再用笼统的「悟道点或残页不足」').not.toContain('悟道点或残页不足')
  })

  it('装备详情写着共鸣与界域', () => {
    const view = src('../components/equipment/EquipmentDetailDialog.vue')
    expect(view, '共鸣状态应读 setCounts').toContain('setCounts(')
    expect(view, '界域应读 worldNameOfTier').toContain('worldNameOfTier(')
  })

  it('图鉴的用具三类取自 itemText 的功用函数', () => {
    // 装备/法宝/丹药在 codex 派生视图里拼,功法阁由视图直接拼;两边取同一份文案函数
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
    // 丹方清单在 BrewingDialog,丹药详情在宿主:两处合扫,防只查宿主假绿
    const view = src('../views/InventoryView.vue') + src('../components/inventory/BrewingDialog.vue')
    const uses = view.match(/pillFuncText\(/g)?.length ?? 0
    expect(uses, '丹药详情与方子清单都该写清效果(同一份 pillFuncText)').toBeGreaterThanOrEqual(2)
    // 熟练度只在宿主(丹药详情)读
    expect(src('../views/InventoryView.vue'), '丹方读到几分熟取自 lore.recipeMastery').toContain('recipeMastery(')
  })

  it('丹方熟练度只报读数 —— 不列半截来路冒充全部', () => {
    // 熟练来路:成功开炉 +0.01、炸炉 +0.02、藏经阁被动钻研
    // 三态读数(未得方 / 熟练 N% / 已通晓)取 ui/pillText.recipeMasteryText —— 可炼性判据那里也要同一句
    const view = src('../views/InventoryView.vue')
    expect(view, '熟练度读数取自 recipeMastery 的现值').toContain('recipeMasteryText(lore.recipeMastery(id))')
    expect(view, '来路说明已删,不该残留半句').not.toContain('长记性')
  })

  /**
   * 议题 #130:缺草时给一条带 focus=herb 的入口;坊市接住这个参数,
   * 只在渲染出灵草格时才高亮(货架六格随机)。
   */
  it('炼丹缺草给去坊市的去路,坊市接住 focus=herb 并只高亮灵草格', () => {
    const inv = src('../components/inventory/BrewingDialog.vue')
    expect(inv, '缺草/草石都缺时该给「去坊市续草」').toMatch(
      /name: 'market', query: \{ focus: 'herb', grade: String\(r\.cost\.grade\) \}/,
    )
    expect(inv, '入口只该在草是短板时出现(不该给掌握不足指路)').toMatch(
      /r\.plan\.reason === 'herb' \|\| r\.plan\.reason === 'both'/,
    )
    const market = src('../components/market/MarketShelfSection.vue')
    expect(market, '货架段要读 focus 参数').toContain("route.query.focus === 'herb'")
    expect(market, '按方子要的品阶挑草格(缺灵品却亮凡品,买回来照样开不了炉)').toContain(
      'focusHerbSlot(market.stock, want,'
    )
    expect(market, '认到灵草格后要滚进视口').toContain('scrollIntoView(')
    expect(market, '这一架没有灵草时要明说').toContain('data-focus-herb-missing')
    const host = src('../views/MarketView.vue')
    expect(host, '宿主只切签,不再自己算落点').not.toContain('focusHerbSlot(')
  })

  it('坊市买不起时按钮写出实际差额,不把总价或笼统「灵石不足」当答案', () => {
    const market = src('../components/market/MarketShelfSection.vue')
    expect(market, '卡面要有实际缺口字段').toContain('stoneShort:')
    expect(market, '卡面缺口用指数感知减法').toContain('subClamp(slot.price, resources.spiritStone)')
    // 主语要与 title 一致:光写「尚差 8」时同屏还挂着道源/器灵尘,玩家得回头猜是哪一种
    expect(market, '按钮直接写出尚差多少(带资源名)').toContain('`灵石尚差 ${formatGap(c.stoneShort)}`')
    // 瞬时失败那一支与其余缺料句共用 shortageText(灵石),仍须带实际差额
    expect(market, '扣款瞬时失败也报实际差额').toContain("shortageText('灵石', slot ? formatGap(renderSlot(slot).stoneShort) : undefined)")
    expect(market, '不再用笼统的灵石不足作按钮文案').not.toContain("? '灵石不足'")
  })

  it('天界道源付不起时按钮置灰并写出实际差额', () => {
    // 故障注入:把任一处的 `daoSourceShortText(` 换回 `道源不足`,或删掉 :disabled,本用例红
    const trial = src('../components/celestial/TrialPanel.vue')
    const expedition = src('../components/celestial/ExpeditionPanel.vue')
    const marks = src('../components/celestial/MarksPanel.vue')
    const furnace = src('../components/celestial/FurnaceDialog.vue')
    const souls = src('../views/SoulsView.vue')
    for (const [name, view] of [
      ['试炼册', trial],
      ['远征册', expedition],
      ['道痕册', marks],
      ['天道熔炉', furnace]
    ] as const) {
      expect(view, `${name}该用同一份道源差额`).toContain('daoSourceShortText(')
      expect(view, `${name}不许退回笼统道源不足`).not.toContain('道源不足')
    }
    expect(souls, '器魂该用同一份道源差额').toContain('daoSourceShortfall(')
    expect(souls, '器魂不许退回笼统道源不足').not.toContain('道源不足')
    expect(trial, '今日天道付不起要置灰').toContain('endgame.daoSource < CHALLENGE_ENTRY_COST')
    expect(trial, '天道变数付不起要置灰').toContain('busy !== null || endgame.daoSource < MUTATION_ENTRY_COST')
    expect(trial, '天道试炼付不起要置灰').toContain('busy !== null || endgame.daoSource < row.def.entryCost')
    // 挑战书三条禁用原因(未验约、远征在途、道源不足)须逐因说明
    expect(trial, '挑战书按钮文案统一走分因投影').toContain('challengeButtonText')
    expect(trial, '挑战书 title 统一走分因投影').toContain(':title="challengeBlockText"')
    expect(trial, '挑战书在途拒因来自统一判据').toContain('endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, useAdventureStore().session)')
    expect(trial, '挑战书按钮 disabled 必须同时拒绝在途活动').toContain('|| busy !== null')
    expect(expedition, '特殊世界付不起要置灰').toContain('endgame.daoSource < world.entryCost')
    expect(expedition, '虚界重摇付不起要置灰').toContain('endgame.daoSource < VOID_REROLL_COST')
    expect(marks, '道痕重写付不起与在途都要置灰(忆与写都不能在别的活动在途时点)').toContain(':disabled="busy !== null || endgame.daoSource < REWRITE_ENTRY_COST"')
    expect(marks, '道痕在途拒因来自统一判据').toContain('endgameBusy(endgame.worldRun, usePlayerStore().secretRealm, useAdventureStore().session)')
    expect(furnace, '道果付不起要置灰').toContain(':disabled="fruitShort.short.m > 0"')
    expect(furnace, '灵石熔铸付不起也要置灰').toContain(':disabled="stoneShort.m > 0"')
    /*
     * 差额写在左侧存量那一行,不在钮里。
     *
     * 钮里原本是「熔铸(灵石尚差 …)」或「33.51 亿 → 5 道源」:320 宽下这一格只有 100 余 px,
     * 「源」被挤到第二行,整行比上面四行高出半行。价签挪到左边之后钮只写「熔 铸」,
     * 与「熔尽本包」那四颗同宽同高。
     * 差额本身仍在页面上(左边那行),「禁用即给原因」未失守。
     * 故障注入:把差额从左侧那行删掉,或把括号拒因写回钮里,本条红。
     */
    expect(furnace, '灵石熔铸差额写在左侧存量行').toContain('灵石尚差 {{ formatGap(stoneShort) }}')
    expect(furnace, '灵石熔铸差额走指数感知减法').toContain('subClamp(cost, resources.spiritStone)')
    // 价签与扣费同源:左侧那行的缺口按「单价 × 次数」算,单价仍取自 furnaceStoneCost()
    expect(furnace, '灵石熔铸价签取单价').toContain('furnaceStoneCost()')
    // 按次数放大后才与 furnaceConvertStone 的扣费口径一致
    expect(furnace, '价签按次数放大').toContain('mulN(stoneUnit.value, stoneEffective.value)')
    // 钮文在主词后带次数(「熔 铸 ×N」),主词仍是动作词
    expect(furnace, '熔铸按钮正文只写动作词').toMatch(/熔 铸/)
  })

  /** 天道熔炉材料差额由 furnaceMaterialShortfall 单源给出,两条失败路径都写实际差量 */
  it('天道熔炉材料不足时回执写出实际差量', () => {
    const service = src('./endgameService.ts')
    expect(service, '材料差额单源').toContain('export function furnaceMaterialShortfall(')
    expect(service, '预览失败写实际差量').toContain('ui.toast(`${rate.name}尚差 ${furnaceMaterialShortfall(rate)}`')
    expect(service, '扣料失败同写实际差量').toMatch(
      /spendSmall\(rate\.resource, spent\)[\s\S]{0,180}furnaceMaterialShortfall\(rate\)/,
    )
  })

  /**
   * 道童卡那一行左边是「层数 1/20」,右边原写「还差 10 趟」——
   * 两个数挨在一行,读者会把它读成「还差 19 趟升满 20 层」。
   * 可右边数的是羁绊位阶(10/30/60/100 趟),与层数各算各的。
   *
   * 故障注入:把「羁绊还差」改回「还差」,本条红。
   */
  it('道童的羁绊差额带主语,不与层数混成一把尺', () => {
    const view = src('../views/ApprenticeView.vue')
    expect(view, '羁绊差额该写全「羁绊还差」').toContain('羁绊还差 ${a.mark.toNextBond} 趟')
    expect(view, '已至真传也该带主语').toContain('羁绊已至真传')
    // 层数与羁绊是两套数,各自的说法都要在
    expect(view, '层数刻度该仍在').toContain('a.mark.level.have')
    expect(view, '层数上限说明该仍在').toContain('APPRENTICE_MAX_LEVEL')
  })

  /**
   * 洞府 0 级时顶部那行原写「洞府 1 级 · 离线可攒 12 时」。
   * 这一行只在 mansionLv === 0 时显示,读者会当成现状陈述,
   * 而下方建筑卡又写着「未启用」—— 同屏两句互相顶。
   * 它报的其实是起造后的下一档,故须带「起造后」。
   *
   * 故障注入:把「起造后」去掉,本条红。
   */
  it('洞府未启用时那行报的是起造后的下一档,不是现状', () => {
    const view = src('../views/DongfuView.vue')
    expect(view, '该写「起造后」').toContain('起造后:洞府 1 级')
    // 这一行只在未启用时出现,判据钉住那个条件
    expect(view, '该只在 mansionLv === 0 时显示').toContain('v-if="mansionLv === 0"')
    // 时数仍取常数,不手抄
    expect(view, '时数该取 OFFLINE_CAP_HOURS').toContain('OFFLINE_CAP_HOURS[1]')
  })

  /**
   * 洞府的离线时长:数值面板写「N 时」,而 buildings.ts 的效果文案写「N 小时」。
   * 「时」会被读成「时辰」(一个时辰 = 2 小时,见 data/timeUnits 的口径),
   * 两处指着同一个数却用两个单位,读者得先猜它们是不是同一件事。
   *
   * 数值面板统一现代单位(小时),古语时制留给丹药/剧情那类内容文案。
   * 故障注入:把「小时」改回「时」,本条红。
   */
  it('洞府的离线时长用「小时」,与建筑效果文案同一个单位', () => {
    const view = src('../views/DongfuView.vue')
    const data = src('../data/buildings.ts')
    // 建筑效果文案的基准单位
    expect(data, '建筑效果文案该仍写「小时」').toContain('离线收益上限 ${OFFLINE_CAP_HOURS')
    expect(data, '建筑效果文案该仍带「小时」').toContain('小时')
    // 视图三处都跟同一单位
    const bare = view.match(/\$\{[^}]*\}\s*时(?![辰长])(?!间)/g) ?? []
    expect(bare, `这些地方仍写裸「时」:${bare.join('、')}`).toEqual([])
    expect(view, '摘要行该写「小时」').toMatch(/\}\}\s*小时/)
    expect(view, '段条 title 该写「小时」').toContain('离线可攒 ${hr} 小时')
    expect(view, '起造后那行该写「小时」').toContain('离线可攒 ${OFFLINE_CAP_HOURS[1]} 小时')
  })

  /**
   * 装备详情里几处花费的写法:
   *   · 「灵石」与数字之间要留一个空格(全站规约,见 utils/format.formatYears 的注)
   *   · 灵石那个数不能裸着 —— 同屏的「强化」「连升」都写全了单位
   *   · 同一个弹窗里「器灵尘」不许一处全称一处简称
   *
   * 故障注入:去掉「灵石 」前缀、或把「灵石」与数字黏在一起,本条红。
   */
  it('装备花费的单位写全,且与数字之间留空格', () => {
    const files = [
      '../components/equipment/EquipReforgeFooter.vue',
      '../components/equipment/AutoReforgePanel.vue'
    ]
    for (const f of files) {
      const text = src(f)
      // 黏在一起的写法
      expect(text, `${f}:「灵石」与数字之间缺空格`).not.toMatch(/灵石\{\{/)
      // 裸数后直接接「· 尘」或「尘×」:说明灵石那一项没写单位
      const bare = text.match(/(?<!灵石 )\{\{\s*formatGN\([^)]*\)\s*\}\}\s*·\s*(?:器灵)?尘×/g) ?? []
      expect(bare, `${f}:灵石那个数裸着没单位`).toEqual([])
    }
    // 同一弹窗里的尘统一用全称
    const reforge = src('../components/equipment/EquipReforgeFooter.vue')
    const auto = src('../components/equipment/AutoReforgePanel.vue')
    for (const [name, s] of [['EquipReforgeFooter', reforge], ['AutoReforgePanel', auto]] as const) {
      const short = s.match(/[^器灵]尘×\{\{/g) ?? []
      expect(short, `${name} 里还有简称「尘×」与「器灵尘×」并存`).toEqual([])
    }
  })

  it('器魂与道童付不起时置灰并写出实际差额', () => {
    const souls = src('../views/SoulsView.vue')
    expect(souls, '凝炼入口读同一份道源缺口').toContain('daoSourceShortfall(SOUL_REFINE_COST, endgame.daoSource)')
    expect(souls, '入炉与确认凝炼都按缺口置灰').toMatch(
      /:disabled="refineShort\.short\.m > 0"[\s\S]{0,500}?:disabled="refineShort\.short\.m > 0"/
    )
    expect(souls, '入炉按钮直接复用已算好的拒因').toContain('refineShort.reason ? `入 炉(${refineShort.reason})`')
    expect(souls, '同一份道源缺口不在模板里重算第二次').not.toContain('daoSourceShortText(SOUL_REFINE_COST')

    const apprentice = src('../views/ApprenticeView.vue')
    expect(apprentice, '道童报价与缺口同源').toContain('apprenticeRecruitShortfall(player.major, resources.spiritStone)')
    expect(apprentice, '招募付不起要置灰').toContain(':disabled="slotsFull || !canAffordRecruit"')
    expect(apprentice, '招募按钮就地写实际差额').toContain('(灵石尚差 ${formatGap(recruitShort)})')
    expect(apprentice, '招募失败 toast 也报实际差额').toContain('灵石尚差 ${formatGap(recruitShort.value)}')
  })

  /**
   * 悟道兑换、突破备药、灵气疗伤:禁用判据与文案都读 core 的同一份差额。
   * 故障注入:删掉余额判据,或把「尚差」改回「未足」,本用例红。
   */
  it('修行页三处付不起都前置置灰并写出实际差额', () => {
    const gongfa = src('../components/cultivation/GongfaSection.vue')
    const card = src('../components/cultivation/BreakthroughCard.vue')
    const view = src('../views/CultivationView.vue')
    const service = src('./earlyGameService.ts')
    const exchange = src('./wudaoExchange.ts')
    expect(gongfa, '兑换钮读同源判据').toContain(':disabled="!player.canExchangeWudao"')
    // 可兑时写「兑换(×N)」,不可兑时就地写拒因 —— 两种形态都要在
    expect(gongfa, '兑换钮可兑时写动作词').toContain('兑换${exchangeEffective > 1')
    expect(gongfa, '兑换钮不可兑时就地写拒因').toContain('exchangeBlockedText')
    expect(exchange, '灵石余额进入兑换判据').toContain('stoneShort')
    expect(card, '备药钮按石差置灰').toContain(':disabled="!prepCanPill"')
    expect(card, '备药钮写实际石差').toContain('prepPillDisabledLabel(formatGap(prepPillShort))')
    expect(card, '备药 toast 写实际石差').toContain('prepPillShortToast(formatGap(prepPillShort.value))')
    expect(service, '突破准备缺口单源').toContain('breakthroughPrepShortfall')
    // 差额走 formatGap:灵气按 dt 累积是小数,formatNum 四舍五入会少报(见 format-gn 计划档)
    expect(view, '疗伤钮写实际气差').toContain('formatGap(repair.shortfall)')
  })

  /**
   * 灵脉单点、连投与服务拒因同读 veinPointShortfall。
   * 故障注入:把按钮改回「缺灵石」,或把服务 toast 改回不带差数,本用例红。
   */
  it('灵脉单点与连投付不起时写出实际石差', () => {
    const card = src('../components/dongfu/VeinInvestCard.vue')
    const service = src('./veinService.ts')
    const text = src('../ui/veinText.ts')
    expect(card, '投点钮读同源差额').toContain('veinPointShortfall')
    expect(card, '投点钮就地写实际石差').toContain('灵石尚差 ${formatGap(investGap.value)}')
    expect(service, '单点拒因写实际石差').toContain('veinShortToast(formatGap(veinPointShortfall()))')
    expect(service, '批量拒因同写实际石差').toContain('else ui.toast(veinShortToast(formatGap(veinPointShortfall())), \'warn\')')
    // 短差句转调 ui/resourceShortText 的 shortageText:只在传入差数时才写尚差
    expect(text, '短差文案只在传入差数时才写尚差').toContain("shortageText('灵石', stoneText)")
  })

  it('强化缺料时置灰并写出实际差额', () => {
    const detail = src('../components/equipment/EquipmentDetailDialog.vue')
    const panel = src('../components/equipment/UpgradePanel.vue')
    // 满级时按钮改为禁用并写原因(不再凭空消失),故判据取「缺料置灰」这一段
    expect(detail, '强化按钮按缺口置灰').toContain('upCost ? upShort !== null : true')
    /*
     * 拒因走 aria-label / title,不挂在按钮正文上。
     *
     * 这个钮与「卸 下」「垃圾桶」并排,宽只 78~105px:正文挂「强 化(尘差 36)」必然折两行,
     * 底行因此从 44px 涨到 57px,整条页脚跟着高 37px(375 与 320 都如此,见 detail-geometry)。
     * 而同一份差额在正上方的强化面板里已经整句写出,按钮上再写一遍本是第二处。
     * 「禁用即给原因」并未失守:原因仍在(读屏与 hover 拿得到),只是不占正文那一格。
     * 故障注入:把差额从 aria-label / title 里删掉,或把括号拒因写回正文,本条红。
     */
    expect(detail, '拒因进 aria-label(石差)').toContain('`强 化,灵石尚差 ${formatGap(upGap?.stone')
    expect(detail, '拒因进 aria-label(尘差)').toContain('`强 化,器灵尘尚差 ${upGap?.dust')
    expect(detail, '拒因仍在 title 里').toContain('`器灵尘尚差 ${upGap?.dust ?? 0}`')
    expect(detail, '正文只留动作词,不再挂括号拒因').not.toContain('石差 ${formatGap(upGap?.stone ?? { m: 0, e: 0 })}` : `尘差')
    expect(panel, '强化面板列实际缺口').toContain('器灵尘尚差 {{ gap.dust }}')
    expect(panel, '强化面板列灵石缺口').toContain('灵石尚差 {{ formatGap(gap.stone) }}')
    // 满级不再让整块消失:玩家要看得到「已至上限」而不是一片空白
    expect(panel, '满级时保留一条状态行').toContain('v-else-if="inst && !upCost"')
    expect(panel, '满级状态行写原因').toContain('{{ upgradeCapToast() }}')
    expect(detail, '详情弹窗满级时按钮不消失,改为禁用并写原因').toContain(':disabled="upCost ? upShort !== null : true"')
    // 按钮只写短状态:这一格原是与「卸 下」并排的两字钮,四个字会折行
    expect(detail, '满级按钮只写短状态,完整说法放 title').toContain("!upCost ? '已至上限' : ")
  })

  /**
   * 词条转移的主按钮与服务拒因同读 transferShortfall。
   * 故障注入:把 blockLabel 改回只传 short,或把服务拒因改回 transferShortText(short),本用例红。
   */
  it('词条转移缺料写出灵石与器灵尘实际差额', () => {
    const flow = src('../composables/useAffixTransfer.ts')
    const service = src('../core/affixTransfer.ts')
    expect(flow, '主按钮缺口读同一份 transferShortfall').toContain('transferShortfall(plan.value.cost)')
    expect(flow, '按钮写实际石差').toContain('stone: formatGap(shortfall.value.stone)')
    expect(flow, '按钮写实际尘差').toContain('dust: shortfall.value.dust')
    expect(service, '服务拒因读 transferShortfall').toContain('const gap = transferShortfall(check.plan.cost)')
    expect(service, '服务 toast 带实际石差').toContain('stone: formatGap(gap.stone)')
    expect(service, '服务 toast 带实际尘差').toContain('dust: gap.dust')
    expect(service, '不许退回只传缺料类型').not.toContain('ui.toast(transferShortText(short)')
  })

  /** 灵石只能从历练/悬赏挣,坊市只花灵石:只缺灵石时不给「去坊市」 */
  it('炼丹只缺灵石时指去历练,不给坊市(那儿只有花灵石)', () => {
    const inv = src('../components/inventory/BrewingDialog.vue')
    expect(inv, '只缺灵石给历练去路').toMatch(/r\.plan\.reason === 'stone'/)
    expect(inv, '两条去路互斥,同屏只摆一条').toMatch(/v-else-if="r\.plan\.reason === 'stone'"/)
    // 同时锁目标路由:只断言标签,把 link 改回 market 照样绿
    expect(inv, '灵石那条必须指向历练').toMatch(
      /v-else-if="r\.plan\.reason === 'stone'"[\s\S]{0,200}?:to="\{ name: 'adventure' \}"[\s\S]{0,200}?去历练攒石 →/,
    )
  })

  /**
   * 计划、单炉与连炼零炉同读 craftShortfall。
   * 故障注入:把单炉回执改回无参 craftShortToast(),或把计划石差写死「灵石不足」,本用例红。
   */
  it('炼丹计划与单炉回执写出实际草石差额', () => {
    const service = src('./pillService.ts')
    const text = src('../ui/pillText.ts')
    expect(service, '单炉与计划共用差额函数').toContain('export function craftShortfall(')
    expect(service, '单炉回执传实际草石差').toMatch(/craftShortToast\(\{[\s\S]{0,120}herb: gap\.herb,[\s\S]{0,120}stone: formatGap\(gap\.stone\)/)
    expect(service, '计划只缺石时带 shortStone').toContain('shortStone?: GNum')
    expect(service, '计划回执不再写死笼统的灵石不足').not.toMatch(/blocked\('灵石[未不]足'/)
    expect(text, '缺料文案分开报草石').toContain('灵草尚差 ${gap.herb} 株')
    expect(text, '缺料文案报石差').toContain('灵石尚差 ${gap.stone}')
  })

  /** 功法参悟与进修都读 core 的短差;详情文案不就地减余额 */
  it('功法参悟与进修回执写出实际差额', () => {
    const service = src('./gongfaService.ts')
    const dialog = src('../components/cultivation/GongfaDialog.vue')
    const text = src('../ui/gongfaText.ts')
    expect(service, '参悟拒因写实际残页差').toContain(
      'gongfaPageShortToast(Math.max(0, COMPREHEND_PAGE_COST - resources.page))',
    )
    expect(service, '进修短差单源').toContain('export function gongfaUpgradeShortfall(')
    expect(service, '进修回执传实际短差').toContain('gongfaUpShortToast(short, gongfaUpgradeShortfall(cost))')
    expect(dialog, '详情复用同一份短差').toContain('gongfaUpgradeShortfall(c)')
    expect(dialog, '详情不再自己减余额').not.toContain('c.wudao - resources.wudao')
    expect(text, '残页拒因带页数').toContain('残页尚差 ${pageShort} 页')
    expect(text, '进修拒因带悟道差').toContain('悟道点尚差 ${gap.wudao}')
    expect(text, '进修拒因带残页差').toContain('残页尚差 ${gap.page} 页')
  })

  /**
   * 主修/辅修的开关回执。
   *
   * 原先主修切换完全没有回执、辅修只在槽位满时出声 ——
   * 这两颗钮会改面板上一整片属性(主修决定功法加成与神通),
   * 没有回执时玩家只能去角色页比对数值才知道换成了没有。
   * 换装、佩称号、祭炼法宝都有回执,此处补齐同一套。
   * 故障注入:删掉任一分支的 ui.toast,本条红。
   */
  it('功法主修/辅修的开关都报回执', () => {
    const dialog = src('../components/cultivation/GongfaDialog.vue')
    expect(dialog, '主修切换要报回执').toContain('gongfaMainToast(d.name)')
    expect(dialog, '辅修开关要报回执').toContain('gongfaSubToast(d.name, !wasOn)')
    expect(dialog, '成功与槽满分开报,不共用一个分支').toContain('else ui.toast(gongfaSubToast')
    // 回执只在真的切成了才报(equipMain 失败时不出声)
    expect(dialog, '主修回执应挂在 equipMain 的返回值上').toContain('if (cultivation.equipMain(d.id))')
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
    // 路由守卫允许 create→welcome(未开始前);桌面端无系统返回
    expect(create, '建号页该有回欢迎页的 RouterLink').toMatch(
      /<RouterLink[\s\S]{0,120}to="\/welcome"[\s\S]{0,240}欢迎/,
    )
  })

  it('登临导览的「天道熔炉」是真按钮 —— 无 href 的 <a> 键盘到不了', () => {
    // 宿主与子组件合扫,防只查宿主假绿
    const view = src('../views/CelestialView.vue') + src('../components/celestial/TutorialDialog.vue')
    expect(view, '天道熔炉该是可聚焦的 button').toMatch(
      /<button[\s\S]{0,240}@click="emit\('close'\)"[\s\S]{0,80}天道熔炉/,
    )
    const deadLinks = [...view.matchAll(/<a\b[^>]*>/g)]
      .map(m => m[0])
      .filter(tag => !/\shref=/.test(tag) && /@click=/.test(tag))
    expect(deadLinks, `这些 <a> 没有 href 却挂了点击:${deadLinks.join(' | ')}`).toEqual([])
  })

  /** 故障注入:doCondense 开窗时调 markFruitTutorialSeen(),本用例红 */
  it('凝道果按未见标志开说明,开窗不置已见 —— 开窗即置,说明显示中刷新或按返回就永久丢失', () => {
    const view = src('../components/celestial/FurnaceDialog.vue')
    const body = /function doCondense\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(view)?.[1] ?? ''
    expect(body, '没读到 doCondense —— 判据会假绿').toMatch(/condenseDaoFruit\([^)]*\)/)
    expect(body, '开窗前须问 shouldShowFruitTutorial(),否则每次凝果都弹').toContain('shouldShowFruitTutorial()')
    expect(body, '已见只在关掉说明时置').not.toMatch(/markFruitTutorialSeen|dismissFruitTutorial|daoFruitTutorialSeen/)
  })

  /** 故障注入:注释改回「其成功即置 daoFruitTutorialSeen」,本用例红 */
  it('shouldShowFruitTutorial 的注释写明已见在关掉说明时置 —— 照「凝果即置」接线,说明显示中刷新就永久丢失', () => {
    const raw = readFileSync(resolve(__dirname, './resourceGuidance.ts'), 'utf8')
    const doc = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export function shouldShowFruitTutorial\b/.exec(raw)?.[1] ?? ''
    expect(doc, '没读到 shouldShowFruitTutorial 的注释 —— 判据会假绿').not.toBe('')
    expect(doc).not.toContain('成功即置')
    expect(doc).toContain('关掉')
  })

  /** 故障注入:「知道了」改回 `fruitDialogOpen = false`、doCondense 不记打开时刻、开窗改读 Date.now、关窗不看 dismissFruitTutorial 的结果、或绕过它直接置已见,本用例红 */
  it('道果说明的关闭全过保护期,作数才置已见 —— 「知道了」盖在「道果 +1」上,连点第二下会关掉一次性说明', () => {
    const view = src('../components/celestial/FurnaceDialog.vue')
    const modal = /<BaseModal\b[^>]*\btitle="道果"[^>]*>[\s\S]*?<\/BaseModal>/.exec(view)?.[0] ?? ''
    // 遮罩、Esc、右上角走 @close
    const close = /@close="(\w+)\(\)"/.exec(modal)?.[1] ?? ''
    expect(close, '没读到道果说明的 @close —— 判据会假绿').not.toBe('')
    expect(modal, '「知道了」与 @close 同一个关闭').toMatch(new RegExp(`@click="${close}\\(\\)"[^>]*>\\s*知道了`))
    const fnBody = (name: string): string =>
      new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(view)?.[1] ?? ''
    const closeBody = fnBody(close)
    // dismissFruitTutorial:保护期内不作数,作数才置已见(resourceGuidance.spec 验行为)
    const openedAt = /dismissFruitTutorial\((\w+)/.exec(closeBody)?.[1] ?? ''
    expect(openedAt, `${close} 须先过 dismissFruitTutorial`).not.toBe('')
    expect(closeBody.indexOf('dismissFruitTutorial(')).toBeLessThan(closeBody.indexOf('fruitDialogOpen.value = false'))
    expect(closeBody, '只调用不看结果,保护期内照样关窗').toMatch(/if\s*\(\s*!?\s*dismissFruitTutorial\(/)
    expect(fnBody('doCondense'), '打开时记下时刻').toMatch(new RegExp(`\\b${openedAt}\\s*=[^=]`))
    // 开窗与关窗读同一时钟:一边换成 Date.now,说明要么永远关不掉、要么不设防
    const openClock = new RegExp(`\\b${openedAt}\\s*=\\s*([\\w.]+\\(\\))`).exec(fnBody('doCondense'))?.[1] ?? ''
    const closeClock = new RegExp(`dismissFruitTutorial\\(${openedAt},\\s*([\\w.]+\\(\\))\\)`).exec(closeBody)?.[1] ?? ''
    expect(closeClock, '没读到关窗时刻 —— 判据会假绿').not.toBe('')
    expect(openClock, '开窗与关窗同一时钟').toBe(closeClock)
    expect(view.match(/fruitDialogOpen(?:\.value)?\s*=\s*false/g), '别处不许绕过保护期直接关').toHaveLength(1)
    expect(view.match(/\bdismissFruitTutorial\(/g), '置已见只经关窗一处').toHaveLength(1)
    expect(view, '别处不许绕过保护期直接置已见').not.toMatch(/markFruitTutorialSeen\(|daoFruitTutorialSeen\s*=/)
  })
})

/**
 * 数据文本的机械体检:括号配对、重复标点、连续空白、混入英文。
 *
 * 这类错别字级问题此前没有守卫 —— `artifactEffects` 只对账数值,`petLore` 只查方向,
 * 而「(先削其防,再入减免」少打一个右括号这种事,两者都看不见。
 * 覆盖面取叙事与说明字段,不碰 id / 数值。
 */
describe('数据文本 · 机械体检', () => {
  function scan(tag: string, name: string, text: string | undefined, bad: string[]): void {
    if (!text) return
    const opens = (text.match(/[(（「《]/g) ?? []).length
    const closes = (text.match(/[)）」》]/g) ?? []).length
    if (opens !== closes) bad.push(`${tag}「${name}」括号不配对:${text}`)
    if (/[,,。;；]{2,}/.test(text)) bad.push(`${tag}「${name}」重复标点:${text}`)
    if (/\s{2,}/.test(text)) bad.push(`${tag}「${name}」连续空白:${text}`)
    if (/[a-zA-Z]{2,}/.test(text)) bad.push(`${tag}「${name}」混入英文:${text}`)
  }

  it('十类数据的文本都没有机械错误', () => {
    const bad: string[] = []
    for (const a of ARTIFACTS) {
      scan('法宝', a.name, a.desc, bad)
      scan('法宝神通', a.name, a.active.desc, bad)
    }
    for (const p of PETS) scan('灵兽', p.name, p.desc, bad)
    for (const g of GONGFA) scan('功法', g.name, g.desc, bad)
    for (const t of TITLES) scan('称号', t.name, t.desc, bad)
    // 事件是仓库里最长的一批散文(81 条随机 + 11 条机缘),最易出标点问题
    for (const e of EVENTS) scan('事件', e.id, e.text, bad)
    for (const e of FORTUNE_EVENTS) scan('机缘', e.id, e.text, bad)
    for (const p of PILLS) scan('丹药', p.name, p.desc, bad)
    for (const b of BUILDINGS) scan('建筑', b.name, b.desc, bad)
    for (const s of SOUL_TYPES) scan('器灵', s.name, s.desc, bad)
    // 奇门有 desc(机制一行)与 gist(八门本义)两段文本,都要过
    for (const g of GATES) {
      scan('奇门', g.name, g.desc, bad)
      scan('奇门本义', g.name, g.gist, bad)
    }
    expect(bad, `数据文本有机械错误:\n${bad.join('\n')}`).toEqual([])
  })
})

/**
 * 天道熔炉的两处兑换都支持「自定义次数」。
 *
 * 这类能力的价值不在文案而在**输入框在不在**:只留「凝一枚 / 连凝全部」两颗钮时,
 * 想凝 3 枚的玩家只能点三次或用掉全部道源 —— 而这两处本来都只是一次调用,
 * 界面上却没有中间选项。判据从源码核这两个输入框与它们的可访问名。
 */
describe('天道熔炉 · 兑换支持自定义次数', () => {
  const src = (from: string): string =>
    readFileSync(resolve(__dirname, from), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

  it('给定熔炉界面源码,当读两处兑换控件,则灵石熔铸与道源凝炼都有数量输入框', () => {
    const f = src('../components/celestial/FurnaceDialog.vue')
    // 两处都要有 aria-label 的 number 输入框
    expect(f, '灵石熔铸缺数量输入框').toContain('aria-label="熔铸次数"')
    expect(f, '道源凝炼缺数量输入框').toContain('aria-label="凝炼枚数"')
    // 上限按「可熔/可凝次数」给,不是写死
    expect(f, '熔铸上限该绑可熔次数').toContain(':max="stoneAffordable"')
    expect(f, '凝炼上限该绑可凝枚数').toContain(':max="affordable"')
    // 钮文随选中数变化,而不是固定的「熔 铸」/「道果 +1」
    expect(f, '熔铸钮文该随次数变').toContain('熔 铸 ×${stoneEffective}')
    expect(f, '凝炼钮文该随枚数变').toContain('道果 +${fruitEffective}')
    // 两处都得真的把选中数传给服务层
    expect(f, '熔铸该把次数传下去').toContain('furnaceConvertStone(stoneEffective.value)')
    expect(f, '凝炼该把枚数传下去').toContain('doCondense(fruitEffective)')
    /*
     * 光有输入框不够:读数也得跟着选中数走。
     * 曾经的缺陷 —— 输入框加了,但价签固定写「单价 → 5 道源」、「凝后 +X%」按下一枚算,
     * 选 10 枚看到的是凝 1 枚的收益(边际递减下差 10 倍,20 枚时 +4.49% vs +44.04%)。
     */
    expect(f, '灵石价签该按选中次数算总价').toContain('mulN(furnaceStoneCost(), stoneEffective)')
    expect(f, '凝炼收益该按选中枚数算').toContain('fruitMarginalInfo(fruitEffective.value)')
    expect(f, '边际刻度该看这批的收尾那枚').toContain('marginMark(fruitInfo.value.total + fruitEffective.value)')
    expect(f, '曲线起点该与刻度同一枚').toContain('marginCurvePoints(fruitInfo.value.total + fruitEffective.value - 1)')
  })
})


/**
 * 灵石数额的词序只有一种:「灵石 N」。
 *
 * 全仓绝大多数地方写「灵石 6509万」「共耗 灵石 12」,而修行页的兑换行、
 * 突破準備按钮、天界改向成本、道童招募成本曾写成「80 灵石」「4.468亿 灵石」——
 * 同一个量在相邻两页一个词序,读起来像是两个不同的东西。
 *
 * 只扫 .vue 与 data 里**面向玩家**的模板串,跳过注释与 spec 自身的样例。
 *
 * 另一条同源:数字与中文单位之间要留一个空格。全仓 19 处写成「耗时 3 分钟」
 * 「一炷香(30 分钟)」,只有 `data/earlyGame` 的静坐调息写成「耗时3分钟」——
 * 它与同表下一条「消耗灵石 80」并排显示,一个有一格一个没有,读起来像两种排版。
 * 那条只扫 `desc` / `effect` / `label` 这类面向玩家的字段。
 */
describe('文案排版 · 数字与中文单位之间留空格', () => {
  it('数据表的说明文本里没有「3分钟」这种连写', () => {
    const SRC = resolve(__dirname, '..', 'data')
    const UNITS = '分钟|小时|秒钟|时辰'
    const offenders: string[] = []
    for (const name of readdirSync(SRC)) {
      if (!name.endsWith('.ts')) continue
      const text = readFileSync(join(SRC, name), 'utf8')
      for (const [i, line] of text.split('\n').entries()) {
        if (/^\s*(\*|\/\/)/.test(line)) continue
        // 只认面向玩家的字段:desc / effect / label
        if (!/(desc|effect|label)\s*:/.test(line)) continue
        if (new RegExp(`\\d(${UNITS})`).test(line)) {
          offenders.push(`src/data/${name}:${i + 1}`)
        }
      }
    }
    expect(offenders, `这些地方数字与单位连写了:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('文案用词 · 灵石数额的词序一致', () => {
  it('界面与数据表里不再出现「数字 灵石」', () => {
    const SRC = resolve(__dirname, '..')
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) {
          walk(p)
          continue
        }
        if (!/\.(vue|ts)$/.test(e.name) || /\.spec\.ts$/.test(e.name)) continue
        const text = readFileSync(p, 'utf8')
        for (const [i, line] of text.split('\n').entries()) {
          // 跳过注释行:注释里写「80 灵石」是说明,不是界面文案
          if (/^\s*(\*|\/\/|<!--)/.test(line)) continue
          /*
           * 数字(含 formatGN 调用结果)紧跟「灵石」= 反序。
           *
           * 排除「灵石/时」这类**单位**写法:``${n}灵石/时` 是「每小时多少灵石」,
           * 单位在后本来就对,与「80 灵石」那种量词反序不是一回事。
           */
          /*
           * 三种写法都要认:
           *   - 模板插值 `{{ n }} 灵石` / `${n} 灵石`
           *   - **字面量** `80 灵石`(数据表 desc、静态提示语里很常见)——
           *     只认插值会漏掉这一类,而它恰恰是最容易被手写反的
           * 排除「灵石/时」这类**单位**写法:单位在后本来就对。
           */
          const reversed =
            /\}\}\s*灵石|\$\{[^}]+\}\s*灵石|\d\s*灵石/.test(line) &&
            !/(\}\}|\$\{[^}]+\}|\d)\s*灵石\s*\//.test(line)
          /*
           * 悟道点同理:全仓统一「悟道点 N」。`石` 那种简称不在此列 ——
           * 它是有意的紧凑写法(按钮里用),`format.ts` 的注释把它当既有模式举例。
           */
          const reversedWudao =
            /\}\}\s*悟道点|\$\{[^}]+\}\s*悟道点|\d\s*悟道点/.test(line)
          if (reversed || reversedWudao) {
            offenders.push(`${p.replace(SRC, 'src')}:${i + 1}`)
          }
        }
      }
    }
    walk(SRC)
    expect(offenders, `这些地方把数额写在「灵石」前面了:\n${offenders.join('\n')}`).toEqual([])
  })
})
