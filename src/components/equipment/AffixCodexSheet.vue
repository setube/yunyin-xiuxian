<template>
  <BaseModal
    :open="open"
    :title="focus === null ? '词条全表' : (focusDef?.name ?? '词条')"
    closable
    @close="emit('close')"
  >
    <!--
      browsable:从自动重铸点名弹框(affixId 具体到某条)时只给这一条,不给「回全表」;
      从「词条表」入口(affixId=null)才给全表。
    -->
    <div class="max-h-[62vh] overflow-y-auto pr-1">
      <AffixCodexList :focus="focus" :browsable="browsable" @update:focus="changeFocus" />
    </div>
    <template #footer>
      <div v-if="targetable && focus !== null" class="grid grid-cols-2 gap-2">
        <button class="btn-ghost" :disabled="!selected && !canSelect" @click="emit('toggle-target', focus)">
          {{ selected ? '取消自动重铸目标' : '设为自动重铸目标' }}
        </button>
        <button class="btn-seal" @click="emit('close')">收 下</button>
      </div>
      <button v-else class="btn-seal w-full" @click="emit('close')">收 下</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { affixDef } from '@/data/affixes'
  import BaseModal from '@/components/common/BaseModal.vue'
  import AffixCodexList from './AffixCodexList.vue'

  const props = defineProps<{
    open: boolean
    /** null = 全表;具体某个词条 = 点它名字弹出来的那一条 */
    affixId: string | null
    /**
     * 打开时定死的浏览权:词条表入口=true(可点行进单条、可回表);
     * 自动重铸点名=false(只挂这一条)。定了就不随内部翻页动 ——
     * 否则先看全表再点某条,browsable 跟着 affixId 翻转,整张表会塌成一条。
     */
    browsable: boolean
    /** 只在自动重铸语境传:页脚多一个「设为目标/取消」 */
    targetable?: boolean
    /** 这条当前是不是已被设为自动重铸目标(决定按钮文案与可否再设) */
    selected?: boolean
    /** 目标还没满三个时才能再设(满了那个位子给「取消」留着) */
    canSelect?: boolean
  }>()
  const emit = defineEmits<{
    close: []
    'toggle-target': [id: string]
    /** 表内翻页同步给父层:父层拿它算 selected/canSelect,别拿 null 当空 */
    'update:affixId': [id: string | null]
  }>()

  /** 表内只能有一页:要么全表,要么某一条;每次打开都从头来 */
  const focus = ref<string | null>(null)
  watch(
    () => props.open,
    (o) => {
      if (o) focus.value = props.affixId
    },
    { immediate: true }
  )

  /** 表内翻页(点行进单条 / 回全表)都要让父层知道在看的哪条,弹框里的目标开关才数得准 */
  function changeFocus(v: string | null): void {
    if (focus.value === v) return
    focus.value = v
    emit('update:affixId', v)
  }

  const focusDef = computed(() => (focus.value ? affixDef(focus.value) : undefined))
</script>
