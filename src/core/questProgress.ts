/** 主线进度读数:达成与否读 progress.evalCond(与发赏判定同源);文案只做翻译,不另立标准 */
import type { AchvCond, QuestDef } from '@/types'
import { evalCond } from './progress'
import { realmDef, realmLabel } from '@/data/realms'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'

export interface QuestProgressView {
  /** 一句话读数:「已 3/10」「尚在 炼气·二层 · 需至 炼气·三层」 */
  text: string
  done: boolean
  /** 0~1 比例(界面画条用);不可量化的为 null */
  ratio: number | null
}

/** 条件 → 进度文案;认不出的条件返回 null(界面不显示) */
export function questProgressOf(cond: AchvCond): QuestProgressView | null {
  const player = usePlayerStore()
  const quests = useQuestsStore()
  const done = evalCond(cond)

  switch (cond.type) {
    case 'counter': {
      const cur = quests.counter(cond.key)
      return {
        text: done
          ? `已成(${cond.value}/${cond.value})`
          // 计数可能是坏档写进来的负数:钳到 0,别让界面读出「已 -5/10」
          : `已 ${Math.min(Math.max(0, cur), cond.value)}/${cond.value}`,
        done,
        ratio: cond.value > 0 ? Math.min(1, Math.max(0, cur / cond.value)) : 1
      }
    }
    case 'realm': {
      const target = realmDef(cond.major)
      return {
        text: done ? `已至 ${target.name}` : `尚在 ${player.realm.name} · 需至 ${target.name}`,
        done,
        ratio: null
      }
    }
    case 'custom': {
      const m = /^realm_(\d+)_(\d+)$/.exec(cond.key)
      // 状态型键(寿元 / 灵石)不算进度
      if (!m) return null
      const target = realmLabel(Number(m[1]), Number(m[2]))
      return {
        text: done ? `已至 ${target}` : `尚在 ${player.realmName} · 需至 ${target}`,
        done,
        ratio: null
      }
    }
    default:
      return null
  }
}

/** 当前主线的进度(首页用) */
export function currentMainQuestProgress(): QuestProgressView | null {
  const def: QuestDef | undefined = useQuestsStore().currentMainQuest
  return def ? questProgressOf(def.cond) : null
}
