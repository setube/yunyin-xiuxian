<template>
  <!-- 秘境:一次性内容,出则散。凡境册元婴起(灵石),天界册真仙起(道源) -->
  <section v-if="unlocked" class="card-ink px-4 py-3">
    <p class="flex items-center gap-2">
      <span class="font-kai text-[14px] tracking-[0.2em] text-ink">秘境</span>
      <span class="chip-ink !text-[9px]">{{ gate === 'celestial' ? '天界秘境' : '凡境秘境' }} · {{ cnNumber(SECRET_LAYERS) }}层 · 出则散</span>
      <span v-if="state" class="ml-auto text-[10px] tabular text-gold-ink">第 {{ state.layer }}/{{ SECRET_LAYERS }} 层</span>
    </p>

    <!-- 在境中 -->
    <template v-if="state">
      <p class="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
        {{ def?.name }} · {{ def?.desc }}
      </p>
      <p class="mt-1 text-[10px] leading-relaxed text-violet-ink">此地规则:{{ state.rules.join(' · ') }}</p>
      <p v-if="state.spoils.length" class="mt-1 max-h-24 overflow-y-auto text-[10px] leading-relaxed text-ink-faint">
        <span v-for="(s, i) in state.spoils" :key="i" class="block">· {{ s }}</span>
      </p>
      <div class="mt-2 flex gap-2">
        <button class="btn-seal flex-1 !py-1.5 !text-[12px]" @click="fight">再 入 一 层</button>
        <button class="btn-ghost flex-1 !py-1.5 !text-[12px]" @click="abandonRealm()">出 秘 境</button>
      </div>
    </template>

    <!-- 未入:择一处 -->
    <template v-else>
      <div class="mt-2 space-y-1.5">
        <button
          v-for="r in list"
          :key="r.id"
          class="w-full rounded-md bg-paper-deep/60 px-3 py-2 text-left active:scale-98"
          :class="{ 'opacity-60': !canPay(r) }"
          @click="enter(r.id)"
        >
          <span class="flex items-baseline gap-2">
            <span class="font-kai text-[13px] text-ink">{{ r.name }}</span>
            <span class="text-[10px] tabular" :class="canPay(r) ? 'text-ink-faint' : 'text-cinnabar/80'">
              {{ entryCostText(r, player.major) }}
            </span>
            <span class="ml-auto text-[10px] text-azure">入 境 →</span>
          </span>
          <span class="mt-0.5 block text-[10px] leading-relaxed text-ink-faint">{{ r.desc }}</span>
        </button>
        <p v-if="list.length === 0" class="text-[11px] text-ink-faint">尚无秘境可探 —— 境界再高些,自有去处。</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { useUiStore } from '@/stores/ui'
  import { useEndgameStore } from '@/stores/endgame'
  import { secretRealmDef, type SecretRealmDef } from '@/data/secretRealms'
  import { cnNumber } from '@/utils/format'
  import {
    SECRET_LAYERS,
    abandonRealm,
    availableRealms,
    currentRealm,
    enterSecretRealm,
    entryCostOf,
    entryCostText,
    fightSecretLayer,
    realmUnlock
  } from '@/core/secretRealm'

  const player = usePlayerStore()
  const resources = useResourcesStore()
  const ui = useUiStore()

  const props = withDefaults(defineProps<{ gate?: 'mortal' | 'celestial' }>(), { gate: 'mortal' })
  const endgame = useEndgameStore()

  const unlocked = computed(() => realmUnlock(props.gate))
  const state = computed(() => currentRealm())
  const list = computed(() => availableRealms(props.gate))
  const def = computed<SecretRealmDef | undefined>(() => (state.value ? secretRealmDef(state.value.realmId) : undefined))

  function canPay(r: SecretRealmDef): boolean {
    const c = entryCostOf(r, player.major)
    return c.kind === 'stone' ? resources.hasStone(c.stone) : endgame.daoSource >= c.daoSource
  }

  function enter(id: string): void {
    const out = enterSecretRealm(id)
    if (!out.ok) {
      ui.toast(out.reason ?? '不得其门而入', 'warn')
      return
    }
    ui.toast('你踏入秘境,身后的路随即合拢', 'info')
  }

  function fight(): void {
    const r = fightSecretLayer()
    if (!r) return
    // 战报合并为单条多行 toast:逐条 push 会被 toast 位(上限 5)把自己前面的行挤掉,长战报读不全
    if (r.lines.length) ui.toast(r.lines.join('\n'), r.win ? 'info' : 'warn')
  }
</script>
