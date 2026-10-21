<template>
  <!-- 偏好:音频 / 动效 / 遇事勿扰 / 主题 / 战报速度 -->
  <div class="card-ink divide-y divide-ink/6 px-4">
    <div class="py-3">
      <label class="flex items-center justify-between">
        <span class="text-[13px] text-ink-soft">背景音乐</span>
        <input v-model="settings.musicOn" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <div v-if="settings.musicOn" class="mt-2 flex items-center gap-2">
        <span class="text-[10px] text-ink-faint">轻</span>
        <input
          v-model.number="settings.musicVol"
          type="range"
          min="0"
          max="100"
          aria-label="背景音乐音量"
          class="grow min-w-0 accent-cinnabar"
        />
        <span class="w-7 text-right text-[10px] tabular text-ink-faint">{{ settings.musicVol }}</span>
      </div>
    </div>
    <div class="py-3">
      <label class="flex items-center justify-between">
        <span class="text-[13px] text-ink-soft">音效</span>
        <input v-model="settings.sfxOn" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <div v-if="settings.sfxOn" class="mt-2 flex items-center gap-2">
        <span class="text-[10px] text-ink-faint">轻</span>
        <input
          v-model.number="settings.sfxVol"
          type="range"
          min="0"
          max="100"
          aria-label="音效音量"
          class="grow min-w-0 accent-cinnabar"
        />
        <span class="w-7 text-right text-[10px] tabular text-ink-faint">{{ settings.sfxVol }}</span>
      </div>
    </div>
    <label class="flex items-center justify-between py-3">
      <span class="text-[13px] text-ink-soft">减少动效</span>
      <input v-model="settings.reduceMotion" type="checkbox" class="h-4 w-4 accent-cinnabar" />
    </label>
    <div class="py-3">
      <label class="flex items-center justify-between">
        <span class="text-[13px] text-ink-soft">遇事勿扰</span>
        <input v-model="settings.dndEvents" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">
        历练撞见际遇/机缘/奇缘不再弹窗,自动按默认好愿了结 —— 奖励照拿,只是不再卡手。
      </p>
    </div>
    <div class="flex items-center justify-between py-3">
      <span class="text-[13px] text-ink-soft">夜间模式</span>
      <div role="group" aria-label="夜间模式" class="flex gap-1">
        <button
          v-for="o in THEME_OPTIONS"
          :key="o.id"
          :aria-pressed="settings.theme === o.id"
          class="chip-ink !py-1.5"
          :class="settings.theme === o.id ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
          @click="settings.theme = o.id"
        >
          {{ o.label }}
        </button>
      </div>
    </div>
    <div class="flex items-center justify-between py-3">
      <span class="text-[13px] text-ink-soft">战报速度</span>
      <div role="group" aria-label="战报速度" class="flex gap-1">
        <button
          v-for="s in BATTLE_SPEEDS"
          :key="s"
          :aria-pressed="settings.battleSpeed === s"
          class="chip-ink !py-1.5"
          :class="settings.battleSpeed === s ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
          @click="settings.battleSpeed = s"
        >
          ×{{ s }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useSettingsStore } from '@/stores/settings'

  const settings = useSettingsStore()

  const THEME_OPTIONS = [
    { id: 'auto', label: '跟随系统' },
    { id: 'light', label: '日间' },
    { id: 'dark', label: '夜间' }
  ] as const
  const BATTLE_SPEEDS = [1, 2, 4] as const
</script>
