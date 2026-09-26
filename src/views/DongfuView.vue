<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 抬头 -->
    <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
      <!--
        冷启动直接落在这一页时(书签 / deep link / 恢复上次路由),站内没有上一页,
        裸 router.back() 会退到 about:blank 把游戏一起带走 —— 故走 goBack(父页兜底)
      -->
      <button class="-my-1.5 py-1.5 text-left text-[12px] text-ink-faint" @click="goBack(router, { name: 'home' })">← 返回</button>
      <p class="font-kai text-[15px] tracking-[0.3em] text-ink">洞府营造</p>
      <span class="text-[10px] text-ink-ghost">经营家业,道途更稳</span>
    </div>

    <!-- 洞府纪要:产出与上限一眼汇总(只读,不替代任何建筑卡的详情) -->
    <div class="rounded-md border border-ink/10 bg-paper-deep/50 px-3 py-2.5">
      <div class="flex items-center justify-between">
        <span class="font-kai text-[12px] tracking-wider text-ink-soft">洞府纪要</span>
        <span class="text-[10px] text-ink-ghost">离线上限 {{ summary.offlineHrs }} 时</span>
      </div>
      <div class="mt-1.5 grid grid-cols-3 gap-1.5">
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <p class="text-[9px] text-ink-faint">灵草 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.fieldLv ? 'text-jade' : 'text-ink-ghost'">{{ summary.fieldLv ? summary.herbHr : '—' }}</p>
        </div>
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <p class="text-[9px] text-ink-faint">玄铁 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.fieldLv ? 'text-ink-soft' : 'text-ink-ghost'">{{ summary.fieldLv ? summary.oreHr : '—' }}</p>
        </div>
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <p class="text-[9px] text-ink-faint">悟道 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.libLv ? 'text-gold-ink' : 'text-ink-ghost'">{{ summary.libLv ? summary.wudaoHr : '—' }}</p>
        </div>
      </div>
      <div class="mt-1.5 flex items-center justify-between text-[10px] text-ink-faint">
        <span>灵气上限 <span class="tabular" :class="summary.arrayLv ? 'text-azure' : 'text-ink-ghost'">{{ summary.arrayLv ? summary.qiCapPct : '—' }}</span></span>
        <span>辅修栏 <span class="tabular text-ink-soft">{{ summary.subSlots }}</span></span>
      </div>
    </div>

    <!-- 建筑:洞府是全局闸门,独自横贯一排;其余六座在其辖下成格 -->
    <section>
      <SectionTitle title="营造" hint="各司其职,日夜不辍" />
      <BuildingCard :def="mansionDef" featured class="mt-2" />
      <div class="mt-2.5 grid grid-cols-2 gap-2.5">
        <BuildingCard v-for="def in otherBuildings" :key="def.id" :def="def" />
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { goBack } from '@/router/goBack'
  import { BUILDINGS, ARRAY_QI_CAP_PER_LEVEL } from '@/data/buildings'
  import { FIELD_HERB_PER_HOUR, FIELD_ORE_PER_HOUR, LIBRARY_WUDAO_PER_HOUR } from '@/data/constants'
  import { useDongfuStore } from '@/stores/dongfu'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BuildingCard from '@/components/dongfu/BuildingCard.vue'

  const router = useRouter()
  const dongfu = useDongfuStore()

  /** 洞府:全局闸门,单独把守头条 */
  const mansionDef = computed(() => BUILDINGS.find(b => b.id === 'mansion')!)
  /** 其余六座在其辖下成格 */
  const otherBuildings = computed(() => BUILDINGS.filter(b => b.id !== 'mansion'))

  /**
   * 洞府纪要:产出与上限一眼汇总。数字写死会与结算漂移,故直接取 store 的
   * levels 与常数重算 —— 与 produce/effectText 同一口径(灵田 ×6 草/×2.4 铁,
   * 藏经阁 ×1.5 悟道,聚灵阵 ×8% 容量)。
   */
  const summary = computed(() => {
    const fieldLv = dongfu.levels.field ?? 0
    const libLv = dongfu.levels.library ?? 0
    const arrayLv = dongfu.levels.array ?? 0
    return {
      fieldLv,
      libLv,
      arrayLv,
      herbHr: `${fieldLv * FIELD_HERB_PER_HOUR} 株`,
      oreHr: `${(fieldLv * FIELD_ORE_PER_HOUR).toFixed(1)} 块`,
      wudaoHr: `${(libLv * LIBRARY_WUDAO_PER_HOUR).toFixed(1)} 点`,
      offlineHrs: dongfu.offlineCapHours,
      qiCapPct: `+${Math.round(arrayLv * ARRAY_QI_CAP_PER_LEVEL * 100)}%`,
      subSlots: dongfu.subGongfaSlots
    }
  })
</script>
