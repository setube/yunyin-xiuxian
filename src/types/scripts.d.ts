/**
 * `scripts/lib/saveFixture.mjs` 的类型声明。
 *
 * 那个模块是 QA 夹具,落在 tsconfig 的 include(`src/**`)之外,本身没有 .d.ts。
 * 而 `src/utils/fixtureParity.spec.ts` 要**实际调用** `stressSlices()` 来验证压测夹具
 * 的每一条都真能进档(源码文本解析验不出模板阶数、品质、槽位错位这些问题)。
 *
 * 放在 src/ 下是因为 tsconfig 只 include src/**;声明的是夹具用到的形状,不是完整存档类型。
 */
declare module '*/scripts/lib/saveFixture.mjs' {
  import type { EquipmentInstance, EquipSlot } from '@/types'

  export interface FixtureSlices {
    inventory: {
      items: EquipmentInstance[]
      equipped: Partial<Record<EquipSlot, string>>
      [key: string]: unknown
    }
    [storeId: string]: unknown
  }

  /** 后期档:五个 QA 脚本共用的基准 */
  export function lateSlices(): FixtureSlices
  /**
   * 中期档:内容已展开、终局未开(major < WORLD_BREAK_MAJOR)。
   * 补的是 lateSlices(终局全开)与前不久那档之间从没被扫过的一段。
   *
   * `dq` 等深层字段由判据逐条读,故这里给的是「夹具用到的形状」而非完整存档类型;
   * `dongfu.levels` / `veinPoints` 只声明成索引签名,判据自己按 data 表核 key。
   */
  export interface FixturePlayer {
    major: number
    sub: number
    age: number
    linggen: { roots: { element: string; aptitude: number }[]; gradeName: string; growthMult: number } | null
    reincarnation: { count: number; insight: number; daoFruit: number; [k: string]: unknown }
    [k: string]: unknown
  }
  export interface FixtureMidSlices extends FixtureSlices {
    player: FixturePlayer
    dongfu: { levels: Record<string, number>; veinPoints: Record<string, number>; veinMain: string | null }
    endgame: { daoPath: string | null; daoSource: number; [k: string]: unknown }
  }
  export function midSlices(major?: number): FixtureMidSlices
  /** 满行囊档:120 件九词条神品,九个可穿戴槽全穿上(压测用) */
  export function stressSlices(): FixtureSlices
  /** 把分片加密写进浏览器 localStorage */
  export function seedSave(context: unknown, slices: FixtureSlices, guard?: string): Promise<void>
}
