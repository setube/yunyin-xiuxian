<template>
  <div class="stagger-in flex min-h-full flex-col px-6 py-8">
    <!-- 题字 -->
    <div class="mt-6 text-center">
      <h1 class="font-kai text-[42px] leading-tight tracking-[0.35em] text-ink">云隐修仙录</h1>
      <p class="mt-2 text-[12px] tracking-[0.5em] text-ink-faint">一念修行 · 云深不知处</p>
    </div>

    <!-- 道号 -->
    <div class="card-ink mt-8 px-4 py-3">
      <p class="mb-2 font-kai text-[13px] tracking-[0.3em] text-ink-faint">道 号</p>
      <div class="flex items-center gap-2">
        <input
          v-model="name"
          maxlength="8"
          class="w-full rounded-md border border-ink/20 bg-paper-deep/60 px-3 py-2 font-kai text-[15px] tracking-widest text-ink outline-none focus:border-cinnabar/50"
          placeholder="取一个道号"
        />
        <button class="btn-ghost shrink-0 px-3!" @click="randomName">
          <GameIcon name="refresh" :size="15" />
        </button>
      </div>
    </div>

    <!-- 灵根 -->
    <div class="card-ink mt-4 px-4 py-4">
      <div class="flex items-center justify-between">
        <p class="font-kai text-[13px] tracking-[0.3em] text-ink-faint">灵 根</p>
        <span class="font-kai text-[15px] tracking-widest text-cinnabar">{{ profile.gradeName }}</span>
      </div>
      <div :key="rerollsLeft" class="stagger-in mt-4 flex justify-center gap-3">
        <div v-for="root in profile.roots" :key="root.element" class="flex flex-col items-center gap-1.5">
          <span
            class="grid h-12 w-12 place-items-center rounded-full border-2 font-kai text-lg animate-breathe"
            :style="{ borderColor: ELEMENTS[root.element].color, color: ELEMENTS[root.element].color }"
          >
            {{ ELEMENTS[root.element].char }}
          </span>
          <span class="tabular text-[11px] text-ink-soft">资质 {{ root.aptitude }}</span>
        </div>
      </div>
      <p class="mt-4 text-center text-[12px] text-ink-faint">
        修行倍率
        <span :key="rerollsLeft" class="tabular text-[14px] text-ink animate-ink-pop">×{{ profile.growthMult.toFixed(2) }}</span>
      </p>
      <!-- 天然牌面(Phase 32.2):重掷时要权衡的不止倍率,还有这一世哪条路走得顺 -->
      <div v-if="tendencies.length" :key="`tend-${rerollsLeft}`" class="stagger-in mt-3 space-y-1.5 border-t border-ink/10 pt-3">
        <p v-for="t in tendencies" :key="t.element" class="flex gap-2 text-[11px] leading-relaxed text-ink-soft">
          <span class="shrink-0 font-kai" :style="{ color: ELEMENTS[t.element].color }">{{ ELEMENTS[t.element].char }}</span>
          <span>{{ t.text }}</span>
        </p>
      </div>
      <button class="btn-ghost mt-4 w-full" :disabled="rerollsLeft <= 0" @click="reroll">逆天改命(余 {{ rerollsLeft }} 次)</button>
    </div>

    <div class="grow" />
    <button class="btn-seal mt-8 w-full py-3! text-[16px]" @click="begin">踏 入 仙 途</button>

    <!-- 灵根鉴定动画(踏入仙途后播放) -->
    <SpiritRootReveal ref="revealRef" />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { rng } from '@/utils/random'
  import { rollLinggen } from '@/core/linggenGen'
  import { rootElements, tendencyLines } from '@/core/linggenAffinity'
  import { randomDaoName } from '@/data/names'
  import { ELEMENTS } from '@/data/linggen'
  import { generateEquipment } from '@/core/equipGen'
  import { acquireEquipment } from '@/core/loot'
  import { trackRealm } from '@/core/progress'
  import { seedLoreIfNeeded } from '@/core/loreService'
  import { equipmentTemplate } from '@/data/equipment'
  import { useGameStore } from '@/stores/game'
  import { usePlayerStore } from '@/stores/player'
  import { useCultivationStore } from '@/stores/cultivation'
  import { useInventoryStore } from '@/stores/inventory'
  import { useUiStore } from '@/stores/ui'
  import GameIcon from '@/components/common/GameIcon.vue'
  import SpiritRootReveal from '@/components/common/SpiritRootReveal.vue'

  const router = useRouter()
  const game = useGameStore()
  const player = usePlayerStore()
  const cultivation = useCultivationStore()
  const inventory = useInventoryStore()
  const ui = useUiStore()

  const name = ref(randomDaoName(rng))
  // 建号草稿放在 game store 里持久化:刷新页面既不该白拿一次重掷,也不该洗掉已花掉的次数
  if (!game.createProfile) game.setCreateProfile(rollLinggen(rng))
  const profile = computed(() => game.createProfile!)
  const rerollsLeft = computed(() => game.createRerolls)
  const revealRef = ref<InstanceType<typeof SpiritRootReveal> | null>(null)

  /** 这一世的天然牌面(倾向文案,不含任何数值) */
  const tendencies = computed(() => tendencyLines(rootElements(profile.value.roots)))

  function reroll(): void {
    if (!game.spendCreateReroll()) return
    game.setCreateProfile(rollLinggen(rng))
  }

  function randomName(): void {
    name.value = randomDaoName(rng)
  }

  function begin(): void {
    const finalName = name.value.trim().slice(0, 8) || '无名散修'
    player.initCharacter(finalName, profile.value)
    // 开局馈赠:入门功法 + 一柄竹剑 + 三枚聚气散
    cultivation.learn('m_taixuan')
    cultivation.equipMain('m_taixuan')
    const starter = generateEquipment(1, rng, { slot: 'weapon' })
    acquireEquipment(starter, true)
    const tpl = equipmentTemplate(starter.templateId)
    if (tpl) inventory.equip(starter.uid, tpl.slot)
    inventory.addPill('p_jvqisan', 3)
    // 开局所知:三张入门丹方与方中药材(见 core/loreService.ts)
    seedLoreIfNeeded()
    game.markStarted()
    trackRealm()
    ui.toast('云深不知处,仙路自此始', 'rare')
    // 灵根鉴定动画:随机闪现所有灵根品阶,最后定格真实灵根(gradeName)
    revealRef.value?.show(profile.value.gradeName, () => {
      void router.push('/')
    })
  }
</script>
