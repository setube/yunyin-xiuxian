/** 机制指纹:按词条家族把构筑归为机制结构,供风险模型跟踪 */
import type { AnyStatKey, StatMods } from '@/types'
import { modOf } from './statsCalc'

export type MechanicFamily = 'burst' | 'sustain' | 'mitigation' | 'shield' | 'counter' | 'combo' | 'desperate'

/** 家族 → 词条与「成型档」参考值;须与 synergyScan 扫描档一致 */
export const MECHANIC_FAMILIES: Record<MechanicFamily, Partial<Record<AnyStatKey, number>>> = {
  burst: { fullHpDamage: 0.36, firstStrike: 0.48, critRate: 0.18, critDamage: 0.48, executeDamage: 0.3, armorPen: 0.18, damageBonus: 0.18 },
  sustain: { lifesteal: 0.09, regenPerRound: 0.024, overhealShield: 0.6 },
  mitigation: { damageReduction: 0.15, lowHpReduction: 0.3, dodgeRate: 0.11 },
  shield: { shieldOnStart: 0.3, shieldPower: 0.3 },
  counter: { counterRate: 0.36, counterDamage: 0.9 },
  combo: { comboRate: 0.33, comboDamage: 0.48, speed: 0.21, stunRate: 0.09 },
  desperate: { lowHpDamage: 0.6 }
}

/** 已命名的风险/风格指纹;键为家族签名(达标家族按字典序连接) */
export const FINGERPRINT_NAMES: Record<string, string> = {
  burst: '锋锐直击',
  'burst+combo': '疾风骤雨',
  'burst+desperate': '背水一战',
  'burst+mitigation': '披甲执锐',
  'counter+shield': '罡棘之壁',
  'counter+mitigation': '磐石反震',
  'mitigation+sustain': '不朽壁垒',
  'mitigation+shield+sustain': '龟寿之墙',
  'mitigation+shield': '重盾深防',
  'shield+sustain': '灵光不灭',
  'combo+sustain': '绵掌化生',
  sustain: '生生不息',
  desperate: '向死而生',
  combo: '连绵不绝',
  counter: '以彼之道',
  shield: '灵光护体',
  mitigation: '铜皮铁骨',
  // 破墙扫描登记的风险结构
  'burst+combo+mitigation': '铁骑冲阵',
  'combo+mitigation+shield': '坚壁连环',
  'burst+combo+sustain': '不竭连锋',
  'burst+desperate+sustain': '血战不休',
  'burst+counter+shield': '金刚怒目',
  'desperate+mitigation': '残躯铁壁',
  'combo+counter': '连环反打',
  'burst+shield': '锋盾并举',
  'burst+sustain': '掠血锋芒',
  'combo+shield': '盾舞连击',
  'combo+mitigation': '游身连打',
  'counter+sustain': '棘甲回春',
  'counter+desperate': '濒死反噬',
  'desperate+sustain': '枯木逢春',
  'desperate+shield': '残盾拒死',
  'burst+counter': '锋芒反刺',
  'combo+desperate': '亡命连击',
  'counter+mitigation+shield': '荆棘壁垒',
  'burst+combo+shield': '连锋带盾',
  /*
   * 下面四条是风险图谱里已经有档、命名表却没有的名字 —— 两边各说各话:
   * `buildSearch.spec` 按「不在命名表」把它们算成**未名结构**并计入上限,
   * 而 `ruleUniverse.spec` 按「在图谱里有档」判它们**已登记**。
   * 同一批构建,一条判据说「还没人管」,另一条说「早有人管」。
   *
   * 三张表(家族参考值 / 命名表 / 风险图谱)必须能互相推出来,判据见
   * `core/fingerprintConsistency.spec`。
   */
  'combo+desperate+mitigation': '困兽连击',
  'burst+desperate+shield': '破釜强攻',
  'burst+mitigation+sustain': '血甲久战',
  'combo+counter+shield': '连环棘壁'
}

export interface Fingerprint {
  /** 家族签名(字典序,如 'mitigation+sustain') */
  signature: string
  /** 无名则为「未名结构」 */
  name: string
  /** 各家族归一强度(≥0.5 视为达标) */
  strengths: Partial<Record<MechanicFamily, number>>
  known: boolean
}

/** 家族强度:各词条(当前值 / 成型档)的最大值与均值折中 */
function familyStrength(mods: StatMods, family: MechanicFamily): number {
  const refs = MECHANIC_FAMILIES[family]
  const keys = Object.keys(refs) as AnyStatKey[]
  let max = 0
  let sum = 0
  let n = 0
  for (const key of keys) {
    const r = refs[key] ?? 1
    const v = Math.max(0, modOf(mods, key)) / r
    max = Math.max(max, v)
    if (v > 0) {
      sum += v
      n += 1
    }
  }
  const avg = n > 0 ? sum / n : 0
  return max * 0.6 + avg * 0.4
}

// ---------- 风险图谱 ----------

export interface RiskProfile {
  signature: string
  /** 高风险语境 */
  riskContexts: string[]
  /** 已知对策 */
  counters: string[]
  /** 历史事故档案 */
  incidents: string[]
  risk: 'low' | 'watch' | 'high'
}

/** 风险图谱:破墙扫描与跨界检测中出现过的机制结构;新增词条/装备若显著增强某档案结构,须先查此表 */
export const RISK_ATLAS: RiskProfile[] = [
  {
    signature: 'mitigation+shield+sustain',
    riskContexts: ['长战', '连战', '回合上限宽松'],
    counters: ['真伤', '禁疗', '压缩回合上限'],
    incidents: ['P19 盾系厚血通吃 210/1000(超时判胜时代)', 'P19.5 复测:递减无效,协同问题'],
    risk: 'watch'
  },
  {
    signature: 'mitigation+sustain',
    riskContexts: ['长战', '连战'],
    counters: ['真伤', '禁疗', '限时'],
    incidents: ['P19 破墙家族骨架:12/1000 全员含减伤×续航'],
    risk: 'watch'
  },
  {
    signature: 'mitigation+shield',
    riskContexts: ['多段敌', '低攻敌'],
    counters: ['真伤穿透', '高单发'],
    incidents: ['P24 破墙扫描 ×1'],
    risk: 'watch'
  },
  {
    signature: 'burst+combo+mitigation',
    riskContexts: ['中庸敌', '短战'],
    counters: ['高闪避', '厚血墙'],
    incidents: ['P24 破墙扫描 ×3(最多)'],
    risk: 'watch'
  },
  {
    signature: 'burst+counter+shield',
    riskContexts: ['多段敌(反击收益翻倍)'],
    counters: ['真伤', '单发重击'],
    incidents: ['P24 破墙扫描 ×2'],
    risk: 'watch'
  },
  {
    signature: 'burst+desperate',
    riskContexts: ['带先手/高速时可在受创前收割'],
    counters: ['厚血墙', '震慑打断'],
    incidents: ['P20「镇岳印×满血斩杀」跨界 2/120(红线值守中)'],
    risk: 'high'
  },
  {
    signature: 'combo+mitigation+shield',
    riskContexts: ['长战'],
    counters: ['真伤', '限时'],
    incidents: ['P24 破墙扫描 ×1'],
    risk: 'low'
  },
  {
    signature: 'burst+combo+sustain',
    riskContexts: ['中庸敌'],
    counters: ['高闪避'],
    incidents: ['P24 破墙扫描 ×1'],
    risk: 'low'
  },
  {
    signature: 'burst+desperate+sustain',
    riskContexts: ['低血循环(打不死打人痛)'],
    counters: ['斩杀类', '高爆发'],
    incidents: ['P24 破墙扫描 ×1'],
    risk: 'low'
  },
  {
    signature: 'desperate+mitigation',
    riskContexts: ['低血减伤双保险'],
    counters: ['真伤', '持续流血'],
    incidents: ['P24 破墙扫描 ×1'],
    risk: 'low'
  },
  {
    signature: 'combo+counter',
    riskContexts: ['出手频次型,对多段与单发通吃'],
    counters: ['震慑', '高闪避'],
    incidents: ['P24 破墙扫描 ×1'],
    risk: 'low'
  },
  {
    signature: 'combo+desperate+mitigation',
    riskContexts: ['低血循环 + 追击频次'],
    counters: ['斩杀类', '真伤'],
    incidents: ['P25 生态采样(400 构筑)×1'],
    risk: 'low'
  },
  /*
   * 这里原有一条 `burst+combo+mitigation+sustain`(四族「均衡压制」),
   * 而 `fingerprintOf` 的签名**最多三族**(取最强两族,第三族须 ≥0.85 才计入)。
   * 四族签名永远产生不出来 —— 那条档自 P24 起就是死档,`riskProfileOf` 查不到它,
   * 也没有任何构建会走到它。删掉,由 `fingerprintConsistency.spec` 挡住再写回来。
   */
  /*
   * 下面三条是修掉「被反击打死后仍能追击吸血」之后新露出来的结构。
   * 那处修复让反震/护盾一系的收益变实(打死你之后不再被你的追击抵消),
   * 于是三类含护盾的组合跨过了破墙线。破墙率仍是 0.8%(红线 1.5%),
   * 故按 watch 档建档观察,不是已知高危。
   */
  {
    signature: 'burst+desperate+shield',
    riskContexts: ['低血爆发 + 护盾续命'],
    counters: ['真伤穿透', '斩杀类'],
    incidents: ['P26 反震流复查(修死后追击后新露头)'],
    risk: 'watch'
  },
  {
    signature: 'burst+mitigation+sustain',
    riskContexts: ['长战久拖,护盾与减伤叠加'],
    counters: ['真伤', '禁疗'],
    incidents: ['P26 反震流复查(修死后追击后新露头)'],
    risk: 'watch'
  },
  {
    signature: 'combo+counter+shield',
    riskContexts: ['出手频次 + 反震 + 护盾'],
    counters: ['震慑', '高闪避', '真伤穿透'],
    incidents: ['P26 反震流复查(修死后追击后新露头)'],
    risk: 'watch'
  }
]

export function riskProfileOf(signature: string): RiskProfile | undefined {
  return RISK_ATLAS.find(r => r.signature === signature)
}

/**
 * 签名最多几族:取最强两族,第三族须显著(≥ SIGNATURE_THIRD_MIN)才计入。
 *
 * 抽成常量供判据读 —— 风险图谱与命名表里凡超过这个族数的签名,
 * `fingerprintOf` 永远产生不出来,是一张死档(`fingerprintConsistency.spec` 钉着)。
 */
export const SIGNATURE_MAX_FAMILIES = 3
/** 第三族要越过这条线才计入签名 */
export const SIGNATURE_THIRD_MIN = 0.85

/** 构筑的机制指纹:签名取主导家族(最强二者;第三家族须显著方计入) */
export function fingerprintOf(mods: StatMods): Fingerprint {
  const strengths: Partial<Record<MechanicFamily, number>> = {}
  const ranked: { fam: MechanicFamily; s: number }[] = []
  for (const fam of Object.keys(MECHANIC_FAMILIES) as MechanicFamily[]) {
    const s = familyStrength(mods, fam)
    if (s > 0.05) strengths[fam] = Math.round(s * 100) / 100
    if (s >= 0.5) ranked.push({ fam, s })
  }
  ranked.sort((a, b) => b.s - a.s)
  const hit = ranked.slice(0, SIGNATURE_MAX_FAMILIES - 1).map(x => x.fam)
  const third = ranked[SIGNATURE_MAX_FAMILIES - 1]
  if (third && third.s >= SIGNATURE_THIRD_MIN) hit.push(third.fam)
  hit.sort()
  const signature = hit.join('+') || 'plain'
  const name = signature === 'plain' ? '素身' : (FINGERPRINT_NAMES[signature] ?? '未名结构')
  return { signature, name, strengths, known: signature === 'plain' || FINGERPRINT_NAMES[signature] !== undefined }
}
