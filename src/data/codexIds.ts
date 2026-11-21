/**
 * 各收藏类目的合法 id 集合 —— 读档清洗用。
 *
 * 为什么要它:写入侧 `collect(category, id)` 的 id 全部来自这几张数据表
 * (装备模板、功法、丹方、法宝、灵兽、际遇、天赋、道侣),表外的 id **只可能来自坏档**。
 * 而收藏册的每一处展示都是「拿表逐条比对」(codexOwnedCount、CollectionView 的 entries):
 * 表外 id 既不显示,也不计入「已收 N」—— 它们唯一的作用是把存档撑大。
 * 实测灌十万条野 id:存档涨到 1.29MB,而那一页一个字都不会多出来。
 *
 * 放在 data/ 而不是 ui/codex:后者已经 import 了 stores/quests,store 反向引它会成环;
 * 这里只依赖各数据表,是干净的叶子模块。
 */
import { EQUIPMENT_TEMPLATES } from './equipment'
import { GONGFA } from './gongfa'
import { PILLS } from './pills'
import { ARTIFACTS } from './artifacts'
import { PETS } from './pets'
import { EVENTS } from './events'
import { TALENTS } from './talents'
import { DAOLU } from './daolu'

export const CODEX_IDS = {
  equip: new Set(EQUIPMENT_TEMPLATES.map(d => d.id)),
  gongfa: new Set(GONGFA.map(d => d.id)),
  pill: new Set(PILLS.map(d => d.id)),
  artifact: new Set(ARTIFACTS.map(d => d.id)),
  pet: new Set(PETS.map(d => d.id)),
  event: new Set(EVENTS.map(d => d.id)),
  talent: new Set(TALENTS.map(d => d.id)),
  daolu: new Set(DAOLU.map(d => d.id))
} as const
