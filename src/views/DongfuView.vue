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
  import { BUILDINGS } from '@/data/buildings'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BuildingCard from '@/components/dongfu/BuildingCard.vue'

  const router = useRouter()

  /** 洞府:全局闸门,单独把守头条 */
  const mansionDef = computed(() => BUILDINGS.find(b => b.id === 'mansion')!)
  /** 其余六座在其辖下成格 */
  const otherBuildings = computed(() => BUILDINGS.filter(b => b.id !== 'mansion'))
</script>
