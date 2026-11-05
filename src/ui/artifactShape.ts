import type { ArtifactDef, ArtifactEffect } from '@/types'

/**
 * 法宝神通的形制。
 *
 * 每件法宝都带一个神通,而「这一击是打人、是护身、还是削敌」在界面上**只写成一句文案**:
 * 神通行统一是「神通「X」:某某效果」,八种性质长得一模一样。
 * 玩家在包袱里比两件法宝,要先读完整句话才知道一件是攻击型、另一件是护盾型 ——
 * 而这两类的用途完全不同(一件该配输出装,一件该在硬仗里戴)。
 *
 * 这一层把神通性质落成三样形制,全部从 `active.effect` 的 `type` 现算:
 *   性(disposition):攻 / 护 / 削 / 净四类 —— 这是玩家真正在做的判断;
 *   纹(crest):八种各一枚线纹,同类之间也分得开;
 *   名(noun):主体数值的称谓(原先散落在 ArtifactPanel 的一张私有表里,**缺 stun**)。
 *
 * 铁律:
 *   1. 形制层不另立数值:性质只是 `type` 的分类,不重算强弱;
 *   2. 八种 `type` 必须全部登记 —— 漏一种就会让那几件法宝退回「长得跟别人一样」(spec 钉着);
 *   3. 色只表达四类性质,色弱玩家靠纹样与名仍然分得开。
 */

/** 神通性质:攻(伤敌)/ 护(护身)/ 削(损敌)/ 净(解控) */
export type ArtifactDisposition = 'attack' | 'guard' | 'debuff' | 'cleanse'

/** 八种 `type` 各一枚线纹 */
export type ArtifactCrest = 'burst' | 'drop' | 'seal' | 'wall' | 'bind' | 'crack' | 'unlock' | 'halt'

export const DISPOSITION_NAMES: Record<ArtifactDisposition, string> = {
  attack: '攻',
  guard: '护',
  debuff: '削',
  cleanse: '净'
}

/**
 * `type` → 性质 + 纹 + 称谓。
 *
 * 一张表管三件事,是为了让「新增一种 effect 忘了登记」只可能漏一处:
 * 三处分开写,漏登记时形制会各自退化,症状不一致反而难查。
 */
const EFFECT_SHAPES: Record<
  ArtifactEffect['type'],
  { disposition: ArtifactDisposition; crest: ArtifactCrest; noun: string }
> = {
  damage: { disposition: 'attack', crest: 'burst', noun: '威力' },
  drain: { disposition: 'attack', crest: 'drop', noun: '威力' },
  shield: { disposition: 'guard', crest: 'wall', noun: '护盾' },
  stun: { disposition: 'attack', crest: 'halt', noun: '震慑' },
  heal: { disposition: 'guard', crest: 'seal', noun: '回复' },
  weaken: { disposition: 'debuff', crest: 'bind', noun: '削弱' },
  sunder: { disposition: 'debuff', crest: 'crack', noun: '破甲' },
  purge: { disposition: 'cleanse', crest: 'unlock', noun: '挣脱' }
}

export interface ArtifactShapeMark {
  /** 八种 type 之一,原样转发 */
  type: ArtifactEffect['type']
  /** 神通性质 */
  disposition: ArtifactDisposition
  /** 性质的中文单字 */
  dispositionName: string
  /** 线纹种类,CSS 按它上纹样 */
  crest: ArtifactCrest
  /** 主体数值的称谓 */
  noun: string
  /** 读屏与 title 的说法:性质 + 称谓,不另造词 */
  label: string
}

/** 神通形制;认不出 `type` 时给 undefined,调用点据此不画(不画错的纹) */
export function artifactShapeMark(def: ArtifactDef | undefined): ArtifactShapeMark | undefined {
  const type = def?.active?.effect?.type
  if (!type) return undefined
  const shape = EFFECT_SHAPES[type]
  if (!shape) return undefined
  return {
    type,
    disposition: shape.disposition,
    dispositionName: DISPOSITION_NAMES[shape.disposition],
    crest: shape.crest,
    noun: shape.noun,
    label: `${DISPOSITION_NAMES[shape.disposition]} · ${shape.noun}`
  }
}

/**
 * 主体数值的称谓(供既有调用点沿用)。
 * 认不出时回落到「效果」—— 与改造前那张私有表的兜底一致,不改变既有行为。
 */
export function artifactActiveNoun(def: ArtifactDef | undefined): string {
  return artifactShapeMark(def)?.noun ?? '效果'
}

/** 已登记的八种 type,按登记次序;界面逐类列形制时读它,不另抄一份 */
export function allArtifactEffectTypes(): ArtifactEffect['type'][] {
  return Object.keys(EFFECT_SHAPES) as ArtifactEffect['type'][]
}
