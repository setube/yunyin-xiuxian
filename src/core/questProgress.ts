/**
 * 主线进度读数 —— 「这条路我走到哪了」
 *
 * 首页把主线的名字与说明摆着,却只给计数型任务报 3/10;境界与
 * `realm_<major>_<sub>` 里程碑只有一句「突破至金丹境」,玩家看不出
 * 自己离那一步还有多远。主线是新手第一天唯一的路线图,没有进度
 * 就只能猜这一趟历练算不算数。
 *
 * 两条纪律:
 *   一 **达成与否读 progress.evalCond**,与真正发赏的判定同一份;
 *   二 文案只做翻译,不另立标准:counter 报「已 X/Y」,realm 报
 *      「尚在何处 / 需至何处」,custom 的境界层数键同样点名目标。
 */
import type { AchvCond, QuestDef } from '@/types'
import { evalCond } from './progress'
import { realmDef, realmLabel } from '@/data/realms'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'

export interface QuestProgressView {
  /** 一句话读数:「已 3/10」「尚在 炼气·二层 · 需至 炼气·三层」 */
  text: string
  done: boolean
  /** 可量化的那类给个 0~1 的比例(界面画条用);不可量化的为 null */
  ratio: number | null
}

/** 条件 → 进度文案。认不出的条件返回 null(界面就不显示,不硬编一个) */
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
          : `已 ${Math.min(cur, cond.value)}/${cond.value}`,
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
      // 状态型键(寿元 / 灵石)不是「进度」,不在这里装成一条
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
