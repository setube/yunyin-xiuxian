<template>
  <div class="card-ink flex flex-col px-3 py-3" :class="[flashing ? 'card-flash' : '', featured ? 'px-4 py-3.5' : '']" @animationend.self="flashing = false">
    <div class="flex items-start gap-2.5">
      <!-- 建筑印章:每座建筑在数据里都配了图标(home/wind/flame/hammer/sprout/book/paw),此前一张都没画 -->
      <span
        class="relative grid shrink-0 place-items-center rounded-md transition-colors"
        :class="[sealCls, featured ? 'h-11 w-11' : 'h-9 w-9']"
      >
        <GameIcon :name="props.def.icon" :size="featured ? 22 : 18" />
        <!-- 境界闸门未开:右上角落一把小锁,整印转金灰 -->
        <GameIcon v-if="locked" name="lock" :size="9" class="absolute -bottom-0.5 -right-0.5 rounded-full bg-paper p-[1px] text-gold-ink/80" />
      </span>
      <div class="min-w-0 grow">
        <p class="flex items-start justify-between gap-2">
          <!--
            名字不做 truncate:满级/辖限徽标(「·圆满/·辖限」)会把窄卡行宽吃光,
            聚灵阵、炼丹炉这类名字就缩成「聚…」 —— 宁可换行,不许省略(用户反馈)。
          -->
          <span class="min-w-0 grow font-kai leading-snug" :class="[featured ? 'text-[15px]' : 'text-[14px]', level > 0 ? 'text-ink' : 'text-ink-soft']">{{ props.def.name }}</span>
          <span
            :key="level"
            class="shrink-0 rounded px-1.5 py-0.5 text-[10px] animate-ink-pop"
            :class="level > 0 ? (atMax ? 'bg-gold-ink/10 text-gold-ink' : atGateCap ? 'bg-amber-ink/10 text-amber-ink' : 'text-ink-faint') : 'text-ink-faint'"
          >
            {{ level > 0 ? `${level}/${cap} 级` + (atMax ? '·圆满' : atGateCap ? '·辖限' : '') : '未启用' }}
          </span>
        </p>
      </div>
    </div>
    <p class="mt-2 grow text-[11px] leading-relaxed text-ink-faint">
      {{ level > 0 ? props.def.effectText(level) : props.def.desc }}
    </p>
    <!-- 词条不写进 effectText:洞府的修速、藏经阁的战斗修为曾经因此漏掉 -->
    <p v-if="modLine" class="mt-1 text-[11px] leading-relaxed text-azure tabular">{{ modLine }}</p>
    <!-- 灵兽园:把当前相伴的灵兽报在园子里 —— 别的建筑都是数值,这里是活物 -->
    <p v-if="beastCompanionName" class="mt-1 flex items-center gap-1 text-[10px] text-jade">
      <GameIcon name="paw" :size="11" />居园相伴 · {{ beastCompanionName }}
    </p>
    <button class="btn-ghost mt-2 w-full !py-1.5 !text-[12px]" :disabled="!info.canUpgrade" @click="upgradeBuilding(props.def.id)">
      <!--
        数与量词必须黏在一起:窄屏(320)上卡片只有 ~140px,浏览器会在数字与「石」之间断行,
        于是按钮读成「升级 · 2,798 / 石 50铁」—— 单价被拆成两半。
        每个「数 + 量词」各自 nowrap,换行只发生在分隔符处。

        外面这层 span 也是必须的:btn-ghost 是 flex 容器,散落的文本节点会各自成为
        flex item 并**竖着堆**(实测直接把「升 / 级 / · / 317 石」排成一列)。
        收进一个 inline 文本块里,它们才按普通行内规则折行。
      -->
      <template v-if="info.canUpgrade">
        <span class="leading-tight">
          <span class="whitespace-nowrap">{{ buildingActLabel(level) }} ·</span>
          <span class="whitespace-nowrap">{{ formatGN(info.stone) }} 石</span>
          <span v-if="info.ore > 0" class="whitespace-nowrap">· {{ info.ore }} 铁</span>
        </span>
      </template>
      <template v-else>
        <span v-if="locked" class="inline-flex items-center gap-1.5"><GameIcon name="lock" :size="11" />{{ info.reason }}</span>
        <template v-else>{{ info.reason }}</template>
      </template>
    </button>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { BuildingDef } from '@/types'
  import { useDongfuStore } from '@/stores/dongfu'
  import { usePlayerStore } from '@/stores/player'
  import { petDef } from '@/data/pets'
  import GameIcon from '@/components/common/GameIcon.vue'
  import { buildingUpgradeInfo, upgradeBuilding } from '@/core/buildingService'
  import { modsText } from '@/ui/statNames'
  import { buildingActLabel } from '@/ui/buildingText'
  import { formatGN } from '@/utils/format'

  const props = withDefaults(defineProps<{ def: BuildingDef; featured?: boolean }>(), { featured: false })

  const dongfu = useDongfuStore()

  const level = computed(() => dongfu.levels[props.def.id] ?? 0)
  /** 实际可达上限:洞府全局闸门与自身品类上限取小,洞府卡展现的是"提升到什么档"的依据 */
  const cap = computed(() => dongfu.buildingCap(props.def.id))
  const info = computed(() => buildingUpgradeInfo(props.def.id))
  /** 未建且不可升 = 被境界闸门锁着(等级 0 时不可升只可能是境界不足,满级/辖限都要求 lv>0) */
  const locked = computed(() => level.value === 0 && !info.value.canUpgrade)
  /** 灵兽园联动:洞府与宠物两系统彼此看见(只对 beast 这一座特例,其它建筑不理会) */
  const player = usePlayerStore()
  const beastCompanionName = computed(() =>
    props.def.id === 'beast' && player.petId ? petDef(player.petId)?.name : undefined
  )
  /** 品类满级:金彩「圆满」 */
  const atMax = computed(() => level.value > 0 && level.value >= props.def.maxLevel)
  /** 被洞府辖限(没到品类上限但已到 mansion 抬的档):琥珀「辖限」 */
  const atGateCap = computed(() => level.value > 0 && !atMax.value && level.value >= cap.value)
  /** 印章三态:已建朱砂 / 未建墨灰 / 被锁金灰 */
  const sealCls = computed(() => {
    if (locked.value) return 'bg-gold-ink/8 text-gold-ink/50'
    return level.value > 0 ? 'bg-cinnabar/10 text-cinnabar' : 'bg-ink/5 text-ink-faint'
  })
  /** 这一级真正进属性的词条。只在已建造时显示,避免和未启用时的 desc 叠在一起。 */
  const modLine = computed(() => {
    if (level.value <= 0 || !props.def.mods) return ''
    return modsText(props.def.mods(level.value))
  })

  // 升级落成:整卡金光一闪(动画播完自清)
  const flashing = ref(false)
  watch(level, (nv, ov) => {
    if (nv > ov) flashing.value = true
  })
</script>
