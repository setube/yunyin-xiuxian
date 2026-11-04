import { CLASSICS, type ClassicDef } from '@/data/classics'
import { REALMS } from '@/data/realms'

/**
 * 典籍所指的境界,标出「已过 / 当前 / 未至」。
 *
 * 典籍卡原写「相涉:筑基、金丹、元婴」—— 一串纯文字,看不出这几个境界里
 * 哪些是自己走过的、哪个正身处其中、哪些还没到。
 * 而这正是翻典籍时最先想知道的一件事:这本书讲的是来路,还是去路。
 *
 * 同一页的境界页签早已把这件事讲清楚了(已过给一道青「过」字印),
 * 两处读的是同一份境界表,没有理由一处讲、一处不讲。
 *
 * 口径与 ui/worldProgress 的「已过」一致:严格低于当前境界才算已过。
 */

/** 一个境界在「我」的来路上的位置 */
export type RealmPhase = 'past' | 'here' | 'ahead'

export interface ClassicRealmMark {
  id: string
  name: string
  phase: RealmPhase
}

/** 已过 / 当前 / 未至;坏 index 按未至处理(少承诺) */
export function realmPhase(index: number, major: number): RealmPhase {
  if (!Number.isFinite(index) || !Number.isFinite(major)) return 'ahead'
  if (index < major) return 'past'
  if (index === major) return 'here'
  return 'ahead'
}

/** 一部典籍所指的诸境界,各带位置 */
export function classicRealmMarks(classic: ClassicDef, major: number): ClassicRealmMark[] {
  return classic.realms.map(id => {
    const idx = REALMS.findIndex(r => r.id === id)
    // 书里记了不存在的境界 id 时,给出原名而不吞掉 —— 数据错了要看得见
    const name = idx >= 0 ? REALMS[idx]!.name : id
    return { id, name, phase: idx >= 0 ? realmPhase(idx, major) : 'ahead' }
  })
}

/**
 * 一脉诸书合起来点到几个境界,其中几个已过。
 *
 * 流派卡右上角原写「3 部 · 涉 5 境」—— 只说涉几个,不说其中几个已经走过。
 * 数值取自诸书的 realms 并集,不另算。
 */
export function schoolRealmSpan(classics: readonly ClassicDef[], major: number): { total: number; past: number } {
  const ids = new Set<string>()
  for (const c of classics) for (const id of c.realms) ids.add(id)
  let past = 0
  for (const id of ids) {
    const idx = REALMS.findIndex(r => r.id === id)
    if (idx >= 0 && realmPhase(idx, major) === 'past') past += 1
  }
  return { total: ids.size, past }
}

/** 全书里点到的境界总数(凡境 + 天界),供判据核对 */
export function allClassicRealmIds(): string[] {
  return [...new Set(CLASSICS.flatMap(c => c.realms))]
}
