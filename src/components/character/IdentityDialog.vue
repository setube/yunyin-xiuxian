<template>
  <!-- 修行画像弹窗(Phase 31.2)—— 自 CharacterView 迁入 -->
  <BaseModal :open="open" :title="`修行画像 · 「${identity?.epithet ?? '云隐散人'}」`" @close="emit('close')">
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
      <p class="text-[10px] leading-relaxed text-ink-faint">画像基于真实选择归纳——你玩成了什么样,它便描述什么。</p>
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">收 卷</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { buildIdentity } from '@/core/identityService'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 修行画像弹窗,自 CharacterView 迁入。
   *
   * identity 在宿主与本组件各算一份:buildIdentity() 是纯 core 调用
   * (宿主入口卡的「云隐散人」副行要读它,弹窗正文也要读),无逻辑漂移面,
   * 不为此穿 prop。
   */
  defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const identity = computed(() => buildIdentity())

  /** 画像弹窗里那四项目录(空值各按原文案显示,拆分不改措辞) */
  const identityRoots = computed(() => {
    const r = identity.value?.roots
    return [
      { label: '师承', value: r?.mentor?.name ?? '未定' },
      { label: '道途', value: r?.daoPath ?? '未立' },
      { label: '流派', value: r?.build ?? '未成' },
      { label: '悟道', value: r?.branches.join('、') || '未定' }
    ]
  })
</script>
