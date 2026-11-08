/** 背包与装备状态 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ArtifactOwned, EquipmentInstance, EquipSlot, GNum, StatMods } from '@/types'
import { add, gnZero } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { resolveEquipStats } from '@/core/equipGen'
import { mergeMods } from '@/core/statsCalc'
import { useLoreStore } from '@/stores/lore'
import { ARTIFACT_MAX_LEVEL, ARTIFACT_MAX_SLOTS, artifactDef, artifactValue } from '@/data/artifacts'
import { BAG_CAPACITY, EQUIP_AFFIX_HARD_CAP } from '@/data/constants'
import { EQUIP_LEVEL_SANITIZE_CAP } from '@/data/buildings'
import { EQUIP_SLOTS, MAX_EQUIP_TIER, equipmentTemplate } from '@/data/equipment'
import { pillDef } from '@/data/pills'
import { QUALITIES } from '@/data/qualities'
import { affixDef } from '@/data/affixes'
import { asArray, asBoundedGNum, asFiniteNumber, asNumberRecord, asRecord, asStringArray, truncateCodePoints } from '@/utils/saveShape'

export const useInventoryStore = defineStore(
  'inventory',
  () => {
    const items = ref<EquipmentInstance[]>([])
    const equipped = ref<Partial<Record<EquipSlot, string>>>({})
    const pills = ref<Record<string, number>>({})
    const artifacts = ref<ArtifactOwned[]>([])
    /** 已祭炼的法宝(元婴起可佩两件) */
    const equippedArtifacts = ref<string[]>([])

    /**
     * 存档修复:行囊/丹药/法宝坏形会让装备合计与图鉴渲染期抛错。
     * 重复 uid 只留首件:`equippedUids` 是 uid 集合,同号两件会同时算进属性。
     * tier/level/词条 roll 的 NaN 会让 `finalStats` 攻防血归零;
     * affixes 非数组会让背包/详情/重铸读 `.length` 抛错。
     */
    function sanitize(): void {
      const seenUid = new Set<string>()
      const qualityIds = new Set(QUALITIES.map(q => q.id))
      const cleanItems: EquipmentInstance[] = []
      for (const raw of asArray<unknown>(items.value)) {
        if (!raw || typeof raw !== 'object') continue
        const it = raw as Partial<EquipmentInstance>
        // 认不出的模板不丢:界面以「旧物」兜底名显示,玩家可自行处置
        if (typeof it.uid !== 'string' || !it.uid || seenUid.has(it.uid)) continue
        seenUid.add(it.uid)
        const affixes = asArray<{ id: string; roll: number }>(
          it.affixes,
          [],
          a => !!a && typeof a === 'object' && typeof (a as { id?: unknown }).id === 'string'
        )
          .filter(a => !!affixDef(a.id))
          .map(a => ({
            id: a.id,
            // 负 roll 会被 affixValue 当 0 却按满值显示,>1 则超上限
            roll: Math.min(1, asFiniteNumber(a.roll, 0, 0))
          }))
          // 条数也要设界:品质表最高 8 条、洗练只换不增,坏档却能让一件带几千条
          .slice(0, EQUIP_AFFIX_HARD_CAP)
        const rawQuality = it.quality as unknown
        cleanItems.push({
          ...it,
          uid: it.uid,
          templateId: typeof it.templateId === 'string' ? it.templateId : '',
          quality: typeof rawQuality === 'string' && qualityIds.has(rawQuality as never) ? (rawQuality as EquipmentInstance['quality']) : 'mortal',
          tier: Math.min(MAX_EQUIP_TIER, Math.max(1, Math.floor(asFiniteNumber(it.tier, 1, 1)))),
          // 只夹到「基础上限 + 满建筑加成」量级;实际上限由执行侧 equipLevelCap() 把关。
          // 上界取自建筑表推导,不写死数字:炼器台上限一改,这里跟着走。
          level: Math.min(EQUIP_LEVEL_SANITIZE_CAP, Math.max(0, Math.floor(asFiniteNumber(it.level, 0, 0)))),
          affixes,
          locked: it.locked === true,
          reforgeCount: Math.floor(asFiniteNumber(it.reforgeCount, 0, 0)),
          sealedAffixIds: [...new Set(asStringArray(it.sealedAffixIds))].filter(id => affixes.some(a => a.id === id)),
          transferCount: Math.floor(asFiniteNumber(it.transferCount, 0, 0)),
          note: typeof it.note === 'string' && it.note ? truncateCodePoints(it.note, 4) : undefined,
          ...(it.invested && typeof it.invested === 'object'
            ? {
                invested: {
                  dust: Math.floor(asFiniteNumber((it.invested as { dust?: unknown }).dust, 0, 0)),
                  stone: asBoundedGNum((it.invested as { stone?: unknown }).stone)
                }
              }
            : {})
        })
      }
      /*
       * 超容量坏档截断。
       *
       * BAG_CAPACITY 原本只用来判 bagFull(「行囊已满」),从不用来限容;
       * 于是把 items 撑到几千件的坏档会被原样吃下,bagFull 恒为 true,
       * addItem 从此一律 return false —— 玩家再也捡不到装备,且界面要渲染几千行。
       *
       * 截断时优先保住已装备的件(equipped 的原始映射还没被校验,这里只按 uid 认),
       * 其余按读档顺序保留。容量本身就是玩家正常能持有的上限,不构成惩罚。
       */
      if (cleanItems.length > BAG_CAPACITY) {
        const rawEquippedForCap = asRecord<unknown>(equipped.value)
        const keepUid = new Set(
          Object.values(rawEquippedForCap).filter((u): u is string => typeof u === 'string' && u.length > 0)
        )
        const equippedKept = cleanItems.filter(it => keepUid.has(it.uid))
        const restKept = cleanItems.filter(it => !keepUid.has(it.uid))
        const room = Math.max(0, BAG_CAPACITY - equippedKept.length)
        // 保持读档顺序:已装备的与其余的各自有序,合并时按原下标重排
        const keepIds = new Set([...equippedKept, ...restKept.slice(0, room)].map(it => it.uid))
        items.value = cleanItems.filter(it => keepIds.has(it.uid))
      } else {
        items.value = cleanItems
      }
      // 装备栏只留「槽名合法 + 件存在 + 件属该槽 + 未被前面的槽占用」的映射
      const rawEquipped = asRecord<unknown>(equipped.value)
      const validUids = new Set(items.value.map(it => it.uid))
      const usedUids = new Set<string>()
      const fixedEquipped: Partial<Record<EquipSlot, string>> = {}
      for (const slot of EQUIP_SLOTS) {
        const uid = rawEquipped[slot]
        if (typeof uid !== 'string' || !uid || usedUids.has(uid) || !validUids.has(uid)) continue
        const inst = items.value.find(it => it.uid === uid)
        if (!inst || equipmentTemplate(inst.templateId)?.slot !== slot) continue
        fixedEquipped[slot] = uid
        usedUids.add(uid)
      }
      equipped.value = fixedEquipped
      // 丹匣只留认得且数量 > 0 的条目(同 spendPill 吃完即删):野 id 会被道童「寻药」缺口统计当成存量
      pills.value = Object.fromEntries(
        Object.entries(asNumberRecord(pills.value, 0)).filter(
          ([id, n]) => !!pillDef(id) && Math.floor(n) > 0
        )
      )
      // 法宝库:同 defId 只留一条;野 defId 清掉(法宝页 `artifactDef(a.defId)!` 取品质会抛错)
      const seenDef = new Set<string>()
      artifacts.value = asArray<ArtifactOwned>(
        artifacts.value,
        [],
        a => !!a && typeof (a as ArtifactOwned).defId === 'string' && !!artifactDef((a as ArtifactOwned).defId)
      )
        .filter(a => {
          if (seenDef.has(a.defId)) return false
          seenDef.add(a.defId)
          return true
        })
        // 坏重数会绕过满重判断,把祭炼价与悟道点算成 NaN
        .map(a => ({
          defId: a.defId,
          level: Math.min(ARTIFACT_MAX_LEVEL, Math.max(0, Math.floor(asFiniteNumber(a.level, 0, 0))))
        }))
      // 祭炼位:去重、只留在库的、裁到 ARTIFACT_MAX_SLOTS(与 toggleArtifact/applyLoadout 同尺)
      const ownedArtifactIds = new Set(artifacts.value.map(a => a.defId))
      equippedArtifacts.value = [...new Set(asStringArray(equippedArtifacts.value))]
        .filter(id => ownedArtifactIds.has(id))
        .slice(0, ARTIFACT_MAX_SLOTS)
    }

    const equippedUids = computed(() => new Set(Object.values(equipped.value).filter(Boolean) as string[]))

    /**
     * 行囊按「已装备 / 未装备」分成两摞,一趟走完。
     *
     * 原先两个 computed 各 `items.filter(...)` 一遍:满包 120 件时整表被遍历两次,
     * 而两者读的是同一个 `items` 与 `equippedUids` —— 换装时必然同时失效、同时重扫。
     * 现一次分区,两个视图各取一半。
     *
     * `bagFull` 也改读这里的计数:它只关心「满没满」,不必再等一份完整的未装备数组。
     */
    const partitionedItems = computed(() => {
      const owned = equippedUids.value
      const equipped: EquipmentInstance[] = []
      const bag: EquipmentInstance[] = []
      for (const it of items.value) (owned.has(it.uid) ? equipped : bag).push(it)
      return { equipped, bag }
    })

    const equippedItems = computed(() => partitionedItems.value.equipped)

    const bagItems = computed(() => partitionedItems.value.bag)

    const bagFull = computed(() => partitionedItems.value.bag.length >= BAG_CAPACITY)

    /**
     * 已装备件解算一次,平铺与百分比各取一半。
     *
     * 原先 `equipFlats` 与 `equipMods` 各自 `map(equippedItems, resolveEquipStats)` ——
     * 同一件装备在一次响应式失效里被完整解算两遍(含词条排序、品质查表、幂缩放)。
     * 两个 computed 又都读 `equippedItems`,换一件装备就同时失效、同时重算,两遍必挨在一起。
     *
     * 现合成一份 `equippedResolved`,两个派生各读它 —— 解算次数减半,读数逐位不变。
     */
    const equippedResolved = computed(() => equippedItems.value.map(it => resolveEquipStats(it)))

    /** 已装备件的平铺数值合计 */
    const equipFlats = computed(() => {
      const out = { attack: gnZero() as GNum, defense: gnZero() as GNum, maxHp: gnZero() as GNum }
      for (const r of equippedResolved.value) {
        out.attack = add(out.attack, r.flats.attack)
        out.defense = add(out.defense, r.flats.defense)
        out.maxHp = add(out.maxHp, r.flats.maxHp)
      }
      return out
    })

    /** 已装备件 + 法宝被动的百分比属性合计 */
    const equipMods = computed<StatMods>(() => {
      const sources: StatMods[] = equippedResolved.value.map(r => r.mods)
      for (const art of currentArtifacts.value) {
        const def = artifactDef(art.defId)
        if (!def) continue
        // 与背包卡片、图鉴、战斗同源:artifactValue
        sources.push(artifactValue(def, art.level).passive)
      }
      return mergeMods(sources)
    })

    /**
     * 真正生效的随身法宝(认得出、在库、不超法宝位上限);属性汇总与战斗快照从这里读。
     * 裁到 `ARTIFACT_MAX_SLOTS`(同 `sanitize`)而非境界槽位:境界那道由 `player.sanitize` 按 `artifactSlotsFor` 收紧,
     * store 之间不互相 import,免得 inventory 与 player 成环。
     */
    const currentArtifacts = computed<ArtifactOwned[]>(() =>
      equippedArtifacts.value
        .map(id => artifacts.value.find(a => a.defId === id))
        .filter((a): a is ArtifactOwned => a !== undefined)
        .slice(0, ARTIFACT_MAX_SLOTS)
    )

    function findItem(uid: string): EquipmentInstance | undefined {
      return items.value.find(it => it.uid === uid)
    }

    /** 加入装备;背包满则返回 false(由调用方决定折算) */
    function addEquipment(inst: EquipmentInstance): boolean {
      if (bagFull.value) return false
      items.value = [...items.value, inst]
      return true
    }

    function removeEquipment(uid: string): void {
      items.value = items.value.filter(it => it.uid !== uid)
      for (const slot in equipped.value) {
        if (equipped.value[slot as EquipSlot] === uid) {
          const next = { ...equipped.value }
          delete next[slot as EquipSlot]
          equipped.value = next
        }
      }
    }

    function replaceItem(inst: EquipmentInstance): void {
      items.value = items.value.map(it => (it.uid === inst.uid ? inst : it))
    }

    function equip(uid: string, slot: EquipSlot): void {
      equipped.value = { ...equipped.value, [slot]: uid }
      // 记「亲手用过」:图鉴收录深度的一档(见 ui/codex)
      const inst = findItem(uid)
      if (inst) useLoreStore().noteEquipUsed(inst.templateId)
    }

    function unequip(slot: EquipSlot): void {
      const next = { ...equipped.value }
      delete next[slot]
      equipped.value = next
    }

    function addPill(id: string, n: number): void {
      if (!pillDef(id)) return
      if (!Number.isFinite(n) || n <= 0) return
      const amount = Math.floor(n)
      if (amount <= 0) return
      pills.value = { ...pills.value, [id]: (pills.value[id] ?? 0) + amount }
    }

    function spendPill(id: string, n = 1): boolean {
      if (!Number.isFinite(n) || n < 0) return false
      const amount = Math.floor(n)
      const have = pills.value[id] ?? 0
      if (have < amount) return false
      const next = { ...pills.value }
      if (have - amount <= 0) delete next[id]
      else next[id] = have - amount
      pills.value = next
      return true
    }

    /**
     * 获得法宝;重复返回 false(由调用方折算)。
     * autoEquip=false 只入囊不祭(「整世不祭法宝」之题);破题只由手动祭炼触发(loot.ts 的 taboo 判定)。
     */
    function addArtifact(defId: string, autoEquip = true): boolean {
      if (!artifactDef(defId)) return false
      if (artifacts.value.some(a => a.defId === defId)) return false
      artifacts.value = [...artifacts.value, { defId, level: 0 }]
      if (autoEquip && equippedArtifacts.value.length === 0) equippedArtifacts.value = [defId]
      return true
    }

    /** 法宝升一重;野 id/未拥有/满重返回 false */
    function levelUpArtifact(defId: string): boolean {
      const owned = artifacts.value.find(a => a.defId === defId)
      if (!owned || owned.level >= ARTIFACT_MAX_LEVEL) return false
      artifacts.value = artifacts.value.map(a => (a.defId === defId ? { ...a, level: a.level + 1 } : a))
      return true
    }

    /** 祭炼/收回法宝;槽满时替换最早佩戴的一件 */
    function toggleArtifact(defId: string, maxSlots: number): 'equipped' | 'unequipped' | 'replaced' | 'rejected' {
      if (!artifactDef(defId) || !artifacts.value.some(a => a.defId === defId)) return 'rejected'
      if (equippedArtifacts.value.includes(defId)) {
        equippedArtifacts.value = equippedArtifacts.value.filter(id => id !== defId)
        return 'unequipped'
      }
      if (!Number.isFinite(maxSlots)) return 'rejected'
      const slots = Math.min(ARTIFACT_MAX_SLOTS, Math.floor(maxSlots))
      if (slots < 1) return 'rejected'
      if (equippedArtifacts.value.length < slots) {
        equippedArtifacts.value = [...equippedArtifacts.value, defId]
        return 'equipped'
      }
      /**
       * 替下顺序须与 data/artifacts.artifactEvictedBy(界面槽位画法)一致。
       * 列表可能已超编(境界跌落/内存直塞):留尾部 slots - 1 件再补新件,不能只 slice(1)。
       * slots === 1 时 `slice(-0)` 返回整条,故单独取空。
       */
      const kept = slots > 1 ? equippedArtifacts.value.slice(-(slots - 1)) : []
      equippedArtifacts.value = [...kept, defId]
      return 'replaced'
    }

    return {
      items,
      equipped,
      pills,
      artifacts,
      equippedArtifacts,
      equippedItems,
      equippedUids,
      bagItems,
      bagFull,
      equipFlats,
      equipMods,
      currentArtifacts,
      findItem,
      addEquipment,
      removeEquipment,
      replaceItem,
      equip,
      unequip,
      addPill,
      spendPill,
      addArtifact,
      levelUpArtifact,
      toggleArtifact,
      sanitize
    }
  },
  { persist: persistConfig('inventory') }
)
