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
        <button class="btn-ghost shrink-0 !px-3" aria-label="随机取一个道号" @click="randomName">
          <GameIcon name="refresh" :size="15" />
        </button>
      </div>
    </div>

    <!-- 灵根 -->
    <div class="card-ink mt-4 px-4 py-3">
      <div class="flex items-center justify-between">
        <p class="font-kai text-[13px] tracking-[0.3em] text-ink-faint">灵 根</p>
        <span class="font-kai text-[15px] tracking-widest text-cinnabar">{{ profile.gradeName }}</span>
      </div>
      <div :key="rollSeq" class="stagger-in mt-4 flex justify-center gap-3">
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
        <span :key="rollSeq" class="tabular text-[14px] text-ink animate-ink-pop">×{{ profile.growthMult.toFixed(2) }}</span>
      </p>
      <!-- 天然牌面(Phase 32.2):重掷时要权衡的不止倍率,还有这一世哪条路走得顺 -->
      <div v-if="tendencies.length" :key="`tend-${rollSeq}`" class="stagger-in mt-3 space-y-1.5 border-t border-ink/10 pt-3">
        <p v-for="t in tendencies" :key="t.element" class="flex gap-2 text-[11px] leading-relaxed text-ink-soft">
          <span class="shrink-0 font-kai" :style="{ color: ELEMENTS[t.element].color }">{{ ELEMENTS[t.element].char }}</span>
          <span>{{ t.text }}</span>
        </p>
      </div>
      <button class="btn-ghost mt-4 w-full" :disabled="starting" @click="reroll">{{ rerollLabel }}</button>
      <p v-if="unlimitedReroll" class="mt-2 text-center text-[11px] text-ink-faint">
        不满意就一直改,改到掷中你认的那副牌为止
      </p>
    </div>

    <div class="grow" />
    <button class="btn-seal mt-8 w-full !py-3 text-[16px]" :disabled="starting" @click="begin">
      {{ starting ? '灵 根 鉴 定 中……' : '踏 入 仙 途' }}
    </button>

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
  /** 不限次建号:按钮不显示余量,也不会有「刷不动了」的一天 */
  const unlimitedReroll = computed(() => rerollsLeft.value === null)
  const rerollLabel = computed(() =>
    rerollsLeft.value === null ? '逆天改命' : `逆天改命(余 ${rerollsLeft.value} 次)`
  )
  /** 重掷序号:额度不再是动画的开关,重放掷牌动画要另有一个只增不减的计数器 */
  const rollSeq = ref(0)
  const revealRef = ref<InstanceType<typeof SpiritRootReveal> | null>(null)
  /** 鉴定动画进行中(约 2.6s):防连点导致重复建号、重复发新手馈赠 */
  const starting = ref(false)

  /** 这一世的天然牌面(倾向文案,不含任何数值) */
  const tendencies = computed(() => tendencyLines(rootElements(profile.value.roots)))

  function reroll(): void {
    // 鉴定动画进行中禁止重掷:begin 已按当时的 profile 建号,
    // 此刻重掷改不了已成真身的灵根,只会让展出的牌和角色对不上
    if (starting.value) return
    if (!game.spendCreateReroll()) return
    game.setCreateProfile(rollLinggen(rng))
    rollSeq.value += 1
  }

  function randomName(): void {
    name.value = randomDaoName(rng)
  }

  function begin(): void {
    if (starting.value) return
    starting.value = true
    const finalName = name.value.trim().slice(0, 8) || '无名散修'
    player.initCharacter(finalName, profile.value)
    // 开局馈赠:入门功法 + 一柄竹剑 + 三枚聚气散
    cultivation.learn('m_taixuan')
    cultivation.equipMain('m_taixuan')
    const starter = generateEquipment(1, rng, { slot: 'weapon' })
    acquireEquipment(starter, { quiet: true, forceKeep: true }) // forceKeep:开局馈赠不受自动回收规则影响
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
