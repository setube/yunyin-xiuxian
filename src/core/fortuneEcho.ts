/**
 * 遗产回声(Phase 31.3)
 *
 * 历史选择 → 持久记忆 → 再次触发旧内容 → 世界表现出「认识你」。
 *
 * 边界(锁死):
 *   只读 fortuneChoices
 *   不新增资源 / 属性 / 奖励 / 战斗规则 / 独立 UI
 *   回声是叙事,不改变任何数值利益
 *
 * 规则:
 *   - 新玩家(无 leave 记录): 永不回声
 *   - 曾 leave: 原机缘仍正常出现;极低概率(5%)替换为回声叙事;不进入推荐
 *   - 曾 take: 不触发 leave-回声(它已是你的缘)
 *   - 多次 leave: 效果不叠加(布尔判断)
 */
import { usePlayerStore } from '@/stores/player'
import { aftermathText, shouldTriggerAftermath } from './worldMemory'
import type { EventMemory } from '@/types'

/** 回声触发概率(稀有,5%) */
export const ECHO_CHANCE = 0.05

/**
 * 三种回声形态(按机缘叙事语境选择):
 *   认出你 —— 世界记得你的脸
 *   缘分已尽 —— 未结之缘无法重续
 *   留下痕迹 —— 你曾在此留下过什么
 */
export type EchoForm = 'recognize' | 'fate-over' | 'traces'

export interface FortuneEcho {
  eventId: string
  form: EchoForm
  /** 回声前的导语(显示在抉择文案上方) */
  line: string
}

/**
 * 一次事件打开的叙事快照。
 *
 * 回声与余波都各掷一次骰子,而 EventDialog 是常驻全局的组件:若把掷骰放在
 * computed 里,任何父级重渲染都会重掷,同一扇窗会自己变脸;若把「已掷过」
 * 放在组件级布尔量里,下一件事又会继承上一件的答案。故把「这一件事」的
 * 掷骰结果收成一份快照,由事件 id 变化时重建。
 */
export interface EventNarrative {
  eventId: string
  echo: FortuneEcho | null
  aftermath: string | null
}

const FORTUNE_ECHO_TEXTS: Record<string, { form: EchoForm; line: string }> = {
  ft_reclusive_elder: {
    form: 'recognize',
    line: '竹屋前的老人抬眼望来,目光在你面上停了一瞬——「原来是你。」'
  },
  ft_sword_remnant: {
    form: 'traces',
    line: '三道剑痕犹在,只是剑气已散。你们曾在此狭路相逢。'
  },
  ft_ancient_elixir: {
    form: 'fate-over',
    line: '丹房还在,丹方却已不在原处。那段未曾结下的缘,此刻无法重新拾起。'
  },
  ft_beast_pledge: {
    form: 'recognize',
    line: '草丛边窜出一头幼兽,嗅了嗅你的衣角,又退开两步,似是认得你。'
  },
  ft_blood_contract: {
    form: 'traces',
    line: '染血的龟甲埋在你亲手挖的土坑里——你曾将它掩埋于此。'
  },
  ft_xianmen_guqin: {
    form: 'traces',
    line: '古琴仍在案上,弦上依旧无尘。你曾在这里坐了一晌,终究没有伸手。'
  },
  ft_yunduan_xianzun: {
    form: 'recognize',
    line: '云端那位仙尊又在负手而立,瞥见你时笑了笑:「这回,还是不来?」'
  },
  ft_shenyu_wangzuo: {
    form: 'fate-over',
    line: '王座依旧悬在神域中央。你曾绕它而行,如今它认得你的脚步了。'
  },
  ft_faze_zhixin: {
    form: 'traces',
    line: '那枚光核还在跳动。你曾只是看着它,没有碰。'
  },
  ft_hundun_zhong: {
    form: 'recognize',
    line: '混沌之种回到你眼前,像是认得那个把它埋回去的人。'
  },
  ft_hongmeng_xiantai: {
    form: 'fate-over',
    line: '先台无字,那与你有关的一笔,还空着。你曾选择不去看它。'
  }
}

/** 机缘是否有回声资格(曾放弃) */
export function echoEligible(eventId: string): boolean {
  return usePlayerStore().fortuneChoices[eventId] === 'leave'
}

/** 组装回声(事件 id 有回声文本时;否则 null) */
export function echoFor(eventId: string): FortuneEcho | null {
  if (!echoEligible(eventId)) return null
  const data = FORTUNE_ECHO_TEXTS[eventId]
  if (!data) return null
  return { eventId, form: data.form, line: data.line }
}

/**
 * 掷定一次事件打开期间的叙事快照。
 *
 * `roll` 可注入,测试无需碰全局随机源。回声与余波互斥:回声是「世界认得你」
 * 的更强叙事,余波只是同一件事留下的痕迹;两者同时出现会把一屏小字叠成两段。
 * 掷骰顺序固定为「先回声、再余波」,且每个事件只调用一次。
 */
export function rollEventNarrative(
  eventId: string,
  eventTitle: string,
  eventMemories: Record<string, EventMemory>,
  roll: () => number
): EventNarrative {
  const echo = eventId.startsWith('ft_') && roll() < ECHO_CHANCE ? echoFor(eventId) : null
  if (echo) return { eventId, echo, aftermath: null }

  const memory = eventMemories[eventId]
  const aftermath =
    memory && shouldTriggerAftermath(eventMemories, eventId, roll())
      ? aftermathText(eventTitle, memory.times >= 3 ? 'good' : memory.times >= 2 ? 'echo' : 'silence')
      : null
  return { eventId, echo: null, aftermath }
}
