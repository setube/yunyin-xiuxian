<template>
  <!-- 一键分解:勾选品质(记忆勾选)。纯手动批量动作 —— 与「智能收纳」的自动取舍互不干扰 -->
  <BaseModal :open="decomposeOpen" title="一键分解(手动)" @close="emit('close-decompose')">
    <p class="text-[11px] leading-relaxed text-ink-faint">
      勾选要化掉的品质,只管
      <span class="text-ink-soft">行囊里现存</span>
      之物;已佩戴与上锁的装备不受影响。这份勾选会留作下次,却只在
      <span class="text-ink-soft">下文「分 解」时作数</span>
      —— 历练中掉落的装备不在此列,去留另由「智能收纳」的尺度把持。
    </p>
    <div class="mt-2 space-y-1">
      <label
        v-for="row in decomposeRows"
        :key="row.rank"
        class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5"
        :class="settings.decomposeRanks.includes(row.rank) ? 'bg-paper-deep/80' : ''"
      >
        <input
          type="checkbox"
          class="h-4 w-4 accent-cinnabar"
          :checked="settings.decomposeRanks.includes(row.rank)"
          @change="toggleRank(row.rank)"
        />
        <span class="font-kai text-[13px]" :style="{ color: row.color }">{{ row.name }}</span>
        <span class="ml-auto tabular text-[11px] text-ink-faint">
          现存 {{ row.count }} 件
          <template v-if="row.count > 0">· {{ row.text }}</template>
        </span>
      </label>
    </div>
    <p v-if="decomposeTotal > 0" class="mt-2 text-right text-[11px] text-cinnabar tabular">
      共 {{ decomposeTotal }} 件,入炉可化 {{ batchYieldText(decomposePlanned) }}
    </p>
    <template #footer>
      <button class="btn-seal w-full" :disabled="decomposeTotal === 0" @click="confirmDecompose">
        分 解{{ decomposeTotal > 0 ? `(${decomposeTotal} 件)` : '' }}
      </button>
    </template>
  </BaseModal>

  <!-- 智能收纳:独立的自动取舍策略 —— 与「一键分解」的手动动作井水不犯河水 -->
  <BaseModal :open="smartOpen" title="智能收纳(自动)" @close="emit('close-smart')">
    <p class="text-[11px] leading-relaxed text-ink-faint">
      开启后,新落之物在入行囊前先过一关:值得留的留下,无缘的一缕化尘;行囊已满且有无缘旧物时,新至的宝物会顶走包里最弱的一件,无可顶者便也化尘。
    </p>
    <!-- 状态一眼:策略一段话说清,不必把六个开关拼起来读 -->
    <div
      class="mt-2.5 rounded-md px-3 py-2 text-[10px] leading-relaxed"
      :class="settings.smartKeep.enabled ? 'bg-jade/8 text-jade' : 'bg-ink/4 text-ink-faint'"
    >
      {{ smartStatusLine }}
    </div>

    <!-- 规则 · 门槛:总开关 + 两条自留线(品质线 与 阶级线,双线皆满才留) -->
    <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">规则 · 门槛</p>
    <div class="rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1">
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[13px] text-ink-soft">启用智能收纳</span>
        <input v-model="settings.smartKeep.enabled" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <!-- 品质线:九档全列,从哪一档起珍 —— 不只灵品/玄品/地品三档可选 -->
      <div class="border-t border-ink/6 py-1.5">
        <p class="mb-1.5 text-[12px] text-ink-soft">品质线 · 自「{{ KEEP_QUALITY_CHOICES.find(q => q.rank === settings.smartKeep.minQuality)?.name ?? '灵品' }}」起珍藏</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="q in KEEP_QUALITY_CHOICES"
            :key="q.rank"
            class="chip-ink !py-2 text-[10px]"
            :class="settings.smartKeep.minQuality === q.rank ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            @click="settings.smartKeep.minQuality = q.rank"
          >
            {{ q.name }}
          </button>
        </div>
      </div>
      <!-- 阶级线:阶数到线的,须同时过品质线才留;与品质线「且」关系 -->
      <div class="border-t border-ink/6 py-1.5">
        <p class="mb-1.5 text-[12px] text-ink-soft">
          阶级线 ·
          {{ settings.smartKeep.keepMinTier > 0 ? `自 ${settings.smartKeep.keepMinTier} 阶起,双线皆满才留` : '不设(只看品质与识宝)' }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in KEEP_TIER_CHOICES"
            :key="t"
            class="chip-ink !py-2 text-[10px]"
            :class="settings.smartKeep.keepMinTier === t ? 'border-cinnabar text-cinnabar' : 'border-ink/25 text-ink-faint'"
            @click="settings.smartKeep.keepMinTier = t"
          >
            {{ t === 0 ? '不设' : `${t} 阶` }}
          </button>
        </div>
      </div>
    </div>

    <!-- 识宝 · 单看品质不够:这四项认「值得」,不认「贵贱」 -->
    <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">识宝 · 品质之外的值得</p>
    <div class="rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1">
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">主流派核心词条件</span>
        <input v-model="settings.smartKeep.keepCoreAffix" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">组合技部件(副体系词条)</span>
        <input v-model="settings.smartKeep.keepComboPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">成套共鸣件(机制优先)</span>
        <input v-model="settings.smartKeep.keepSetPiece" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
      <label class="flex items-center justify-between py-1.5">
        <span class="text-[12px] text-ink-soft">词条近满件</span>
        <input v-model="settings.smartKeep.keepPerfectRolls" type="checkbox" class="h-4 w-4 accent-cinnabar" />
      </label>
    </div>
    <p class="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
      强化、重铸、转入过或带封存的件不动。
    </p>

    <!-- 划界 · 与「一键分解」互不读钩 -->
    <p class="mb-1 mt-3 font-kai text-[11px] tracking-wider text-ink-soft">与「一键分解」各归各帐</p>
    <p class="text-[10px] leading-relaxed text-ink-faint">
      「一键分解」只处置行囊里现存之物,须你亲手动;这里只判掉落之后的去留 ——
      两件事各归各管,调了这一头,那一头不受牵连。
    </p>
    <template #footer>
      <!--
        一键清理二步确认:整包报废,按一下不该就此了结。
        确认页直接列清单(预览与下手同一份名单)+ 入炉收益 —— 化的是什么,一目了然
      -->
      <template v-if="!cleanConfirm">
        <button
          class="btn-ghost w-full !text-[12px]"
          :class="cleanCount ? '' : 'opacity-45'"
          :disabled="cleanCount === 0"
          @click="cleanConfirm = true"
        >
          依此规则清理行囊{{ cleanCount ? `(无缘之物化尘 · ${cleanCount} 件)` : '(已无可清之缘)' }}
        </button>
      </template>
      <template v-else>
        <p class="mb-1 text-center text-[11px] text-cinnabar tabular">
          将化尘 {{ cleanCount }} 件,入炉可得 {{ batchYieldText(cleanYield) }}——此举不可逆
        </p>
        <div class="mb-2 max-h-36 overflow-y-auto rounded-md border border-ink/8 bg-paper-deep/40 px-2.5 py-1.5">
          <p
            v-for="t in cleanPreview.slice(0, SWEEP_PREVIEW_LIMIT)"
            :key="t.item.uid"
            class="flex items-baseline justify-between gap-2 py-1 text-[10px]"
          >
            <span class="min-w-0 truncate font-kai" :style="{ color: qualityDef(t.item.quality).color }">
              {{ equipmentTemplate(t.item.templateId)?.name ?? '旧物' }}
            </span>
            <span class="shrink-0 text-ink-faint tabular">{{ t.item.tier }} 阶 · {{ t.reason }}</span>
          </p>
          <p v-if="cleanPreview.length > SWEEP_PREVIEW_LIMIT" class="mt-0.5 border-t border-ink/6 pt-0.5 text-[9px] text-ink-faint">
            … 其余 {{ cleanPreview.length - SWEEP_PREVIEW_LIMIT }} 件从略
          </p>
          <p v-if="!cleanPreview.length" class="py-0.5 text-[10px] text-jade">此尺度下,行囊已无一缘可清</p>
        </div>
        <!-- 行囊若已满:榜首那件就是下一件新物的顶位对象,先把临头的事说破 -->
        <p v-if="bagFull && cleanPreview.length" class="mb-2 text-[9px] leading-relaxed text-ink-faint">
          行囊已满 —— 若无意外,下一件新宝会先顶走榜首「{{ firstSweepName }}」。
        </p>
        <div class="flex gap-2">
          <button class="btn-ghost flex-1 !text-[12px]" @click="cleanConfirm = false">再想想</button>
          <button class="btn-seal flex-1 !text-[12px]" @click="smartClean()">清理化尘</button>
        </div>
      </template>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { QUALITIES, qualityDef } from '@/data/qualities'
  import { BAG_CAPACITY } from '@/data/constants'
  import { MAX_EQUIP_TIER, equipmentTemplate } from '@/data/equipment'
  import { useInventoryStore } from '@/stores/inventory'
  import { useSettingsStore } from '@/stores/settings'
  import { useUiStore } from '@/stores/ui'
  import { batchYieldText, type DecomposeBatch, decomposeBatch, decomposeByRanks, decomposePreview } from '@/core/forge'
  import { sweepTargets } from '@/core/smartKeep'
  import { salvageOf } from '@/core/salvage'
  import { add, gnZero } from '@/utils/gnum'
  import { decomposeEmptyToast, smartCleanToast } from '@/ui/inventoryText'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 一键分解与智能收纳两扇浮层 —— 自 InventoryView 迁入。
   *
   * 两页共用「行囊现存件」这一本账,却各按各的规矩处置:分解只认勾选档、须亲手动;
   * 收纳只判掉落之后的去留。放在一处,是为了让「划界」那段话始终看得见两条规矩的边界。
   * 开关是宿主的页面状态,这里只认 props、回传关闭。
   */
  defineProps<{ decomposeOpen: boolean; smartOpen: boolean }>()
  const emit = defineEmits<{ 'close-decompose': []; 'close-smart': [] }>()

  const inventory = useInventoryStore()
  const settings = useSettingsStore()
  const ui = useUiStore()

  // ---- 一键分解 ----
  /** 各品质档的现存件数与分解返还(与服务同一套算法:弹窗上写多少就是真给多少) */
  const decomposeRows = computed(() =>
    QUALITIES.map(q => {
      const got = decomposePreview([q.rank])
      return { rank: q.rank, name: q.name, color: q.color, count: got.count, text: batchYieldText(got) }
    })
  )

  const decomposeTotal = computed(() =>
    decomposeRows.value.filter(r => settings.decomposeRanks.includes(r.rank)).reduce((sum, r) => sum + r.count, 0)
  )

  /** 已勾选那几档的总账 */
  const decomposePlanned = computed(() => decomposePreview(settings.decomposeRanks))

  function toggleRank(rank: number): void {
    const adding = !settings.decomposeRanks.includes(rank)
    settings.decomposeRanks = adding
      ? [...settings.decomposeRanks, rank].sort((a, b) => a - b)
      : settings.decomposeRanks.filter(r => r !== rank)
    // 勾选只是「标记该档为废料」——行囊内现存同类不在此刻销毁,待玩家点「分 解」确认。
    // 此勾选与「智能收纳」互不相干:掉落去哪儿由智能收纳的保留线与智能规则独立裁决。
  }

  function confirmDecompose(): void {
    // 总账那一条由服务自己报(逐件弹提示只会互相顶掉)
    if (decomposeByRanks(settings.decomposeRanks) === 0) ui.toast(decomposeEmptyToast(), 'info')
    emit('close-decompose')
  }

  // ---- 智能收纳 ----
  /** 品质自留线:九档全列,自由从任意一档起珍(从前只有灵/玄/地三档可选) */
  const KEEP_QUALITY_CHOICES = QUALITIES.map(q => ({ rank: q.rank, name: q.name }))
  /**
   * 阶级自留线常用档位:0 = 不设;阶是「高阶产出」的近义,越高的窗口只在高阶材料里
   * (见 qualities 的品质窗口),故给一组拉开距离的常用档,而不是 1~N 每档一个;
   * 顶格与 MAX_EQUIP_TIER 同源,游戏阶上限涨了这里自动跟上
   */
  const KEEP_TIER_CHOICES = [0, 8, 12, 16, 20, 24, 28, MAX_EQUIP_TIER]

  /** 清理预告:清单条数上限,超出收拢一行「其余 N 件从略」,别让名单淹没弹窗 */
  const SWEEP_PREVIEW_LIMIT = 6

  /** 依当前所设尺度将化的件(预览与下手用同一份名单,所见即所得) */
  const cleanPreview = computed(() => sweepTargets(inventory.bagItems))
  /** 待清理件数(确认提示用),由名单现算,不再另写一套筛选 */
  const cleanCount = computed(() => cleanPreview.value.length)
  /** 清理入炉收益:只见不化(与「一键分解」的 preview 同口径,纯算) */
  const cleanYield = computed<DecomposeBatch>(() => {
    const total: DecomposeBatch = { count: 0, dust: 0, stone: gnZero() }
    for (const t of cleanPreview.value) {
      const gain = salvageOf(t.item)
      total.count += 1
      total.dust += gain.dust
      total.stone = add(total.stone, gain.stone)
    }
    return total
  })
  /** 行囊是否已满:满时新宝会先顶走榜首那件无缘旧物 */
  const bagFull = computed(() => inventory.bagItems.length >= BAG_CAPACITY)
  /** 榜首件的名字(行囊满时,下一件新物的顶位对象) */
  const firstSweepName = computed(() => {
    const first = cleanPreview.value[0]
    return first ? (equipmentTemplate(first.item.templateId)?.name ?? '旧物') : ''
  })

  /**
   * 当前策略一句话:门槛 + 识宝命中 + 余者化尘。把六个开关拼成一句人话,
   * 玩家不必心读这页才知道「自动」到底会怎么做。
   */
  const smartStatusLine = computed(() => {
    const sk = settings.smartKeep
    if (!sk.enabled) return '未启用 —— 掉落照常入包,此间的尺度暂且不用'
    const keepName = KEEP_QUALITY_CHOICES.find(q => q.rank === sk.minQuality)?.name ?? '灵品'
    const tierLine = sk.keepMinTier > 0 ? `;且自 ${sk.keepMinTier} 阶起,双线皆满才留` : ''
    const tags = [
      sk.keepCoreAffix && '核心',
      sk.keepComboPiece && '组合',
      sk.keepSetPiece && '成套',
      sk.keepPerfectRolls && '近满'
    ].filter(Boolean)
    const grace = tags.length ? `;带${tags.join('或')}之器,一并留藏` : ''
    return `${keepName}以上尽数珍藏${tierLine}${grace};余者无缘,落地便化作器灵尘`
  })

  /** 清理确认态:按一次按钮先落在「再想想/清理化尘」上 */
  const cleanConfirm = ref(false)

  /**
   * 清理下手:与确认页同一份名单(cleanPreview,reactive 随行囊刷新),点下时现算。
   * 预览与实际同源 —— decomposeBatch 只在「件在包且未锁」时成功,而 sweepTargets
   * 恰是按这两条筛的;单线程、弹窗挡着交互,渲染帧与点击之间没有夹缝,行囊即使被
   * 异步事件改动,cleanPreview 先变、这里的 .value 也已是新值。toast 照实报 got
   * (decomposeBatch 的真实返回值),不报预览数。
   */
  function smartClean(): void {
    cleanConfirm.value = false
    const snapshot = sweepTargets(inventory.bagItems) // 与确认页同源,兜底再取一次
    const got = decomposeBatch(snapshot.map(t => t.item))
    // 有化尘 = 有得,归 success;一件都没化 = 中性播报,留 info(与一键换装同族口径)
    ui.toast(smartCleanToast(got.count, batchYieldText(got)), got.count > 0 ? 'success' : 'info')
    emit('close-smart')
  }
</script>
