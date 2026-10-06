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
    <!-- 总容量分度:金色条一眼看用了几成,取舍这个词落到画面上 -->
    <div class="mt-2 flex h-1.5 w-full items-center overflow-hidden rounded-full bg-ink/6">
      <div class="h-full rounded-full bg-gold-ink/70 transition-all" :style="{ width: totalPct + '%' }"></div>
    </div>
    <!-- 一点未投时的开门话:主脉不是凭空选的,首投那一下就是答案 -->
    <p v-if="veinTotal === 0" class="mt-1 text-[9px] text-ink-faint">尚未注力 —— 首投自成主脉,择一而始</p>

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
              <span v-else-if="dongfu.veinMain === null" class="shrink-0 text-[10px] text-ink-faint">首投成主</span>
            </p>
            <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ v.desc }}</p>
            <!-- 每条脉都要自陈作用:此前只显示名字与价格,玩家无从判断该投哪条 -->
            <p class="mt-0.5 text-[10px] leading-relaxed text-azure">
              {{ currentLevel(v.id) > 0 ? veinEffectText(v, currentLevel(v.id)) : `每点 ${veinEffectText(v, 1)}` }}
            </p>
            <!-- 单脉进度:已投/该脉上限,着脉色;超额时条列满、数字转金 -->
            <div class="mt-1.5 flex items-center gap-2">
              <div class="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/6">
                <div class="h-full rounded-full transition-all" :class="TONES[v.id].bar" :style="{ width: capPct(v.id) + '%' }"></div>
              </div>
              <span class="shrink-0 text-[10px] tabular" :class="surplusPoints(v.id) > 0 ? 'text-gold-ink' : 'text-ink-faint'">
                {{ currentLevel(v.id) }}/{{ cap(v.id) }}
              </span>
            </div>
            <!-- 原主脉迁出后超额部分保留(效果不失,不可再投) -->
            <p v-if="surplusPoints(v.id) > 0" class="mt-0.5 text-[10px] leading-relaxed text-gold-ink">
              作主脉时多投的 {{ surplusPoints(v.id) }} 点仍在账上,其效分毫不减,只是不能再添
            </p>
          </div>
          <!--
            投点单列:主动权放右边,说明体不再整行抢点击。
            窄屏别让它吃掉整行:投点钮不再写死 nowrap(320 宽下「投一点 · 123,456 石」
            单钮就有 ~110px,连着「改立主脉」会把脉名/说明压成极窄高列、长句碎行);
            按钮文字在窄屏省略「一点」,并允许折行兜底 —— 拆开的永远是「数+量词」整体。
          -->
          <div class="flex shrink-0 flex-col items-end gap-1 self-start">
            <button class="btn-ghost whitespace-normal !px-2.5 !py-1.5 !text-[11px]" :disabled="!canInvest(v.id)" @click="doInvest(v.id)">
              <template v-if="canInvest(v.id)">
                <span class="hidden min-[400px]:inline">投一点 · </span>
                <span class="whitespace-nowrap">{{ formatGN(investCost) }} 石</span>
              </template>
              <template v-else>{{ investedStateLabel(v.id) }}</template>
            </button>
            <button
              v-if="canSwitchTo(v.id)"
              class="btn-ghost mt-0.5 !px-2.5 !py-2 !text-[10px]"
              @click="switchArm = v.id"
            >
              改立主脉 · <span class="whitespace-nowrap">{{ formatGN(switchCost) }} 石</span>
            </button>
          </div>
        </div>

        <!-- 连投批量行:一口气能注 ≥2 点才出现,总账先报清(与群批同一条式子,所见即所得)。
             flex-wrap + 文本保底宽:窄屏放不下说明与双钮同排时,说明独占整行、钮换行自成一行 ——
             不然 flex-1 文本会被 shrink-0 双钮压到 0 宽逐字竖排(与建筑连升同一处外伤)。 -->
        <div v-if="plans[v.id].points >= 2" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
          <template v-if="batchArm !== v.id">
            <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
              连投至 <span class="font-kai text-[11px] text-cinnabar">第 {{ currentLevel(v.id) + plans[v.id].points }} 点</span>
              <span class="mt-0.5 block text-[9px] text-ink-faint tabular">共耗 灵石 {{ formatGN(plans[v.id].stone) }}</span>
            </p>
            <button class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="batchArm = v.id">连 投</button>
          </template>
          <template v-else>
            <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
              一步连投 {{ plans[v.id].points }} 点,花上面那笔总账 —— 仍要?
            </p>
            <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="batchArm = null">再想想</button>
            <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" @click="runBatch(v.id)">连 投</button>
          </template>
        </div>

        <!-- 改立主脉确认行:20 倍单价的迁移费,按下前把回落后果摆出来(原主脉的超额点不再可添) -->
        <div v-if="switchArm === v.id" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
          <p class="min-w-[5rem] flex-1 text-[10px] leading-snug text-ink-soft">
            改立「<span class="font-kai text-[11px] text-cinnabar">{{ v.name }}</span>」为主脉,耗灵石
            <span class="tabular text-ink">{{ formatGN(switchCost) }}</span>
            <span v-if="switchLoss" class="mt-0.5 block text-[9px] leading-relaxed text-gold-ink">
              「{{ switchLoss.oldName }}」现有 {{ switchLoss.points }} 点,化为副脉后超出 {{ VEIN_SIDE_CAP }} 点的 {{ switchLoss.lost }} 点不再可添(已有效果不减)
            </span>
          </p>
          <div class="flex shrink-0 gap-1">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="switchArm = null">再想想</button>
            <button class="btn-seal !px-2.5 !py-2 !text-[11px]" @click="confirmSwitch(v.id)">改 立</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 加成列账:四条脉各归一行,投了的报当期效果、没投的一句见灰 —— 谁在出力,一眼可辨 -->
    <div class="mt-3 border-t border-ink/6 pt-2.5">
      <p class="text-[10px] text-ink-faint">当前加成 · 四脉各记一账</p>
      <div class="mt-1.5 space-y-1">
        <div v-for="v in VEINS" :key="v.id" class="flex items-center gap-2">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="currentLevel(v.id) > 0 ? TONES[v.id].dot : 'bg-ink/15'"></span>
          <span class="w-14 shrink-0 text-[10px] text-ink-soft">{{ v.name }}</span>
          <span class="min-w-0 truncate text-[10px] tabular" :class="currentLevel(v.id) > 0 ? 'text-ink' : 'text-ink-faint'">
            {{ ledgerText(v.id) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { VEINS, veinDef, type VeinId } from '@/data/veins'
  import { veinEffectText } from '@/ui/veinText'
  import { investVein, investVeinBatch, veinInvestPlan, veinPointCost, veinSwitchCost, switchMainVein, type VeinInvestPlan } from '@/core/veinService'
  import { VEIN_MAIN_CAPACITY, VEIN_SIDE_CAP, VEIN_TOTAL_CAPACITY, VEIN_UNLOCK_MAJOR } from '@/data/constants'
  import { formatGN } from '@/utils/format'

  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  /**
   * 四脉各配一色系。字面量类串,不许拼 —— Tailwind 的 JIT 只认源码里写全的类;
   * 章、行描边、进度条、列账圆点全部从这里取,同一脉只一个色相,全书不乱。
   * dot/bar 由进度条与列账用,seal/row 行内即刻生效。
   */
  const TONES: Record<VeinId, { seal: string; row: string; dot: string; bar: string }> = {
    gather: { seal: 'bg-jade/10 text-jade', row: 'border-jade/35 bg-jade/5', dot: 'bg-jade', bar: 'bg-jade' },
    craft: { seal: 'bg-cinnabar/10 text-cinnabar', row: 'border-cinnabar/35 bg-cinnabar/6', dot: 'bg-cinnabar', bar: 'bg-cinnabar' },
    alchemy: { seal: 'bg-gold-ink/10 text-gold-ink', row: 'border-gold-ink/35 bg-gold-ink/6', dot: 'bg-gold-ink', bar: 'bg-gold-ink' },
    insight: { seal: 'bg-violet-ink/15 text-violet-ink', row: 'border-violet-ink/40 bg-violet-ink/7', dot: 'bg-violet-ink', bar: 'bg-violet-ink' }
  }

  const investCost = computed(() => veinPointCost())
  const switchCost = computed(() => veinSwitchCost())
  const veinsUnlocked = computed(() => player.major >= VEIN_UNLOCK_MAJOR)
  const veinTotal = computed(() => dongfu.veinTotal)

  /**
   * 列账文字 —— 必须把不走 StatMods 的那一条也算进来。
   *
   * 寒冥灵脉的 perPoint 是空对象:它的效果是「参悟省耗」,
   * 走 dongfu.insightDiscount,不进 veinMods。此前加成只有一坨拼出来的
   * StatMods 文字,寒冥脉投了满脉也一个字不显示 —— 玩家因此不知道它有没有用。
   * 列账后四条脉各占一行,谁在出力、出力几许,一眼可辨。
   * veinEffectText 内部已把参悟省耗并入,此处不必再单独凑。
   */
  function ledgerText(veinId: VeinId): string {
    const lv = currentLevel(veinId)
    return lv > 0 ? `${lv} 点 · ${veinEffectText(veinDef(veinId), lv)}` : '未投'
  }

  /** 总容量已用之百分比(卡头分度条) */
  const totalPct = computed(() => Math.round((veinTotal.value / VEIN_TOTAL_CAPACITY) * 100))

  function isMain(veinId: VeinId): boolean {
    return dongfu.veinMain === veinId
  }

  /** 该脉实际可投上限:主脉 70,副脉 30 */
  function cap(veinId: VeinId): number {
    return isMain(veinId) ? VEIN_MAIN_CAPACITY : VEIN_SIDE_CAP
  }

  /** 单脉已投 / 该脉上限;迁出的超额部分封顶百分百,条列满但数字照实报 */
  function capPct(veinId: VeinId): number {
    const c = cap(veinId)
    return c <= 0 ? 0 : Math.min(100, Math.round((currentLevel(veinId) / c) * 100))
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

  /** 四条脉的连投计划:一口气能注几点、花多少,行只用量,不算价 */
  const plans = computed<Record<VeinId, VeinInvestPlan>>(() => ({
    gather: veinInvestPlan('gather'),
    craft: veinInvestPlan('craft'),
    alchemy: veinInvestPlan('alchemy'),
    insight: veinInvestPlan('insight')
  }))

  /** 连投的二步确认态:条脉一个坑位,行自随计划进退 */
  const batchArm = ref<VeinId | null>(null)
  function runBatch(veinId: VeinId): void {
    batchArm.value = null
    investVeinBatch(veinId) // 总账那一声与 toast 由服务自己报
  }

  /** 改立主脉的二步确认态:20 倍单价的迁移费,按下前把回落后果摆出来 */
  const switchArm = ref<VeinId | null>(null)
  /** 改立后原主脉要落回副脉上限:超出 30 点的部分不再可投(效果不减) */
  const switchLoss = computed<{ oldName: string; points: number; lost: number } | null>(() => {
    const old = dongfu.veinMain
    if (!old || switchArm.value === null) return null
    const pts = currentLevel(old)
    if (pts <= 0) return { oldName: veinDef(old).name, points: pts, lost: 0 }
    return { oldName: veinDef(old).name, points: pts, lost: Math.max(0, pts - VEIN_SIDE_CAP) }
  })
  function confirmSwitch(veinId: VeinId): void {
    switchArm.value = null
    switchMainVein(veinId) // 成败一声与 toast 由服务自己报
  }

  function doInvest(veinId: VeinId): void {
    investVein(veinId)
  }
</script>
