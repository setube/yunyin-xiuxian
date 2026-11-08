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
  /** 满行囊档:120 件九词条神品,九个可穿戴槽全穿上(压测用) */
  export function stressSlices(): FixtureSlices
  /** 把分片加密写进浏览器 localStorage */
  export function seedSave(context: unknown, slices: FixtureSlices, guard?: string): Promise<void>
}
