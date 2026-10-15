/**
 * 洞府灵脉 —— Phase 30.3
 * 一条主脉(70 点)+ 若干副脉(各 ≤30 点),总容量 100:不能全部点满,方向即取舍。
 */
import type { StatMods } from '@/types'

export type VeinId = 'gather' | 'craft' | 'alchemy' | 'insight'

export interface VeinDef {
  id: VeinId
  name: string
  seal: string
  desc: string
  /** 每点带来的属性加成(悟道脉走参悟折扣,不在此表) */
  perPoint: StatMods
}

export const VEINS: VeinDef[] = [
  {
    id: 'gather',
    name: '青木灵脉',
    seal: '聚',
    desc: '灵气汇流,修行事半功倍',
    perPoint: { cultivationSpeed: 0.004 }
  },
  {
    id: 'craft',
    name: '赤炎灵脉',
    seal: '炼',
    desc: '地火淬器,强化耗材更省',
    perPoint: { forgeDiscount: 0.003 }
  },
  {
    id: 'alchemy',
    name: '玉髓灵脉',
    seal: '丹',
    desc: '药气氤氲,炉中常出双丹',
    perPoint: { alchemyYield: 0.005 }
  },
  {
    id: 'insight',
    name: '寒冥灵脉',
    seal: '悟',
    desc: '静水映月,参悟功法所费更少',
    perPoint: {}
  }
]

/** 悟道脉每点参悟折扣 */
export const INSIGHT_DISCOUNT_PER_POINT = 0.004
/** 参悟省耗封顶 —— 展示与结算都以它为顶(现容量最多 70 点=28%,此值防未来加容量或调每点后展示与结算分叉) */
export const INSIGHT_DISCOUNT_CAP = 0.5
/** 与投资卡「当前加成」同一称呼,避免一条脉两个名字 */
export const INSIGHT_EFFECT_NAME = '参悟省耗'

export function veinDef(id: VeinId): VeinDef {
  return VEINS.find(v => v.id === id)!
}
