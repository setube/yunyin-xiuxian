<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <div v-if="!unlocked" class="card-ink px-6 py-16 text-center">
      <p class="font-kai text-[22px] tracking-[0.4em] text-ink">器 魂</p>
      <p class="mt-4 text-[12px] leading-relaxed text-ink-faint">需<span class="text-cinnabar">{{ endgameGateRealmName() }}境</span></p>
    </div>

    <template v-else>
      <div class="card-ink flex items-center justify-between gap-2 px-4 py-3">
        <!-- 冷启动时也回天界,不退出游戏(同洞府) -->
        <button class="-my-1.5 py-1.5 text-left text-[12px] text-ink-faint" @click="goBack(router, { name: 'celestial' })">← 天界</button>
        <p class="font-kai text-[15px] tracking-[0.3em] text-ink">器 魂</p>
        <div class="text-right">
          <span class="block text-[10px] leading-tight text-ink-faint">道源</span>
          <span class="block tabular font-kai text-[15px] leading-tight text-cinnabar">{{ formatNum(endgame.daoSource) }}</span>
        </div>
      </div>

      <section>
        <SectionTitle title="何谓器魂" />
        <div class="card-ink mt-2 px-4 py-3">
          <p class="text-[11px] leading-relaxed text-ink-faint"><span class="text-gold-ink">器魂</span>:叠加于基础属性之上</p>
        </div>
      </section>

      <section>
        <SectionTitle title="已凝形意" :hint="`${endgame.activeSouls.length} / ${SOUL_SLOTS} 缕`" />
        <div class="mt-2 grid grid-cols-3 gap-2">
          <!--
            空槽不再整卡压 50% 透明:卡里那句「空槽」是状态词,压到 2.04:1 就读不出。
            空与有由内部分支(有无 soul)自己表达,不靠透明度。
          -->
          <div
            v-for="row in slotRows"
            :key="row.index"
            class="card-ink relative flex min-h-[86px] flex-col items-center justify-center px-2 py-2 text-center"
          >
            <!-- 最上阶(化真)独有的一圈魂环;其余阶只有阶点(见 ui/soulMark) -->
            <span v-if="row.mark?.top" class="soul-halo" aria-hidden="true" />
            <template v-if="row.soul">
              <span class="font-kai text-[22px] leading-none" :style="{ color: row.color }">{{ row.seal }}</span>
              <span class="mt-1 text-[10px] leading-tight text-ink-soft">{{ row.label }}</span>
              <!-- 阶点:几阶就几点,数得出来;最上阶的点为菱形 -->
              <span
                class="soul-pips mt-1"
                :class="{ 'soul-pips--top': row.mark!.top }"
                :style="{ '--soul-tone': row.mark!.color }"
                role="img"
                :aria-label="`${row.mark!.label}阶`"
              >
                <i v-for="p in row.mark!.pips" :key="p" />
              </span>
              <!-- 纯文字只有 15px 高;内联块给拇指 30px 靶面 -->
              <button
                class="mt-1 inline-block px-2 py-2 text-[10px] text-ink-faint underline"
                @click="removeSoul(row.soul.uid)"
              >
                卸下
              </button>
            </template>
            <span v-else class="text-[10px] text-ink-faint">空</span>
          </div>
        </div>
        <p v-if="activeModText" class="mt-2 px-1 text-[10px] leading-relaxed text-gold-ink">合计:{{ activeModText }}</p>
        <!--
          槽只有三格,散置常有七八缕:要挑最强的三枚,得逐枚读词条、心算
          「暴击率 +5% 与伤害减免 +4.5% 哪个更值」—— 而这两样本无可比口径。
          故按既有的战力权重给每枚算分量,取前几枚(见 ui/soulPick)。
          择优只是建议:装上哪几枚、各值多少,都摆在明处。
        -->
        <div
          v-if="pickReady.length > 0"
          class="mt-2 rounded-md border border-jade/25 bg-jade/5 px-3 py-2"
        >
          <!--
            只报状态。判据挪进钮的 title —— 它是「凭什么按这个次序」的注解,
            按需出现,不占正文那一行(AGENTS.md「优先用 UI 表达」)。
          -->
          <div class="flex items-center justify-between gap-2">
            <span class="min-w-0 text-[10px] leading-relaxed text-jade">
              可装 {{ pickReady.length }} 缕 · {{ pickNames }}
            </span>
            <button
              class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]"
              title="优先看阶位;同阶再看词条总量"
              @click="doPickBest"
            >择优装配</button>
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <button
          class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
          @click="idleOpen = true"
        >
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-violet-ink font-kai text-[19px] seal-face">意</span>
          <span class="min-w-0 flex-1">
            <span class="block font-kai text-[14px] tracking-widest text-ink">散置形意</span>
            <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
              {{ idleSouls.length > 0 ? `${idleSouls.length} 缕闲置` : '暂无闲置器魂' }}
            </span>
          </span>
          <span class="shrink-0 text-[12px] text-ink-faint">›</span>
        </button>

        <button
          class="card-ink flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-98"
          @click="forgeOpen = true"
        >
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cinnabar font-kai text-[19px] seal-face">炼</span>
          <span class="min-w-0 flex-1">
            <span class="block font-kai text-[14px] tracking-widest text-ink">凝炼台</span>
            <span class="block truncate text-[10px] leading-relaxed text-ink-faint">
              {{ refinable.length > 0 ? `${refinable.length} 件可凝 · 道源 ${SOUL_REFINE_COST}/枚` : '暂无可凝法器' }}
            </span>
          </span>
          <span class="shrink-0 text-[12px] text-ink-faint">›</span>
        </button>
      </section>
    </template>

    <BaseModal :open="idleOpen" title="散置形意" @close="idleOpen = false">
      <!-- 散去的后果须在动手之前看见 -->
      <p class="mb-2 text-[10px] leading-relaxed text-ink-faint">{{ dissolveNote() }}</p>
      <div v-if="idleSouls.length > 0" class="card-ink max-h-64 divide-y divide-ink/6 overflow-y-auto px-4">
        <!--
          两段式:正文一段、钮组一段,各占一行。

          原先是一行 justify-between 不可折:未确认态两枚钮 88px,确认态变成三枚(46+54+65=165)。
          320 宽下左列被压到 22px ——「朦胧·锋魂」竖排成一行一个字,那一行从 177px 涨到 745px。
          改成可折行之后仍然不稳:375 宽下未确认态挤得进一行(102.5px)、确认态挤不进就折(126.8px)——
          点一下「散去」,整行就长高 24px。

          钮组行宽随状态变,是这枚钮「忽大忽小」的根源;故钮组固定独占一行、右对齐:
          两态行高一致,320 宽也不会把名字压成竖排。代价是每行多 35px 高 ——
          换来的是点前点后位置不动,且一屏仍看得下两枚魂。
        -->
        <div v-for="row in idleSouls" :key="row.soul.uid" class="py-2.5">
          <div class="min-w-0">
            <p class="flex items-center gap-1.5 text-[12px]">
              <!-- 魂型印:与出战槽那枚同源(六类器魂各有单字,见 data/souls 的 seal) -->
              <span
                class="grid h-5 w-5 shrink-0 place-items-center rounded font-kai text-[11px] leading-none"
                :style="{ color: row.color, background: `color-mix(in srgb, ${row.color} 12%, transparent)` }"
                aria-hidden="true"
              >{{ row.seal }}</span>
              <span class="truncate" :style="{ color: row.textColor }">{{ row.label }}</span>
              <span
                class="soul-pips shrink-0"
                :class="{ 'soul-pips--top': row.mark.top }"
                :style="{ '--soul-tone': row.color }"
                role="img"
                :aria-label="`${row.mark.label}阶`"
              >
                <i v-for="p in row.mark.pips" :key="p" />
              </span>
            </p>
            <p class="text-[10px] text-ink-faint">凝自「{{ row.soul.fromName }}」 · {{ soulModText(row.soul) }}</p>
            <!-- 六类器魂各有一句形意,原先只在数据表里(见 ui/soulText 的 soulFlavorText) -->
            <p v-if="row.flavor" class="text-[10px] leading-relaxed text-violet-ink">{{ row.flavor }}</p>
          </div>
          <!-- 巡页夹具无灵魂,28px 尺子碰不到这些钮;!py-2 盒高 35px,与同行确认态按钮同高 -->
          <div class="mt-1.5 flex justify-end gap-1">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="wearSoul(row.soul.uid)">装配</button>
            <template v-if="pendingDissolveUid !== row.soul.uid">
              <button class="btn-ghost !px-2 !py-2 !text-[11px] !text-ink-faint" @click="pendingDissolveUid = row.soul.uid">散去</button>
            </template>
            <template v-else>
              <button class="btn-ghost !px-2 !py-2 !text-[11px]" @click="pendingDissolveUid = null">再想想</button>
              <button class="btn-seal !px-2 !py-2 !text-[11px]" @click="doDissolve(row.soul.uid)">确认散去</button>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-faint">暂无闲置器魂</p>
      <!--
        散置的几枚要一枚枚点确认,而后期闲置器魂常有一堆。
        与其他复述动作族同一套写法:主词「清理散置」、两步确认、「再想想」。
        后果文案读 dissolveNote(),不在模板里手打 —— 同一件事两处写会分叉。
      -->
      <div v-if="idleSouls.length > 1" class="mt-2 flex items-center justify-between gap-2 rounded-md bg-cinnabar/5 px-3 py-2">
        <span class="min-w-0 text-[10px] leading-relaxed text-cinnabar tabular">
          散置 {{ idleSouls.length }} 枚 · {{ dissolveNote() }}
        </span>
        <template v-if="clearIdleArm">
          <span class="flex shrink-0 items-center gap-1.5">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="clearIdleArm = false">再想想</button>
            <button class="btn-seal !px-2.5 !py-2 !text-[11px]" @click="doClearIdle">清理散置</button>
          </span>
        </template>
        <button v-else class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="clearIdleArm = true">
          清理散置
        </button>
      </div>
      <template #footer>
        <button class="btn-seal w-full" @click="idleOpen = false">收 起</button>
      </template>
    </BaseModal>

    <BaseModal :open="forgeOpen" title="凝炼台" @close="forgeOpen = false">
      <!-- 弹窗盖住标题栏的道源,代价与余额须同屏 -->
      <p class="mb-2 text-[11px] leading-relaxed text-ink-faint">{{ refineCostLine(SOUL_REFINE_COST, formatNum(endgame.daoSource)) }}</p>
      <div v-if="refinable.length > 0" class="card-ink max-h-64 divide-y divide-ink/6 overflow-y-auto px-4">
        <div v-for="row in refinable" :key="row.inst.uid" class="flex items-center justify-between gap-2 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-[12px] text-ink-soft">{{ row.name }}</p>
            <p class="flex items-center gap-1.5 truncate text-[10px] text-ink-faint">
              <span
                class="soul-pips"
                :class="{ 'soul-pips--top': row.mark.top }"
                :style="{ '--soul-tone': row.gradeColor }"
                role="img"
                :aria-label="`${row.mark.label}阶`"
              >
                <i v-for="p in row.mark.pips" :key="p" />
              </span>
              将凝出
              <span :style="{ color: row.gradeColor }">{{ row.gradeName }}·{{ row.typeName }}</span>
            </p>
          </div>
          <!-- 二步确认:毁的是原器 -->
          <button
            v-if="pendingRefineUid !== row.inst.uid"
            class="btn-ghost !px-3 !py-2 !text-[11px]"
            :disabled="refineShort.short.m > 0"
            :title="refineShort.reason ?? undefined"
            @click="pendingRefineUid = row.inst.uid"
          >
            {{ refineShort.reason ? `入 炉(${refineShort.reason})` : '入 炉' }}
          </button>
          <div v-else class="flex shrink-0 items-center gap-1.5">
            <button class="btn-ghost !px-2.5 !py-2 !text-[11px]" @click="pendingRefineUid = null">再想想</button>
            <button
              class="btn-seal !px-2.5 !py-2 !text-[11px]"
              :disabled="refineShort.short.m > 0"
              :title="refineShort.reason ?? undefined"
              @click="doRefine(row.inst.uid)"
            >
              确认凝炼
            </button>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-faint">暂无可凝法器</p>
      <template #footer>
        <button class="btn-seal w-full" @click="forgeOpen = false">收 炉</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { goBack } from '@/router/goBack'
  import { formatNum } from '@/utils/format'
  import { modsBriefText, modsText } from '@/data/statNames'
  import { dissolveNote, refineCostLine, soulFlavorText } from '@/ui/soulText'
  import { soulMark } from '@/ui/soulMark'
  import { soulPickSummary, soulPicks } from '@/ui/soulPick'
  import { equipmentTemplate } from '@/data/equipment'
  import { SOUL_SLOTS, soulGradeDef, soulMods, soulName, soulTypeDef, type SoulInstance } from '@/data/souls'
  import { soulGradeTextColor } from '@/ui/soulMark'
  import { canRefine, dissolveSoul, previewSoul, refineEquipment, removeSoul, SOUL_REFINE_COST, wearSoul } from '@/core/soulService'
  import { daoSourceShortfall } from '@/core/daoSource'
  import { endgameGateRealmName, endgameUnlocked } from '@/core/endgameService'
  import { useEndgameStore } from '@/stores/endgame'
  import { useInventoryStore } from '@/stores/inventory'
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  const router = useRouter()
  const endgame = useEndgameStore()
  const inventory = useInventoryStore()
  const refineShort = computed(() => daoSourceShortfall(SOUL_REFINE_COST, endgame.daoSource))

  const unlocked = computed(() => endgameUnlocked())
  const idleOpen = ref(false)
  const forgeOpen = ref(false)
  /** 已展开确认态的行 uid */
  const pendingRefineUid = ref<string | null>(null)
  /** 散去同样二步确认(不可逆) */
  const pendingDissolveUid = ref<string | null>(null)
  /** 清理散置的二次确认态;弹窗关闭即复位 */
  const clearIdleArm = ref(false)

  function doRefine(uid: string): void {
    refineEquipment(uid)
    pendingRefineUid.value = null
  }

  function doDissolve(uid: string): void {
    dissolveSoul(uid)
    pendingDissolveUid.value = null
  }

  /** 还能装几格:槽位按已装配数计,不按散置数 */
  const freeSlots = computed(() => Math.max(0, SOUL_SLOTS - endgame.activeSouls.length))
  /** 建议装配的几枚:只在有空槽时给;分量按既有战力权重算(见 ui/soulPick) */
  const pickReady = computed(() =>
    freeSlots.value > 0 ? soulPicks(idleSouls.value.map(r => r.soul), freeSlots.value).filter(p => p.picked) : []
  )
  const pickNames = computed(() => soulPickSummary(pickReady.value) ?? '')

  /** 择优装配:逐枚走同一个 equipSoul,判据不分叉;槽满即停 */
  function doPickBest(): void {
    for (const p of pickReady.value) {
      if (!wearSoul(p.soul.uid)) break
    }
  }

  /** 清理散置:逐枚走同一个 dissolveSoul,判据不分叉;只动未装配的那些 */
  function doClearIdle(): void {
    clearIdleArm.value = false
    const uids = idleSouls.value.map(r => r.soul.uid)
    for (const uid of uids) dissolveSoul(uid)

  }

  /**
   * 散置器魂:形制与形意在这里算一次。
   *
   * 形意句原先在模板里被调两次(v-if 判一次、渲染一次),而它是纯查表函数 ——
   * 每帧算两遍,且模板里读不出「这两处说的是同一件事」。
   * 魂型印同理:出战槽用大字印(见 soulSeal),散置列表却只有名字,同一页两种读法。
   */
  const idleSouls = computed(() =>
    endgame.soulList
      .filter(s => !endgame.activeSouls.some(a => a.uid === s.uid))
      .map(s => {
        const gradeDef = soulGradeDef(s.grade)
        return {
          soul: s,
          flavor: soulFlavorText(s),
          // 字色、阶位形制、魂型印各算一次:模板里原先 soulColor 调 4 次、soulMark 3 次
          // color 管装饰(魂型印底),textColor 管正文(名字):两端档的原色当正文过不了 AA
          color: gradeDef.color,
          textColor: soulGradeTextColor(s.grade),
          mark: soulMark(s.grade),
          seal: soulTypeDef(s.type)?.seal ?? '魂',
          label: soulName(s)
        }
      })
  )

  const refinable = computed(() => {
    const wearing = new Set(Object.values(inventory.equipped).filter((v): v is string => typeof v === 'string'))
    return inventory.items
      .filter(it => !it.locked && !wearing.has(it.uid) && canRefine(it))
      .map(inst => {
        const preview = previewSoul(inst)
        // 形制与阶位名在此算一次:模板里原先各要查 3 遍
        const gradeDef = soulGradeDef(preview.gradeRank)
        return {
          inst,
          name: equipmentTemplate(inst.templateId)?.name ?? '无名法器',
          typeName: preview.type?.name ?? '器魂',
          gradeRank: preview.gradeRank,
          mark: soulMark(preview.gradeRank),
          gradeName: gradeDef.name,
          gradeColor: soulGradeTextColor(preview.gradeRank)
        }
      })
  })

  /**
   * 装配槽位的行:器魂、字色、形制、印各算一次。
   *
   * 原先是 `slotMark(i)` 一个槽里调 5 次,而它内部还要再查一次 `soulMark(soul.grade)` ——
   * 实际每槽算 10 次;`soulColor` 又调一次。与 TrialPanel / 丹匣那两处同一种毛病:
   * 每帧算十遍,而且模板里读不出这几处说的是同一枚器魂。
   */
  const slotRows = computed(() =>
    Array.from({ length: SOUL_SLOTS }, (_, idx) => {
      const soul = endgame.activeSouls[idx]
      if (!soul) return { index: idx + 1, soul: null, mark: null, color: '', seal: '', label: '' }
      return {
        index: idx + 1,
        soul,
        mark: soulMark(soul.grade),
        color: soulGradeDef(soul.grade).color,
        seal: soulTypeDef(soul.type)?.seal ?? '魂',
        label: soulName(soul)
      }
    })
  )
  /**
   * 散置列表里的词条读数:不带注脚的短版。
   * 每枚魂三四个词条,全带注脚会摊成一百三十多字、把行撑到 156px(实测)。
   * 完整注脚留给「装着看」的场合,列表只报「有哪几样、各多少」。
   */
  function soulModText(soul: SoulInstance): string {
    return modsBriefText(soulMods(soul))
  }
  const activeModText = computed(() => modsText(endgame.soulMods))
</script>
