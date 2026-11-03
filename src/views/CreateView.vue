<template>
  <div class="stagger-in flex min-h-full flex-col px-6 py-8">
    <!-- 未定格前可回欢迎页(路由守卫允许 create→welcome) -->
    <div class="flex items-center">
      <RouterLink
        to="/welcome"
        class="-my-1.5 py-1.5 text-[12px] text-ink-faint active:text-ink-soft"
        >← 欢迎</RouterLink
      >
    </div>

    <div class="mt-6 text-center">
      <h1 class="font-kai text-[42px] leading-tight tracking-[0.35em] text-ink">云隐修仙录</h1>
      <p class="mt-2 text-[12px] tracking-[0.5em] text-ink-faint">一念修行 · 云深不知处</p>
    </div>

    <div class="card-ink mt-8 px-4 py-3">
      <p class="mb-2 font-kai text-[13px] tracking-[0.3em] text-ink-faint">道 号</p>
      <div class="flex items-center gap-2">
        <!--
          不写 maxlength:它按 UTF-16 码元计数,emoji 占两个 —— 玩家粘「一二三四五六七」加一个星月符号
          会在输入阶段就被切成孤立代理项,后面再怎么按码点截也救不回来。
          改由 @input 按码点钳制,与提交时的 truncateCodePoints 同一把尺。
        -->
        <input
          :value="name"
          class="w-full rounded-md border border-ink/20 bg-paper-deep/60 px-3 py-2 font-kai text-[15px] tracking-widest text-ink outline-none focus:border-cinnabar/50"
          placeholder="道号"
          @input="onNameInput"
        />
        <button class="btn-ghost shrink-0 !px-3" aria-label="随机道号" @click="randomName">
          <GameIcon name="refresh" :size="15" />
        </button>
      </div>
    </div>

    <div class="card-ink mt-4 px-4 py-3">
      <div class="flex items-center justify-between">
        <p class="font-kai text-[13px] tracking-[0.3em] text-ink-faint">灵 根</p>
        <span class="font-kai text-[15px] tracking-widest text-cinnabar">{{ profile.gradeName }}</span>
      </div>
      <!-- flex-wrap:五根灵根在 320 宽下并排放不下 -->
      <div :key="rollSeq" class="stagger-in mt-4 flex flex-wrap justify-center gap-3">
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
      <div v-if="tendencies.length" :key="`tend-${rollSeq}`" class="stagger-in mt-3 space-y-1.5 border-t border-ink/10 pt-3">
        <p v-for="t in tendencies" :key="t.element" class="flex gap-2 text-[11px] leading-relaxed text-ink-soft">
          <span class="shrink-0 font-kai" :style="{ color: ELEMENTS[t.element].color }">{{ ELEMENTS[t.element].char }}</span>
          <span>{{ t.text }}</span>
        </p>
      </div>
      <button class="btn-ghost mt-4 w-full" :disabled="starting || (rerollsLeft !== null && rerollsLeft <= 0)" @click="reroll">{{ rerollLabel }}</button>
      <p v-if="unlimitedReroll" class="mt-2 text-center text-[11px] text-ink-faint">不限次数</p>
    </div>

    <div class="grow" />
    <button class="btn-seal mt-8 w-full !py-3 text-[16px]" :disabled="starting" @click="begin">
      {{ starting ? '灵 根 鉴 定 中……' : '踏 入 仙 途' }}
    </button>

    <SpiritRootReveal ref="revealRef" />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { rng } from '@/utils/random'
  import { truncateCodePoints } from '@/utils/saveShape'
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

  const name = ref(game.createName || randomDaoName(rng))
  // 道号草稿同灵根草稿一样持久化,刷新不丢;首次进来把随机道号也落一份
  if (!game.createName) game.setCreateName(name.value)
  watch(name, n => game.setCreateName(n))
  // 灵根草稿持久化:刷新不白拿一次重掷,也不洗掉已花掉的次数
  if (!game.createProfile) game.setCreateProfile(rollLinggen(rng))
  const profile = computed(() => game.createProfile!)
  const rerollsLeft = computed(() => game.createRerolls)
  /** 不限次建号:按钮不显示余量 */
  const unlimitedReroll = computed(() => rerollsLeft.value === null)
  const rerollLabel = computed(() =>
    rerollsLeft.value === null ? '逆天改命' : `逆天改命(余 ${rerollsLeft.value} 次)`
  )
  /** 重掷序号:只增不减,驱动掷牌动画重放 */
  const rollSeq = ref(0)
  const revealRef = ref<InstanceType<typeof SpiritRootReveal> | null>(null)
  /** 鉴定动画进行中(约 2.6s):防连点重复建号、重复发新手馈赠 */
  const starting = ref(false)

  /** 这一世的天然牌面(倾向文案,不含任何数值) */
  const tendencies = computed(() => tendencyLines(rootElements(profile.value.roots)))

  function reroll(): void {
    // 鉴定动画进行中禁止重掷:begin 已按当时的 profile 建号
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
    /**
     * 整段包在 try 里:成功路径靠 router.push 离开本页,但中途任一步抛错时,
     * starting 会永远留在 true —— 按钮此后恒显示「灵根鉴定中……」且永久禁用,
     * 玩家只能刷新页面才能重来(而刷新会把已生成的角色丢掉)。故失败时复位并提示,让它还能再点一次。
     */
    try {
      doBegin()
    } catch (err) {
      starting.value = false
      console.error('[create] 建号失败', err)
      ui.toast('建号失败', 'info')
    }
  }

  function onNameInput(e: Event): void {
    name.value = truncateCodePoints((e.target as HTMLInputElement).value, 8)
  }

  function doBegin(): void {
    // 按码点截,不按码元:emoji 占两个码元,slice(0,8) 会把末尾那个符号切成半个字
    const finalName = truncateCodePoints(name.value.trim(), 8) || '无名散修'
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
    ui.toast('已入仙途', 'rare')
    revealRef.value?.show(profile.value.gradeName, () => {
      void router.push('/')
    })
  }
</script>
