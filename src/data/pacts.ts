/** 天道契约:玩家主动签下的不公平规则,风险换道源 */
import type { PactDef } from '@/types'

/**
 * 重注阈值:道源倍率达到这条线即算「重契」。
 * 唯一定义处 —— `core/identity` 用它数「主动接下天道重注」,`ui/pactMark` 用它上形制。
 * 两处各写一个 2.5,迟早分叉成「界面说这是重注、画像里不算」。
 */
export const PACT_HEAVY_MULT = 2.5

export const PACTS: PactDef[] = [
  {
    id: 'xue',
    name: '血契',
    seal: '血',
    desc: '此行伤势只进不出',
    ruleText: '一切治疗无效 · 道源 ×2.2',
    rules: { healMult: 0 },
    sourceMult: 2.2
  },
  {
    id: 'can',
    name: '天残契',
    seal: '残',
    desc: '残躯入界,以七成气血开每一场',
    ruleText: '每场开局气血 70% · 道源 ×1.7',
    rules: { playerStartHpPct: 0.7 },
    sourceMult: 1.7
  },
  {
    id: 'ji',
    name: '疾战契',
    seal: '疾',
    desc: '天不予时,拖过廿五回合即败',
    ruleText: '回合上限 25 · 道源 ×2.0',
    rules: { maxRounds: 25 },
    sourceMult: 2.0
  },
  {
    id: 'gu',
    name: '孤剑契',
    seal: '孤',
    desc: '只携一件法宝,余者封于界外',
    ruleText: '仅第一件法宝随身 · 道源 ×1.6',
    special: 'soloArtifact',
    sourceMult: 1.6
  },
  {
    id: 'wushang',
    name: '无伤契',
    seal: '完',
    desc: '每场战罢气血须存八成,否则契毁人出',
    ruleText: '每场战后气血 ≥80% · 道源 ×3.0',
    special: 'endHp80',
    sourceMult: 3.0
  },
  {
    id: 'ni',
    name: '逆命契',
    seal: '逆',
    desc: '封印你最擅长的道路,以余技破界',
    ruleText: '主流派核心词条尽数封印 · 道源 ×4.0',
    special: 'sealCore',
    sourceMult: 4.0
  }
]

export function pactDef(id: string): PactDef | undefined {
  return PACTS.find(p => p.id === id)
}
