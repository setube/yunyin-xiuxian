/**
 * 玩家身份与传奇的静态目录(修行节点 / 极限纪录)。
 *
 * 原在 core/identity.ts。挪到 data/ 是为了让 endgame store 读档时能按 id 认节点与纪录,
 * 而不必反向 import core —— identity 那支模块 import 了 endgame store,一引就成环。
 * core/identity 仍原样再导出这里的表,调用方无需改 import。
 */

export interface MilestoneDef {
  id: string
  name: string
  desc: string
}

export const MILESTONE_DEFS: MilestoneDef[] = [
  { id: 'first_immortal', name: '飞升仙界', desc: '首次踏破人间界,飞升入仙' },
  { id: 'first_god', name: '破界入神', desc: '首次自仙界踏入神界' },
  { id: 'first_chaos', name: '归返混沌', desc: '首次踏入混沌海,重归大道本源' },
  { id: 'first_dao', name: '初立道途', desc: '于天穹之下立誓,择一道而行' },
  { id: 'first_world', name: '初破一界', desc: '首次踏破特殊规则世界' },
  { id: 'first_ni', name: '逆命破界', desc: '主流派核心尽封,仍以余技破界' },
  { id: 'first_wushang', name: '无伤全程', desc: '携无伤契走完全程,每战气血不失八成' },
  { id: 'first_qisha', name: '七杀功成', desc: '首次通过七杀试炼' },
  { id: 'first_void', name: '虚界行者', desc: '首次踏破天道织成的虚界' },
  { id: 'first_custom', name: '自立天道', desc: '亲手写下挑战书,并将其完成' },
  { id: 'first_daily', name: '应时而战', desc: '首次完成今日天道' },
  { id: 'first_rewrite', name: '胜于旧我', desc: '重写自己的历史道痕,快过当年' },
  { id: 'first_rebirth', name: '初入轮回', desc: '首次兵解转世,道果随神魂不灭' }
]

export function milestoneDef(id: string): MilestoneDef | undefined {
  return MILESTONE_DEFS.find(m => m.id === id)
}

export interface RecordDef {
  id: string
  name: string
  unit: string
  better: 'min' | 'max'
}

export const RECORD_DEFS: RecordDef[] = [
  { id: 'fastest_world', name: '最快破界', unit: '回合', better: 'min' },
  { id: 'highest_pact', name: '最高风险破界', unit: '×', better: 'max' },
  { id: 'biggest_reward', name: '单程最厚之赏', unit: '道源', better: 'max' },
  { id: 'best_custom', name: '挑战书最高赏格', unit: '道源', better: 'max' }
]

export function recordDef(id: string): RecordDef | undefined {
  return RECORD_DEFS.find(r => r.id === id)
}
