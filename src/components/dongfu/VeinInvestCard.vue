<template>
  <div class="card-ink px-4 py-3.5">
    <!-- 头:主旨 + 容量总览。主/副上限一次性交代,免得人翻到下面才懂 70/30 何来 -->
    <p class="flex items-center justify-between">
      <span class="font-kai text-[14px] tracking-[0.25em] text-ink">灵脉投资</span>
      <span class="tabular text-[11px] text-ink-faint">{{ veinTotal }}/{{ VEIN_TOTAL_CAPACITY }}</span>
    </p>
    <p class="mt-0.5 text-[10px] leading-relaxed text-ink-soft">
      炼化灵石,洞府灵脉日益壮大。主脉至多
      <span class="text-cinnabar">{{ VEIN_MAIN_CAPACITY }} 点</span>,副脉各
      <span class="text-cinnabar">{{ VEIN_SIDE_CAP }} 点</span>;总容量有限,方向即取舍。
    </p>

    <div class="mt-3 space-y-2">
      <div
        v-for="v in VEINS"
        :key="v.id"
        class="rounded-lg border px-2.5 py-2.5"
        :class="isMain(v.id) ? TONES[v.id].row : 'border-ink/8 bg-paper-deep/40'"
      >
        <div class="flex items-start gap-2.5">
          <!-- 脉章:方印托一字,与建筑卡同一套印章语言;字色随脉系 -->
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md font-kai text-[15px] leading-none" :class="TONES[v.id].seal">
            <span class="translate-y-[1px]">{{ v.seal }}</span>
          </span>
          <div class="min-w-0 grow">
            <p class="flex flex-wrap items-center gap-1.5">
              <span class="truncate font-kai text-[13px] text-ink">{{ v.name }}</span>
              <span v-if="isMain(v.id)" class="shrink-0 rounded bg-cinnabar/15 px-1 py-0.5 text-[10px] leading-none text-cinnabar">主脉</span>
              <span v-else-if="dongfu.veinMain === null" class="shrink-0 text-[10px] text-ink-ghost">首投成主</span>
            </p>
            <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ v.desc }}</p>
            <!-- 每条脉都要自陈作用:此前只显示名字与价格,玩家无从判断该投哪条 -->
            <p class="mt-0.5 text-[10px] leading-relaxed text-azure">
              {{ currentLevel(v.id) > 0 ? veinEffectText(v, currentLevel(v.id)) : `每点 ${veinEffectText(v, 1)}` }}
            </p>
            <!-- 原主脉迁出后超额部分保留(效果不失,不可再投) -->
            <p v-if="surplusPoints(v.id) > 0" class="mt-0.5 text-[10px] leading-relaxed text-gold-ink">
              原主脉的 {{ surplusPoints(v.id) }} 点超额保留,效果不减,唯不再可投
            </p>
          </div>
          <!-- 投点单列:主动权放右边,说明体不再整行抢点击 -->
          <div class="flex shrink-0 flex-col items-end gap-1 self-start">
            <button class="btn-ghost whitespace-nowrap !px-2.5 !py-1.5 !text-[11px]" :disabled="!canInvest(v.id)" @click="doInvest(v.id)">
              <template v-if="canInvest(v.id)">投一点 · {{ formatGN(investCost) }} 石</template>
              <template v-else>{{ investedStateLabel(v.id) }}</template>
            </button>
            <button v-if="canSwitchTo(v.id)" class="px-0.5 text-[10px] text-cinnabar/80 active:opacity-60" @click="doSwitch(v.id)">
              改立主脉 · {{ formatGN(switchCost) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p class="mt-3 border-t border-ink/6 pt-2.5 text-[10px] text-azure">
      当前加成:
      <span v-if="!bonusLine" class="ml-1 text-ink-faint">尚无</span>
      <span v-else class="ml-1">{{ bonusLine }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { VEINS, INSIGHT_EFFECT_NAME, type VeinId } from '@/data/veins'
  import { veinEffectText } from '@/ui/veinText'
  import { investVein, veinPointCost, veinSwitchCost, switchMainVein } from '@/core/veinService'
  import { VEIN_MAIN_CAPACITY, VEIN_SIDE_CAP, VEIN_TOTAL_CAPACITY, VEIN_UNLOCK_MAJOR } from '@/data/constants'
  import { modsText } from '@/ui/statNames'
  import { formatGN, formatPercent } from '@/utils/format'

  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  /**
   * 四脉各配一色系。字面量类串,不许拼 —— Tailwind 的 JIT 只认源码里写全的类;
   * 章、行描边、进度条、列账圆点全部从这里取,同一脉只一个色相,全书不乱。
   * dot/bar 由进度条与列账用,seal/row 行内即刻生效。
   */
  const TONES: Record<VeinId, { seal: string; row: string; dot: string; bar: string }> = {
    gather: { seal: 'bg-jade/12 text-jade', row: 'border-jade/35 bg-jade/5', dot: 'bg-jade', bar: 'bg-jade' },
    craft: { seal: 'bg-cinnabar/12 text-cinnabar', row: 'border-cinnabar/35 bg-cinnabar/6', dot: 'bg-cinnabar', bar: 'bg-cinnabar' },
    alchemy: { seal: 'bg-gold-ink/12 text-gold-ink', row: 'border-gold-ink/35 bg-gold-ink/6', dot: 'bg-gold-ink', bar: 'bg-gold-ink' },
    insight: { seal: 'bg-violet-ink/14 text-violet-ink', row: 'border-violet-ink/40 bg-violet-ink/7', dot: 'bg-violet-ink', bar: 'bg-violet-ink' }
  }

  const investCost = computed(() => veinPointCost())
  const switchCost = computed(() => veinSwitchCost())
  const veinsUnlocked = computed(() => player.major >= VEIN_UNLOCK_MAJOR)
  const veinTotal = computed(() => dongfu.veinTotal)
  /**
   * 当前加成 —— 必须把不走 StatMods 的那一条也算进来。
   *
   * 寒冥灵脉的 perPoint 是空对象:它的效果是「功法参悟省悟道点」,
   * 走 dongfu.insightDiscount,不进 veinMods。此前这里只读 veinMods,
   * 于是投了满脉也一个字都不显示 —— 玩家因此不知道它有没有用
   */
  const bonusLine = computed(() => {
    const parts: string[] = []
    const mods = modsText(dongfu.veinMods)
    if (mods) parts.push(mods)
    if (dongfu.insightDiscount > 0) {
      parts.push(`${INSIGHT_EFFECT_NAME} −${formatPercent(Math.min(0.5, dongfu.insightDiscount))}`)
    }
    return parts.join(' · ')
  })

  function isMain(veinId: VeinId): boolean {
    return dongfu.veinMain === veinId
  }

  /** 该脉实际可投上限:主脉 70,副脉 30 */
  function cap(veinId: VeinId): number {
    return isMain(veinId) ? VEIN_MAIN_CAPACITY : VEIN_SIDE_CAP
  }

  function currentLevel(veinId: VeinId): number {
    return dongfu.veinPoints[veinId] ?? 0
  }

  /** 原主脉迁出后超出副脉上限的部分 */
  function surplusPoints(veinId: VeinId): number {
    if (isMain(veinId)) return 0
    return Math.max(0, currentLevel(veinId) - VEIN_SIDE_CAP)
  }

  function canInvest(veinId: VeinId): boolean {
    if (!veinsUnlocked.value) return false
    if (currentLevel(veinId) >= cap(veinId)) return false
    return veinTotal.value < VEIN_TOTAL_CAPACITY
  }

  /** 投点钮在不可投时的说辞:满却 / 总容量尽,各说各的 */
  function investedStateLabel(veinId: VeinId): string {
    if (currentLevel(veinId) >= cap(veinId)) return isMain(veinId) ? '主脉圆满' : '副脉至限'
    if (veinTotal.value >= VEIN_TOTAL_CAPACITY) return '容量已尽'
    if (!veinsUnlocked.value) return '未开'
    return '不可投'
  }

  function canSwitchTo(veinId: VeinId): boolean {
    if (!veinsUnlocked.value || isMain(veinId)) return false
    // 尚无主脉时首投即成主脉,不必单独给"立主脉"入口
    return dongfu.veinMain !== null
  }

  function doInvest(veinId: VeinId): void {
    investVein(veinId)
  }

  function doSwitch(veinId: VeinId): void {
    switchMainVein(veinId)
  }
</script>
