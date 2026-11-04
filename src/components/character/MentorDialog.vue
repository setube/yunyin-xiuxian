<template>
  <BaseModal :open="open" :title="mentorVer ? `师承 · ${mentorVer.mentor?.name ?? ''}` : '拜师'" @close="emit('close')">
    <div v-if="mentorVer" class="space-y-3">
      <p class="font-kai text-[14px] text-ink">{{ mentorVer.mentor?.master }}</p>
      <p class="text-[12px] leading-relaxed text-ink-soft">
        「{{ mentorVer.line }}」
      </p>
      <!--
        契合度:十格印 + 档名。原先是一个钳位后的实数,四门里三门都满格 ——
        那个数是钳位后的结果,读不出差别(见 src/ui/mentorShare.ts)。
        份额是四门分账,加起来才 1,故这一门几格就是它占你多少。
      -->
      <p class="flex items-center gap-2 text-[11px] text-ink-faint">
        <span>契合</span>
        <span class="mentor-pips shrink-0" :class="TIER_CLASS[verMark.tier]" aria-hidden="true">
          <i v-for="(on, i) in sharePips(verMark.pips)" :key="i" :class="{ 'is-on': on }"></i>
        </span>
        <span class="tabular" :class="TIER_CLASS[verMark.tier]">{{ TIER_LABEL[verMark.tier] }} {{ verMark.pct }}%</span>
      </p>
      <p class="text-[11px] leading-relaxed text-ink-faint">
        师承词条:{{ mentorVer.mentor ? modsText(mentorVer.mentor.mods) : '—' }}
      </p>
    </div>
    <div v-else class="space-y-2.5">
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
        <p class="mt-0.5 flex items-center gap-2 text-[10px]">
          <span class="mentor-pips shrink-0" :class="TIER_CLASS[affinityMark(m!.id).tier]" aria-hidden="true">
            <i v-for="(on, i) in sharePips(affinityMark(m!.id).pips)" :key="i" :class="{ 'is-on': on }"></i>
          </span>
          <span class="tabular" :class="TIER_CLASS[affinityMark(m!.id).tier]">
            当下{{ TIER_LABEL[affinityMark(m!.id).tier] }} {{ affinityMark(m!.id).pct }}%
          </span>
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
  import { mentorVerdict, mentorChoices, mentorTopShare, type MentorVerdict } from '@/core/mentorService'
  import { mentorHint } from '@/core/fortuneChain'
  import { modsText } from '@/data/statNames'
  import type { MentorId } from '@/data/mentors'
  import { shareMark, sharePips, TIER_CLASS, TIER_LABEL } from '@/ui/mentorShare'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 师承弹窗:拜师 / 师尊评价。四种师承理念,拜后不改,转世保留,评价纯叙事反馈。
   * mentorVer 与宿主各算一份(同一个 core 函数)。
   */
  defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const player = usePlayerStore()
  const mentorVer = computed(() => mentorVerdict(player.mentor))
  /** 纯静态数据,setup 只算一次 */
  const mentorChoicesList = mentorChoices()

  /**
   * 拜师前预读契合,与拜后 verdict 同一函数。
   * 四门分账:份额之和为 1,故四张卡上的十格印可以直接横向比。
   * 备选师尊一次算齐进 Map,模板同一人只读一份。
   */
  const verdictMap = computed(() => {
    const map = new Map<MentorId, MentorVerdict>()
    for (const m of mentorChoicesList) {
      const v = mentorVerdict(m.id)
      if (v) map.set(m.id, v)
    }
    return map
  })
  /** 四门最大份额:判未纯的标尺,与 service 内同一条判据 */
  const topShare = computed(() => mentorTopShare())
  /** 门的数量:均分由它算,不手挑门槛 */
  const domains = mentorChoicesList.length

  function affinityMark(mentorId: MentorId) {
    const v = verdictMap.value.get(mentorId)
    return shareMark(v?.share ?? 0, topShare.value, domains)
  }
  const verMark = computed(() => shareMark(mentorVer.value?.share ?? 0, topShare.value, domains))

  // 机缘链:机缘取/弃记忆 → 师承推荐
  const hintMentor = computed(() => mentorHint())
</script>
