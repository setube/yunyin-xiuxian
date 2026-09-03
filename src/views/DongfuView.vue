<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 抬头 -->
    <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
      <button class="text-left text-[12px] text-ink-faint" @click="router.back()">← 返回</button>
      <p class="font-kai text-[15px] tracking-[0.3em] text-ink">洞府营造</p>
      <span class="text-[10px] text-ink-ghost">经营家业,道途更稳</span>
    </div>

    <!-- 建筑 -->
    <section>
      <SectionTitle title="营造" hint="各司其职,日夜不辍" />
      <div class="mt-2 grid grid-cols-2 gap-2.5">
        <BuildingCard v-for="def in BUILDINGS" :key="def.id" :def="def" />
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { BUILDINGS } from '@/data/buildings'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BuildingCard from '@/components/dongfu/BuildingCard.vue'

  const router = useRouter()
</script>
