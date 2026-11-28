/**
 * 机制指纹的三张表必须能互相推出来。
 *
 * 三张表各写各的:
 *   · `MECHANIC_FAMILIES` —— 每个家族由哪些词条、按什么参考值算强度
 *   · `FINGERPRINT_NAMES`  —— 家族签名 → 中文名
 *   · `RISK_ATLAS`         —— 家族签名 → 风险语境 / 对策 / 事故档案
 *
 * 它们此前**没有任何判据连起来**,于是两边各说各话(实测):
 *   · 图谱 17 条里 **4 条在命名表里没有名字**(`combo+desperate+mitigation` /
 *     `burst+desperate+shield` / `burst+mitigation+sustain` / `combo+counter+shield`),
 *     而它们都能被 `fingerprintOf` 真实产生出来
 *   · 图谱里还有一条 **四族签名** `burst+combo+mitigation+sustain`,而签名最多三族 ——
 *     它自登记起就是死档,永远匹配不到
 *
 * 后果不是「少一条提示」:同一批破墙构建,
 * `buildSearch.spec` 按「不在命名表」把它们算成**未名结构**并计入上限(≥3 即红,
 * 提示「请在 FINGERPRINT_NAMES 登记」),而 `ruleUniverse.spec` 按「在图谱里有档」
 * 判它们**早已登记** —— 一条判据说「还没人管」,另一条说「早有人管」。
 *
 * 故障注入:从命名表删掉任一条 → 第一条红;往图谱里写一条四族签名 → 第二条红。
 */
import { describe, expect, it } from 'vitest'
import {
  FINGERPRINT_NAMES,
  MECHANIC_FAMILIES,
  RISK_ATLAS,
  SIGNATURE_MAX_FAMILIES,
  fingerprintOf,
  type MechanicFamily
} from './fingerprints'

const FAMILIES = Object.keys(MECHANIC_FAMILIES) as MechanicFamily[]

/** 每个家族的参考值全部补齐到 1.2 倍:familyStrength 的 max 与 avg 都过 0.5 线 */
function buildOf(fams: MechanicFamily[]): Record<string, number> {
  const mods: Record<string, number> = {}
  for (const f of fams) {
    for (const [k, v] of Object.entries(MECHANIC_FAMILIES[f])) mods[k] = (v as number) * 1.2
  }
  return mods
}

/** 签名能真的由 `fingerprintOf` 产生出来 */
function reachable(signature: string): boolean {
  if (signature === 'plain') return fingerprintOf({}).signature === 'plain'
  const fams = signature.split('+') as MechanicFamily[]
  if (fams.some(f => !FAMILIES.includes(f))) return false
  return fingerprintOf(buildOf(fams) as never).signature === signature
}

describe('机制指纹 · 三张表互相可推', () => {
  it('风险图谱里的每条签名都产生得出来,且都有名字', () => {
    const dead: string[] = []
    const nameless: string[] = []
    for (const r of RISK_ATLAS) {
      if (!reachable(r.signature)) dead.push(r.signature)
      if (FINGERPRINT_NAMES[r.signature] === undefined) nameless.push(r.signature)
    }
    expect(dead, `这些签名 fingerprintOf 永远产生不出来,是死档:\n${dead.join('\n')}`).toEqual([])
    expect(
      nameless,
      `这些签名在图谱里有档却没有名字 —— buildSearch 会把它算成「未名结构」而 ruleUniverse 又判它已登记:\n${nameless.join('\n')}`
    ).toEqual([])
  })

  it('没有超过三族的签名(签名最多三族,再长就永远生成不出来)', () => {
    const tooLong: string[] = []
    for (const sig of [...RISK_ATLAS.map(r => r.signature), ...Object.keys(FINGERPRINT_NAMES)]) {
      if (sig === 'plain') continue
      if (sig.split('+').length > SIGNATURE_MAX_FAMILIES) tooLong.push(sig)
    }
    expect(
      tooLong,
      `签名最多 ${SIGNATURE_MAX_FAMILIES} 族,这些签名的族数超了:\n${tooLong.join('\n')}`
    ).toEqual([])
  })

  it('命名表里每一族名都真实存在,且每条签名都产生得出来', () => {
    const badFam: string[] = []
    const dead: string[] = []
    for (const sig of Object.keys(FINGERPRINT_NAMES)) {
      if (sig === 'plain') continue
      for (const f of sig.split('+')) if (!FAMILIES.includes(f as MechanicFamily)) badFam.push(`${sig}: ${f}`)
      if (!reachable(sig)) dead.push(sig)
    }
    expect(badFam, `这些族名不在 MECHANIC_FAMILIES 里:\n${badFam.join('\n')}`).toEqual([])
    expect(dead, `这些名字挂在一个产生不出来的签名上:\n${dead.join('\n')}`).toEqual([])
  })

  /**
   * 图谱的签名不许重复。
   *
   * `riskProfileOf` 是 `find` —— 同一条签名写两遍,后写的那份永远查不到,
   * 而两条档的语境 / 对策可能不同,读代码的人会以为两边的提醒都生效了。
   */
  it('风险图谱的签名不重复', () => {
    const seen = new Set<string>()
    const dup: string[] = []
    for (const r of RISK_ATLAS) {
      if (seen.has(r.signature)) dup.push(r.signature)
      seen.add(r.signature)
    }
    expect(dup, `riskProfileOf 只 find 第一条,重复的签名查不到:\n${dup.join('\n')}`).toEqual([])
  })

  /**
   * 三样都要写:语境、对策、事故。
   *
   * 图谱的用处是「新人改到这条结构时知道该查什么」,缺任一样就只是个标签。
   * 事故档案尤其要留 —— 它是「这条为什么被登记」的唯一凭据。
   */
  it('图谱每条都写了风险语境、对策与事故档案', () => {
    const thin: string[] = []
    for (const r of RISK_ATLAS) {
      if (r.riskContexts.length === 0) thin.push(`${r.signature}: 缺风险语境`)
      if (r.counters.length === 0) thin.push(`${r.signature}: 缺对策`)
      if (r.incidents.length === 0) thin.push(`${r.signature}: 缺事故档案`)
    }
    expect(thin, `图谱条目要写清语境 / 对策 / 事故:\n${thin.join('\n')}`).toEqual([])
  })
})
