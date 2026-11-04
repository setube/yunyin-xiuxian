import { CLASSICS, type ClassicDef, type ClassicSchool } from '@/data/classics'

/**
 * 典籍谱。
 *
 * 典籍册原先把 11 部书平铺成 11 张同形的卡:哪几部同出一脉、
 * 这一脉一共占了几部、它管着几个境界 —— 全要靠读「丹道 / 道家 / 道教 / 网文」那枚小签自己数。
 * 而其余各册(紫微、星象、奇门)都已经按结构摆成了形制,只有典籍册还是流水。
 *
 * 这一层只做分组:按 school 归拢,并数出每组涉几个境界。
 * 书名、来路、相涉境界全部转发 data/classics,不另立一份。
 *
 * 为什么按「来路」而不按境界分:一部书常涉数境(性命圭旨涉三境、网文仙阶涉六境),
 * 按境界分会把同一部书抄好几遍;来路是它唯一的归属。
 */

/** 谱上一行:一脉典籍 */
export interface SchoolRow {
  school: ClassicSchool
  /** 本脉的书,按 CLASSICS 原序 */
  books: ClassicDef[]
  /** 本脉一共涉几个境界(去重后) */
  realmCount: number
  /** 本脉的书共几部 */
  count: number
}

/** 来路的固定顺序:丹道 → 道家 → 道教 → 佛道 → 网文(由内丹而上溯,网文殿后) */
const SCHOOL_ORDER: ClassicSchool[] = ['丹道', '道家', '道教', '佛道', '网文']

/**
 * 典籍按来路分谱。
 *
 * 数据里出现的来路若不在固定顺序里,按首次出现的次序补在末尾 ——
 * 新增一脉时谱上不会静默漏掉它。
 */
export function classicsBySchool(books: readonly ClassicDef[] = CLASSICS): SchoolRow[] {
  const seen: ClassicSchool[] = []
  for (const b of books) if (!seen.includes(b.school)) seen.push(b.school)
  const order = [...SCHOOL_ORDER.filter(s => seen.includes(s)), ...seen.filter(s => !SCHOOL_ORDER.includes(s))]

  return order.map(school => {
    const group = books.filter(b => b.school === school)
    const realms = new Set<string>()
    for (const b of group) for (const r of b.realms) realms.add(r)
    return { school, books: group, realmCount: realms.size, count: group.length }
  })
}

/**
 * 谱上全书计数。
 *
 * 用来钉住「一部书都没漏」:分组后的部数之和必须等于原表长度。
 */
export function classicsAccountedFor(rows: readonly SchoolRow[]): number {
  return rows.reduce((n, r) => n + r.books.length, 0)
}

/**
 * 一脉的来路说明。
 *
 * 只有一句,按来路本身的定义写(不是替玩家解释),与界域志其他各册的眉题同体例。
 */
const SCHOOL_NOTES: Record<ClassicSchool, string> = {
  丹道: '炉火药物火候,内丹一脉',
  道家: '先秦老庄,道法自然',
  道教: '科仪存思,斋醮符法',
  佛道: '释氏修证,与丹道互借',
  网文: '当代仙侠,无原典可引'
}

/** 来路的一句说明;认不出的来路给空串,不编一句假的 */
export function schoolNote(school: string): string {
  return SCHOOL_NOTES[school as ClassicSchool] ?? ''
}
