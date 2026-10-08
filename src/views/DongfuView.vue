<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <!-- 抬头 -->
    <div class="card-ink relative flex items-center justify-between gap-2 px-4 py-3">
      <!--
        冷启动直接落在这一页时(书签 / deep link / 恢复上次路由),站内没有上一页,
        裸 router.back() 会退到 about:blank 把游戏一起带走 —— 故走 goBack(父页兜底)
      -->
      <button class="-my-1.5 py-1.5 text-left text-[12px] text-ink-faint" @click="goBack(router, { name: 'home' })">← 返回</button>
      <!--
        标题真正居中:左「返回」窄、右「经营家业,道途更稳」宽,若三件套走
        justify-between,标题会被两侧的不等宽拽离版面中轴、看着发斜。
        故把标题从文档流里提出来绝对居中(left-1/2),两侧各贴一边 ——
        无论左右多宽,「洞府营造」永远钉在卡片正中。
      -->
      <p class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-kai text-[15px] tracking-[0.3em] text-ink">
        洞府营造
      </p>
      <span class="text-[10px] text-ink-faint">经营家业,道途更稳</span>
    </div>

    <!-- 新府初成:先修谁、升一级能怎样,不给抽象告诫只给具体路径 -->
    <div v-if="mansionLv === 0" class="rounded-md border border-amber-ink/25 bg-amber-ink/5 px-3 py-2.5">
      <p class="font-kai text-[11px] tracking-wider text-amber-ink">新府初成</p>
      <ul class="mt-1 space-y-0.5 text-[10px] leading-relaxed text-ink-faint">
        <li>· 先修「洞府」本体 —— 其余建筑能造到多高、离线能存多久,都压在它身上。</li>
        <li>· {{ offlineLaunchLine }}</li>
        <li>· 洞府每上一层,其余建筑能建的层巅便抬高一程,各筑另有自己的尽头。</li>
      </ul>
    </div>

    <!-- 洞府纪要:产出与上限一眼汇总(只读,不替代任何建筑卡的详情) -->
    <div class="rounded-md border border-ink/10 bg-paper-deep/50 px-3 py-2.5">
      <div class="flex items-center justify-between">
        <span class="font-kai text-[12px] tracking-wider text-ink-soft">洞府纪要</span>
        <!-- 离线上限在下方「离线可攒」那一行已给出(还带五段档位条),不再在右上角重复一遍同数 -->
      </div>
      <div class="mt-1.5 grid grid-cols-3 gap-1.5">
        <!-- 三格各配一枚小章:灵草叶 / 玄铁斧 / 悟道书,图比字先被眼睛接住 -->
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <GameIcon name="leaf" :size="13" class="mx-auto text-jade" />
          <p class="mt-0.5 text-[9px] text-ink-faint">灵草 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.fieldLv ? 'text-jade' : 'text-ink-faint'">{{ summary.fieldLv ? summary.herbHr : '—' }}</p>
        </div>
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <GameIcon name="axe" :size="13" class="mx-auto text-ink-soft" />
          <p class="mt-0.5 text-[9px] text-ink-faint">玄铁 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.fieldLv ? 'text-ink-soft' : 'text-ink-faint'">{{ summary.fieldLv ? summary.oreHr : '—' }}</p>
        </div>
        <div class="rounded bg-paper-deep/60 px-1 py-1.5 text-center">
          <GameIcon name="book" :size="13" class="mx-auto text-gold-ink" />
          <p class="mt-0.5 text-[9px] text-ink-faint">悟道 / 时</p>
          <p class="tabular font-kai text-[14px] leading-tight" :class="summary.libLv ? 'text-gold-ink' : 'text-ink-faint'">{{ summary.libLv ? summary.wudaoHr : '—' }}</p>
        </div>
      </div>
      <div class="mt-1.5 flex items-center justify-between gap-2">
        <span class="flex items-center gap-1 rounded bg-paper-deep/60 px-2 py-1 text-[10px] text-ink-faint">
          <GameIcon name="droplets" :size="12" class="text-azure" />
          灵气上限 <span class="tabular" :class="summary.arrayLv ? 'text-azure' : 'text-ink-faint'">{{ summary.arrayLv ? summary.qiCapPct : '—' }}</span>
        </span>
        <span class="flex items-center gap-1 rounded bg-paper-deep/60 px-2 py-1 text-[10px] text-ink-faint">
          <GameIcon name="scroll" :size="12" class="text-gold-ink" />
          辅修栏 <span class="tabular text-ink-soft">{{ summary.subSlots }}</span>
        </span>
      </div>
      <!--
        离线档位:5 段一览,现在第几档、升洞府能到哪一档,不看向来只报一个数。
        标签与档数不再和段条挤同一行 —— 那样三种字号(9px 标签 / 6px 段条 / 楷体数字)
        竖直混排,细碎得像一行乱码。改成两行:上有标签与数,段条单独占一整行。
      -->
      <div class="mt-1.5 flex items-baseline justify-between">
        <span class="text-[9px] text-ink-faint">离线可攒</span>
        <span class="font-kai text-[10px] tabular text-gold-ink">{{ summary.offlineHrs }} 时</span>
      </div>
      <div class="mt-1 flex items-center gap-1">
        <span
          v-for="(hr, i) in OFFLINE_CAP_HOURS"
          :key="hr"
          class="h-1.5 flex-1 rounded-full transition-colors"
          :class="i <= mansionLv ? 'bg-gold-ink/70' : 'bg-ink/8'"
          :title="`洞府 ${i} 级 · 离线可攒 ${hr} 时`"
        ></span>
      </div>
    </div>

    <!-- 建筑:洞府是全局闸门,独自横贯一排;其余六座在其辖下成格 -->
    <section>
      <SectionTitle title="营造" :hint="`已启 ${builtCount}/${BUILDINGS.length} · 各司其职`" />
      <BuildingCard :def="mansionDef" featured class="mt-2" />
      <div class="mt-2.5 grid grid-cols-1 gap-2.5 min-[320px]:grid-cols-2">
        <BuildingCard v-for="def in otherBuildings" :key="def.id" :def="def" />
      </div>
    </section>

    <!-- 灵脉:全部统合在本页。信息量大(四脉·各注·投资/换向),默认折成一行摘要,点开才见详情 -->
    <section class="space-y-2">
      <button
        v-if="veinsUnlocked"
        type="button"
        class="card-ink flex w-full items-center gap-2.5 px-4 py-3 text-left active:scale-98"
        :aria-expanded="veinExpanded"
        aria-controls="vein-panel"
        @click="veinExpanded = !veinExpanded"
      >
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gold-ink/10 text-gold-ink"><GameIcon name="gem" :size="18" /></span>
        <span class="min-w-0 grow">
          <span class="block font-kai text-[14px] tracking-[0.25em] text-ink">灵脉投资</span>
          <span class="mt-0.5 flex items-center gap-1.5">
            <!-- 折叠态也带迷你容量条:不点开也知已投几成 -->
            <span class="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-ink/6">
              <span class="block h-full rounded-full bg-gold-ink/70" :style="{ width: foldPct + '%' }"></span>
            </span>
            <span class="min-w-0 truncate text-[10px] text-ink-faint tabular">{{ veinSummary }}</span>
          </span>
        </span>
        <span class="shrink-0 text-[12px] text-gold-ink transition-transform" :class="veinExpanded ? 'rotate-90' : ''">›</span>
      </button>
      <!--
        未达门槛:整块就是一句前瞻,没有可展开的内容。
        开启境界不手抄「金丹」—— 与 veinsUnlocked 读同一枚 VEIN_UNLOCK_MAJOR,
        倍数高些低些,这句前瞻自己跟着变(与 rebirthText 的「X境方可兵解」同法)
      -->
      <div v-if="!veinsUnlocked" class="flex items-center gap-2.5 rounded-md border border-dashed border-gold-ink/25 bg-gold-ink/4 px-3 py-2.5">
        <GameIcon name="gem" :size="16" class="shrink-0 text-gold-ink" />
        <p class="text-[10px] leading-relaxed text-ink-faint">
          灵脉 —— 以灵石点化,洞府根基永固,诸般属性皆有增益。{{ veinGateRealm }}境方启此脉,届时自会在此与你相会。
        </p>
      </div>
      <!--
        展开/收起:高度 + 透明度过渡,不像生硬裁切。
        v-show 而非 v-if:折叠时面板仍在 DOM 里(仅 display:none),折叠头的
        aria-controls=vein-panel 任何时候都解析得到 —— v-if 会在默认折叠态
        把目标元素整个卸掉,关联悬空(辅助技术与自动化都读不到)。
      -->
      <Transition name="vein-drop">
        <div v-show="veinsUnlocked && veinExpanded" id="vein-panel" class="overflow-hidden">
          <VeinInvestCard />
        </div>
      </Transition>
    </section>

  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { goBack } from '@/router/goBack'
  import { BUILDINGS, ARRAY_QI_CAP_PER_LEVEL } from '@/data/buildings'
  import { REALMS } from '@/data/realms'
  import { FIELD_HERB_PER_HOUR, FIELD_ORE_PER_HOUR, LIBRARY_WUDAO_PER_HOUR, OFFLINE_CAP_HOURS, VEIN_TOTAL_CAPACITY, VEIN_UNLOCK_MAJOR } from '@/data/constants'
  import { VEINS } from '@/data/veins'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import GameIcon from '@/components/common/GameIcon.vue'
  import BuildingCard from '@/components/dongfu/BuildingCard.vue'
  import VeinInvestCard from '@/components/dongfu/VeinInvestCard.vue'

  const router = useRouter()
  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  /** 洞府等级,作离线档位条的当前档(0..4) */
  const mansionLv = computed(() => dongfu.levels.mansion ?? 0)
  /** 新府引导里的离线数字随 OFFLINE_CAP_HOURS 现算,不写死成 8 时/12 时 */
  const offlineLaunchLine = computed(() => {
    const now = OFFLINE_CAP_HOURS[0]
    const next = OFFLINE_CAP_HOURS[1]
    return `离线可攒现为 ${now} 时,洞府升至 1 级即 ${next} 时`
  })

  /** 灵脉金丹解锁;未达门槛时只给一句前瞻,别让新人面对一整张禁用按钮 */
  const veinsUnlocked = computed(() => player.major >= VEIN_UNLOCK_MAJOR)
  /** 前瞻里的开启境界名:取自 VEIN_UNLOCK_MAJOR 所在境,门槛动它跟着动 */
  const veinGateRealm = computed(() => REALMS[VEIN_UNLOCK_MAJOR]?.name ?? '更高')
  /** 灵脉信息量大,默认折成一行;点开展开四脉详情 */
  const veinExpanded = ref(false)
  /** 折叠态摘要:已投点数 + 主脉名(未立主脉给提示) */
  const veinSummary = computed(() => {
    const main = dongfu.veinMain ? VEINS.find(v => v.id === dongfu.veinMain)?.name : undefined
    return `已投 ${dongfu.veinTotal}/${VEIN_TOTAL_CAPACITY} · 主脉 ${main ?? '未立'}`
  })
  /** 折叠态迷你容量条宽度(百分比) */
  const foldPct = computed(() => Math.round((dongfu.veinTotal / VEIN_TOTAL_CAPACITY) * 100))

  /** 已启用建筑数(等级 > 0),营造区标题旁报数 */
  const builtCount = computed(() => BUILDINGS.filter(b => (dongfu.levels[b.id] ?? 0) > 0).length)
  /** 洞府:全局闸门,单独把守头条 */
  const mansionDef = computed(() => BUILDINGS.find(b => b.id === 'mansion')!)
  /** 其余六座在其辖下成格 */
  const otherBuildings = computed(() => BUILDINGS.filter(b => b.id !== 'mansion'))

  /**
   * 洞府纪要:产出与上限一眼汇总。数字写死会与结算漂移,故直接取 store 的
   * levels 与常数重算 —— 与 produce/effectText 同一口径(灵田 ×6 草/×2.4 铁,
   * 藏经阁 ×1.5 悟道,聚灵阵 ×8% 容量)。
   */
  const summary = computed(() => {
    const fieldLv = dongfu.levels.field ?? 0
    const libLv = dongfu.levels.library ?? 0
    const arrayLv = dongfu.levels.array ?? 0
    return {
      fieldLv,
      libLv,
      arrayLv,
      herbHr: `${fieldLv * FIELD_HERB_PER_HOUR} 株`,
      oreHr: `${(fieldLv * FIELD_ORE_PER_HOUR).toFixed(1)} 块`,
      wudaoHr: `${(libLv * LIBRARY_WUDAO_PER_HOUR).toFixed(1)} 点`,
      offlineHrs: dongfu.offlineCapHours,
      qiCapPct: `+${Math.round(arrayLv * ARRAY_QI_CAP_PER_LEVEL * 100)}%`,
      subSlots: dongfu.subGongfaSlots
    }
  })
</script>

<style scoped>
  /* 灵脉展开/收起:max-height 爬坡 + 淡入淡出。上界取足,四条脉 + 图例撑不满 */
  .vein-drop-enter-active,
  .vein-drop-leave-active {
    transition:
      opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1),
      max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .vein-drop-enter-from,
  .vein-drop-leave-to {
    opacity: 0;
    max-height: 0;
  }
  .vein-drop-enter-to,
  .vein-drop-leave-from {
    max-height: 52rem;
  }
</style>
