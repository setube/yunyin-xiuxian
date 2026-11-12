<template>
  <BaseModal :open="open" :title="`修行画像 · 「${identity?.epithet ?? IDENTITY_DEFAULT_EPITHET}」`" @close="emit('close')">
    <div v-if="identity" class="space-y-2.5">
      <p class="text-[12px] leading-relaxed text-ink-soft">{{ identity.narrative }}</p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <p v-for="r in identityRoots" :key="r.label" class="flex justify-between">
          <span class="text-ink-faint">{{ r.label }}</span>
          <span class="text-ink-soft">{{ r.value }}</span>
        </p>
      </div>
      <p v-if="identity.roots.fortunes.length" class="text-[11px] text-ink-faint">
        机缘印记:{{ identity.roots.fortunes.map(f => f.title).join(' · ') }}
      </p>
      <!--
        行为三录:core 早就算出 traits(特征词 / 风险倾向 / 三项计数),此前没有任何界面读过 ——
        「此修士问剑之相已现」读得到,「凭什么」读不到。这里把三个数摆出来,并给出它们的相对份量。
        刻度以本组最大值为满格:三项量级差得远,共尺会把最小的那项压成看不见的一线(见 ui/traitRecord)。
      -->
      <div v-if="showTraits" class="border-t border-ink/10 pt-2">
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-kai text-[11px] tracking-[0.2em] text-ink-faint">行迹</span>
          <span v-if="traitRows?.risk" class="text-[10px] text-violet-ink">
            {{ traitRows.risk.label }}
            <span class="text-ink-faint">· {{ traitRows.risk.note }}</span>
          </span>
        </div>
        <div v-if="traitRows" class="mt-1.5 space-y-1">
          <p v-for="c in traitRows.counters" :key="c.key" class="flex items-center gap-2 text-[10px]">
            <span class="w-8 shrink-0 text-ink-faint">{{ c.label }}</span>
            <span class="track-ink h-1 min-w-0 flex-1 overflow-hidden rounded-full">
              <span class="bar-fill h-full rounded-full bg-ink-soft" :style="{ width: `${traitBarOf(c.key) * 100}%` }" />
            </span>
            <span class="w-10 shrink-0 text-right tabular text-ink-soft">{{ formatNum(c.value) }}</span>
          </p>
        </div>
        <p v-if="traitRows && traitRows.adjectives.length" class="mt-1.5 flex flex-wrap items-center gap-1">
          <span class="text-[10px] text-ink-faint">相:</span>
          <span
            v-for="a in traitRows.adjectives"
            :key="a"
            class="rounded border border-violet-ink/30 bg-violet-ink/5 px-1.5 py-0.5 text-[10px] leading-none text-ink"
          >{{ a }}</span>
        </p>
      </div>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">收 卷</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { buildIdentity, IDENTITY_DEFAULT_EPITHET } from '@/core/identityService'
  import { hasTraitRecord, traitBars, traitRecord } from '@/ui/traitRecord'
  import { formatNum } from '@/utils/format'
  import BaseModal from '@/components/common/BaseModal.vue'

  /** 修行画像弹窗。identity 与宿主各算一份(buildIdentity() 是纯 core 调用),不穿 prop */
  defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const identity = computed(() => buildIdentity())

  /** 行为三录(见 ui/traitRecord);空态整块不出 */
  const traitRows = computed(() => traitRecord(identity.value))
  const showTraits = computed(() => hasTraitRecord(traitRows.value))
  /** 逐项刻度:与 traitBars 同序,按 key 取,模板里不必再按下标 */
  function traitBarOf(key: string): number {
    const rows = traitRows.value
    if (!rows) return 0
    const i = rows.counters.findIndex(c => c.key === key)
    return i < 0 ? 0 : (traitBars(rows)[i] ?? 0)
  }

  /** 四项目录;师承空值须与人物页入口卡同为「未拜师」 */
  const identityRoots = computed(() => {
    const r = identity.value?.roots
    return [
      { label: '师承', value: r?.mentor?.name ?? '未拜师' },
      { label: '道途', value: r?.daoPath ?? '未择' },
      { label: '流派', value: r?.build ?? '未成' },
      { label: '悟道', value: r?.branches.join('、') || '未定' }
    ]
  })
</script>
