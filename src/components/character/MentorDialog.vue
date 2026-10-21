<template>
  <!-- 师承弹窗:拜师 / 师尊评价
      (Phase 31 S1:四种师承理念,拜后不改,转世保留,纯叙事反馈) -->
  <BaseModal :open="open" :title="mentorVer ? `师承 · ${mentorVer.mentor?.name ?? ''}` : '拜师'" @close="emit('close')">
    <div v-if="mentorVer" class="space-y-3">
      <p class="font-kai text-[14px] text-ink">{{ mentorVer.mentor?.master }}</p>
      <p class="text-[12px] leading-relaxed text-ink-soft">
        「{{ mentorVer.line }}」
      </p>
      <p class="text-[11px] text-ink-faint tabular">
        契合度
        <span :class="mentorVer.affinity > 0.2 ? 'text-jade' : mentorVer.affinity < -0.2 ? 'text-cinnabar' : 'text-ink-faint'">
          {{ mentorVer.affinity.toFixed(2) }} / 1.0
        </span>
      </p>
      <p class="text-[11px] leading-relaxed text-ink-faint">
        师承词条:{{ mentorVer.mentor ? modsText(mentorVer.mentor.mods) : '—' }}
      </p>
    </div>
    <div v-else class="space-y-2.5">
      <p class="text-[12px] leading-relaxed text-ink-faint">师承,是你在凡界遇见的良师相赠的一份心法。拜入门下,得一条相合之增益;言行与师道相契,师尊自有嘉许 —— 纵偶有不契,也不至受罚。</p>
      <button
        v-for="m in mentorChoicesList"
        :key="m!.id"
        class="w-full rounded-lg border px-3 py-2.5 text-left transition-all active:scale-98"
        :class="hintMentor === m!.id ? 'border-cinnabar/60 bg-cinnabar/5' : 'border-ink/20'"
        @click="player.adoptMentor(m!.id)"
      >
        <p class="flex items-baseline gap-2">
          <span class="font-kai text-[14px] text-ink">{{ m!.name }}</span>
          <span class="text-[11px] text-azure">{{ m!.title }}</span>
          <span v-if="hintMentor === m!.id" class="chip-ink ml-1 border-cinnabar/50 text-[9px] text-cinnabar">机缘引荐</span>
          <span class="ml-auto text-[10px] text-ink-faint">{{ m!.master }}</span>
        </p>
        <p class="mt-0.5 text-[11px] text-ink-faint">{{ m!.desc }}</p>
        <p class="mt-0.5 text-[11px] text-azure tabular">{{ modsText(m!.mods) }}</p>
        <!--
          拜师前就该看见与这位师尊当下的契合(同一份 mentorVerdict 读数,不必等拜完):
          师承给的是增益,选谁合谁,先让玩家做得了知情的一笔
        -->
        <p class="mt-0.5 text-[10px] tabular" :class="mentorAffinityChip(m!.id)">
          当下契合 {{ mentorAffinityText(m!.id) }}
        </p>
      </button>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">知道了</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { mentorVerdict, mentorChoices } from '@/core/mentorService'
  import { mentorHint } from '@/core/fortuneChain'
  import { modsText } from '@/data/statNames'
  import type { MentorId } from '@/data/mentors'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 师承弹窗 —— 拜师 / 师尊评价(Phase 31 S1:四种师承理念,拜后不改,转世保留,纯叙事反馈)。
   *
   * 自 CharacterView 迁入:mentorVer 在宿主与本组件各算一份(宿主入口卡的
   * 「求教/拜师」与副行要读它,弹窗正文也要读),调用同一个 core 函数,无逻辑漂移面。
   * 拜师前的契合度预读(mentorAffinityMap)只有弹窗用,随迁。
   */
  defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const player = usePlayerStore()
  const mentorVer = computed(() => mentorVerdict(player.mentor))
  /** 可选师承列表是纯静态数据,setup 只算一次;弹窗 v-for 不再每帧重取 */
  const mentorChoicesList = mentorChoices()
  /**
   * 拜师前预读契合度(与拜后的 verdict 同一函数,只是人还没拜 —— 选谁合谁有数可见)。
   * 契合是 -1~1 的实数(见 mentorService),与同为百分比的构筑契合不同 —— 这里把标尺
   * 也带出来(…/ 1.0),不然裸一个 0.42 读者分不清是 42% 还是 0.42/1.0。
   *
   * 备选师尊的契合度一次算齐进 Map:模板里同一人只读一份,不再逐人两处各算一遍 mentorVerdict。
   */
  const mentorAffinityMap = computed(() => {
    const map = new Map<MentorId, number>()
    for (const m of mentorChoicesList) map.set(m.id, mentorVerdict(m.id)?.affinity ?? 0)
    return map
  })
  function mentorAffinity(mentorId: MentorId): number {
    return mentorAffinityMap.value.get(mentorId) ?? 0
  }
  function mentorAffinityText(mentorId: MentorId): string {
    const a = mentorAffinity(mentorId)
    return `${a > 0 ? '+' : ''}${a.toFixed(2)} / 1.0`
  }
  function mentorAffinityChip(mentorId: MentorId): string {
    const a = mentorAffinity(mentorId)
    if (a > 0.2) return 'text-jade'
    if (a < -0.2) return 'text-cinnabar'
    return 'text-ink-faint'
  }
  // Phase 31.1 机缘链:机缘取/弃记忆 → 师承推荐
  const hintMentor = computed(() => mentorHint())
</script>
