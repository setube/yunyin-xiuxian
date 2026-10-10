/**
 * 逐仓字段级自愈的唯一入口。
 *
 * 所有持久化分片(PERSISTED_STORES)在 hydrate 后统一跑一遍各自 sanitize:
 * 把加载/导入进来的坏档(JSON 合法但字段 NaN/undefined/负值)当场修平,免得
 * malformed 字段在在线会话里残留(离线结算前也要同一遍,见 offline.sanitizeOfflineInputs)。
 * 引擎 start 里也调它(见 engine.ts)——本文件把「到底修哪些仓」收成单一一处,调用方不重写。
 */
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useLoreStore } from '@/stores/lore'
import { useDongfuStore } from '@/stores/dongfu'
import { useCultivationStore } from '@/stores/cultivation'
import { useInventoryStore } from '@/stores/inventory'
import { useQuestsStore } from '@/stores/quests'
import { useAdventureStore } from '@/stores/adventure'
import { useEndgameStore } from '@/stores/endgame'
import { useLoadoutsStore } from '@/stores/loadouts'
import { useSettingsStore } from '@/stores/settings'
import { useGameStore } from '@/stores/game'
import { useDiagStore } from '@/stores/diag'
import { useMarketStore } from '@/stores/market'
import { useApprenticeStore } from '@/stores/apprentice'
import { useBountyStore } from '@/stores/bounty'
import { usePacingTelemetry } from '@/stores/pacingTelemetry'

/**
 * 逐仓自愈。调用方(main.ts 首次渲染前 / engine.start / offline 结算前)只要调这一处,
 * 修的仓与顺序就在这唯一一份(与旧 offline.sanitizeOfflineInputs 逐仓调用保持逐字一致)。
 */
export function sanitizeAllStores(): void {
  usePlayerStore().sanitize()
  useResourcesStore().sanitize()
  useLoreStore().sanitize()
  useDongfuStore().sanitize() // 洞府等级非法会把离线封顶小时算成 NaN,收益全线 NaN
  useCultivationStore().sanitize()
  useInventoryStore().sanitize()
  useQuestsStore().sanitize()
  useAdventureStore().sanitize()
  useEndgameStore().sanitize()
  useLoadoutsStore().sanitize()
  useSettingsStore().sanitize()
  useGameStore().sanitize()
  useDiagStore().sanitize()
  useMarketStore().sanitize() // 坊市货架/寄卖坏格修平,否则 renderSlot 对坏 pillId 白屏
  useApprenticeStore().sanitize()
  useBountyStore().sanitize()
  usePacingTelemetry().sanitize() // 遥测分片也落盘,坏档一样要修平(见 pacingTelemetry.sanitize)
}
