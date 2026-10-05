/**
 * Pre-rebirth decision line. Must follow the same heritage table the
 * settlement dialog renders, not a second hand-written summary.
 */
import { HERITAGE, type HeritageMode } from '@/core/samsaraAudit'
import { MANUAL_REBIRTH_MIN_MAJOR } from '@/core/reincarnation'
import { REALMS } from '@/data/realms'

function row(id: string) {
  return HERITAGE.find(r => r.id === id)
}

/**
 * One sentence shown on the manual-rebirth button.
 * Gongfa memory stays and levels return to 1 (one full book at the top insight stage).
 * Artifacts are external goods and are wiped.
 */
export function rebirthDecisionHint(): string {
  const keep = [row('daoFruit'), row('talents')].filter(r => r?.mode === 'full').map(r => r!.name)
  const artifacts = row('artifacts')
  const realm = REALMS[MANUAL_REBIRTH_MIN_MAJOR]?.name ?? ''
  const parts = [
    keep.length ? `带走${keep.join('与')}` : '',
    '功法记得门类,层数回到一层;顶阶宿慧可留一门满层',
    artifacts?.mode === 'reset' ? `${artifacts.name}随皮囊散去` : '',
    realm ? `${realm}境方可自行兵解` : ''
  ].filter(Boolean)
  return `${parts.join('。')}。`
}

/**
 * 转世去留一览 —— 逐行取自 HERITAGE 同表(结算弹窗也读它),界面不另写一份。
 * 兵解是不可逆的大事,一句「随皮囊散去」盖不住整本账:灵脉、洞府、灵石、
 * 敌人认知……玩家按下前要知道每一样去了哪。
 */
export interface HeritageViewRow {
  id: string
  name: string
  mode: HeritageMode
  modeLabel: string
  cls: string
}

function modeMeta(mode: HeritageMode): { label: string; cls: string } {
  if (mode === 'full') return { label: '随魂保留', cls: 'text-jade' }
  if (mode === 'partial') return { label: '部分保留', cls: 'text-gold-ink' }
  return { label: '归零重来', cls: 'text-ink-faint' }
}

export function heritageViewRows(): HeritageViewRow[] {
  return HERITAGE.map(r => {
    const m = modeMeta(r.mode)
    return { id: r.id, name: r.name, mode: r.mode, modeLabel: m.label, cls: m.cls }
  })
}
