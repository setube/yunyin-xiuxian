<template>
  <!-- 凡境册元婴起(灵石),天界册真仙起(道源) -->
  <section v-if="unlocked" class="card-ink px-4 py-3">
    <!-- 换行放宽:200% 缩放下「秘境」+ 门类芯片 + 层数挤不进一行,不换行会顶出右缘 -->
    <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="font-kai text-[14px] tracking-[0.2em] text-ink">秘境</span>
      <span class="chip-ink !text-[9px]">{{ gate === 'celestial' ? '天界秘境' : '凡境秘境' }} · {{ cnNumber(SECRET_LAYERS) }}层 · 出则散</span>
      <span v-if="state" class="ml-auto flex items-center gap-1.5 text-[10px] tabular text-gold-ink">
        <!--
          层数刻度:要不要再入一层,取决于「还差几层见底」(见 ui/realmProgress)。
          格数随 SECRET_LAYERS 变,不是写死的三格。
        -->
        <span
          class="realm-layer-pips"
          :class="{ 'realm-layer-pips--deepest': progress.deepest }"
          role="img"
          :aria-label="`第 ${progress.layer}/${progress.layers} 层`"
        >
          <i v-for="(on, i) in realmLayerPips(progress)" :key="i" :class="{ on }" />
        </span>
        第 {{ progress.layer }}/{{ progress.layers }} 层
      </span>
    </p>

    <!-- 在境中 -->
    <template v-if="state">
      <p class="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
        {{ def?.name }} · {{ def?.desc }}
      </p>
      <p class="mt-1 text-[10px] leading-relaxed text-violet-ink">此地规则:{{ secretRuleTexts(state).join(' · ') }}</p>
      <!-- 败场刻度:这是**剩余**而不是已得 —— 实心越少越危险,故与层数反过来 -->
      <p v-if="state.losses > 0" class="mt-0.5 flex items-center gap-1.5 text-[10px] leading-relaxed tabular text-cinnabar">
        <span
          class="realm-life-pips"
          :class="{ 'realm-life-pips--none': progress.livesLeft === 0 }"
          role="img"
          :aria-label="`还能败 ${progress.livesLeft} 场`"
        >
          <i v-for="(on, i) in realmLifePips(progress)" :key="i" :class="{ on }" />
        </span>
        已败 {{ state.losses }}/{{ SECRET_MAX_LOSSES }} 场 · 再败 {{ progress.livesLeft }} 场逐出
      </p>
      <p v-if="state.spoils.length" class="mt-1 max-h-24 overflow-y-auto text-[10px] leading-relaxed text-ink-faint">
        <span v-for="(s, i) in state.spoils" :key="i" class="block">· {{ s }}</span>
      </p>
      <div class="mt-2 flex gap-2">
        <button class="btn-seal flex-1 !py-1.5 !text-[12px]" @click="fight">再 入 一 层</button>
        <button class="btn-ghost flex-1 !py-1.5 !text-[12px]" @click="abandonRealm()">出 秘 境</button>
      </div>
    </template>

    <!-- 未入 -->
    <template v-else>
      <p v-if="elsewhere" class="mt-1 text-[10px] leading-relaxed text-ink-faint">
        身在「{{ elsewhere.name }}」
      </p>
      <div v-else class="mt-2 space-y-1.5">
        <button
          v-for="r in list"
          :key="r.id"
          class="w-full rounded-md bg-paper-deep/60 px-3 py-2 text-left active:scale-98 disabled:cursor-not-allowed"
          :class="{ 'opacity-60': !canPay(r), 'realm-top-gain': isTopGain(realmMark(r)) }"
          :disabled="!canPay(r)"
          :aria-label="realmMark(r).label"
          @click="enter(r.id)"
        >
          <span class="flex items-baseline gap-2">
            <span class="font-kai text-[13px] text-ink">{{ r.name }}</span>
            <span class="text-[10px] tabular" :class="canPay(r) ? 'text-ink-faint' : 'text-cinnabar'">
              {{ entryCostText(r, player.major) }}
            </span>
            <span class="ml-auto text-[10px] text-azure">入 境 →</span>
          </span>
          <span v-if="entryBlockText(r)" class="mt-0.5 block text-[10px] tabular text-cinnabar">
            {{ entryBlockText(r) }}
          </span>
          <!-- 险利双轴:上一轴有多伤、下一轴值不值。两轴共用五处秘境的最小与最大,可横向比 -->
          <span class="mt-1 flex items-center gap-1.5">
            <span class="w-5 shrink-0 text-[9px] leading-none text-jade">回血</span>
            <span class="realm-axes min-w-0 flex-1" aria-hidden="true">
              <span class="realm-axis realm-axis--heal" :style="{ '--axis-pos': `${realmMark(r).heal * 100}%` }" />
              <span class="realm-axis realm-axis--gain" :style="{ '--axis-pos': `${realmMark(r).gain * 100}%` }" />
            </span>
            <span class="w-5 shrink-0 text-right text-[9px] leading-none text-gold-ink">战利</span>
          </span>
          <span class="mt-0.5 block text-[10px] leading-relaxed text-ink-faint">{{ r.desc }}</span>
        </button>
        <p v-if="list.length === 0" class="empty-note text-center text-[11px] text-ink-faint">
          暂无秘境
        </p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useEndgameStore } from '@/stores/endgame'
  import { useUiStore } from '@/stores/ui'
  import { secretRealmDef, type SecretRealmDef } from '@/data/secretRealms'
  import { isTopGain, realmMark } from '@/ui/realmMark'
  import { realmLayerPips, realmLifePips, realmProgress, SECRET_MAX_LOSSES } from '@/ui/realmProgress'
  import { cnNumber } from '@/utils/format'
  import {
    SECRET_LAYERS,
    abandonRealm,
    availableRealms,
    currentRealm,
    enterSecretRealm,
    entryCostText,
    entryShortfallOf,
    fightSecretLayer,
    realmUnlock,
    secretRuleTexts
  } from '@/core/secretRealm'
  import { endgameBusy } from '@/core/endgameActivity'
  import { useAdventureStore } from '@/stores/adventure'

  const player = usePlayerStore()
  const endgame = useEndgameStore()
  const ui = useUiStore()

  const props = withDefaults(defineProps<{ gate?: 'mortal' | 'celestial' }>(), { gate: 'mortal' })

  const unlocked = computed(() => realmUnlock(props.gate))
  /** 在境中(仅认本册):`currentRealm` 全局单份不分册,须按 gate 过滤,与 `availableRealms` 同口径 */
  /** 秘境进度形制:层数与剩余败场(见 ui/realmProgress) */
  const progress = computed(() => realmProgress(state.value?.layer ?? 0, state.value?.losses ?? 0))

  const state = computed(() => {
    const s = currentRealm()
    if (!s) return null
    return secretRealmDef(s.realmId)?.gate === props.gate ? s : null
  })
  /** 身在另一册的境中:本册卡不摆入口,只报所在 */
  const elsewhere = computed(() => {
    const s = currentRealm()
    if (!s) return null
    const d = secretRealmDef(s.realmId)
    return d && d.gate !== props.gate ? d : null
  })
  const list = computed(() => availableRealms(props.gate))
  const def = computed<SecretRealmDef | undefined>(() => (state.value ? secretRealmDef(state.value.realmId) : undefined))
  const busy = computed(() => endgameBusy(endgame.worldRun, player.secretRealm, useAdventureStore().session))

  function canPay(r: SecretRealmDef): boolean {
    return !busy.value && entryShortfallOf(r, player.major) === null
  }

  function entryShort(r: SecretRealmDef): ReturnType<typeof entryShortfallOf> {
    return entryShortfallOf(r, player.major)
  }

  function entryBlockText(r: SecretRealmDef): string | null {
    if (busy.value) return busy.value.reason
    return entryShort(r)?.reason ?? null
  }

  function enter(id: string): void {
    const out = enterSecretRealm(id)
    if (!out.ok) {
      ui.toast(out.reason ?? '无法进入', 'warn')
      return
    }
    ui.toast('已入秘境', 'info')
  }

  function fight(): void {
    const r = fightSecretLayer()
    if (!r) return
    // 合并为单条多行 toast:逐条 push 会被 toast 上限 5 挤掉前面的行
    // 胜归 success(与全库「有得有获」同级),败归 warn
    if (r.lines.length) ui.toast(r.lines.join('\n'), r.win ? 'success' : 'warn')
  }
</script>
