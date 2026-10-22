/** 背包与装备状态 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ArtifactOwned, EquipmentInstance, EquipSlot, GNum, StatMods } from '@/types'
import { add, gn, gnZero } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { resolveEquipStats } from '@/core/equipGen'
import { mergeMods } from '@/core/statsCalc'
import { useLoreStore } from '@/stores/lore'
import { ARTIFACT_MAX_LEVEL, ARTIFACT_MAX_SLOTS, artifactDef, artifactValue } from '@/data/artifacts'
import { BAG_CAPACITY, EQUIP_MAX_LEVEL_BASE } from '@/data/constants'
import { EQUIP_SLOTS, MAX_EQUIP_TIER, equipmentTemplate } from '@/data/equipment'
import { pillDef } from '@/data/pills'
import { QUALITIES } from '@/data/qualities'
import { affixDef } from '@/data/affixes'
import { asArray, asFiniteNumber, asNumberRecord, asRecord, asStringArray } from '@/utils/saveShape'

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
     * 存档修复:行囊/丹药/法宝被写坏时,装备合计与图鉴会在渲染期抛错。
     *
     * 另把重复 uid 的件只留先出现的一件:`equippedUids` 是 uid 集合,两件同号时
     * 一次装备会让**两件**同时算进属性(平白翻倍),而两件又都从行囊里消失 ——
     * 玩家既看不见它们,又拿不到它们本该给的那一份。
     *
     * 每一件还要逐字段修形 —— 这是伤害面最大的一处:
     * - `tier`/`level` 写成 `NaN` 会让 `powerScale`/`factor` 一路算出 NaN,
     *   而 `finalStats` 的攻防血整份变成 0 —— 玩家看着装备还在,人却打不动任何东西;
     * - 词条 `roll` 写成 `NaN` 同样污染 `attackPct` 之类的加成,把总属性打成 0;
     * - `affixes` 不是数组时,背包、详情、重铸三处读 `.length` 当场抛错白屏。
     * 认不出的品质/词条 id 一并清掉:它们算不出词条,只占存档。
     */
    function sanitize(): void {
      const seenUid = new Set<string>()
      const qualityIds = new Set(QUALITIES.map(q => q.id))
      const cleanItems: EquipmentInstance[] = []
      for (const raw of asArray<unknown>(items.value)) {
        if (!raw || typeof raw !== 'object') continue
        const it = raw as Partial<EquipmentInstance>
        // 认不出的模板**不丢**:界面对这类件已有「旧物」兜底名(版本回退/模板改名时),
        // 丢掉就是无声的档案损失;它只是穿不上,留着玩家还能自己处置
        if (typeof it.uid !== 'string' || !it.uid || seenUid.has(it.uid)) continue
        seenUid.add(it.uid)
        const affixes = asArray<{ id: string; roll: number }>(
          it.affixes,
          [],
          a => !!a && typeof a === 'object' && typeof (a as { id?: unknown }).id === 'string'
        )
          // 认不出的词条 id 不产生任何数值,也不该在「词条 N/M」里占一格
          .filter(a => !!affixDef(a.id))
          .map(a => ({
            id: a.id,
            // 掷点越界夹回 [0,1]:负数会被 affixValue 当成 0 却仍按满值显示,>1 则凭空超上限
            roll: Math.min(1, asFiniteNumber(a.roll, 0, 0))
          }))
        const rawQuality = it.quality as unknown
        cleanItems.push({
          ...it,
          uid: it.uid,
          templateId: typeof it.templateId === 'string' ? it.templateId : '',
          quality: typeof rawQuality === 'string' && qualityIds.has(rawQuality as never) ? (rawQuality as EquipmentInstance['quality']) : 'mortal',
          tier: Math.min(MAX_EQUIP_TIER, Math.max(1, Math.floor(asFiniteNumber(it.tier, 1, 1)))),
          // 强化上限随洞府炼器台抬高,故这里只夹到「基础上限 + 满建筑加成」的量级:
          // 具体上限由 equipLevelCap() 在执行侧把关,读档只需挡住 NaN/负数这种会把数值算穿的坏数
          level: Math.min(EQUIP_MAX_LEVEL_BASE + 10, Math.max(0, Math.floor(asFiniteNumber(it.level, 0, 0)))),
          affixes,
          locked: it.locked === true,
          reforgeCount: Math.floor(asFiniteNumber(it.reforgeCount, 0, 0)),
          sealedAffixIds: [...new Set(asStringArray(it.sealedAffixIds))].filter(id => affixes.some(a => a.id === id)),
          transferCount: Math.floor(asFiniteNumber(it.transferCount, 0, 0)),
          note: typeof it.note === 'string' && it.note ? it.note.slice(0, 4) : undefined,
          ...(it.invested && typeof it.invested === 'object'
            ? {
                invested: {
                  dust: Math.floor(asFiniteNumber((it.invested as { dust?: unknown }).dust, 0, 0)),
                  stone: gn((it.invested as { stone?: unknown }).stone as never)
                }
              }
            : {})
        })
      }
      items.value = cleanItems
      /**
       * 装备栏要按「槽位与件」双向校验,不能只当普通 record 收下:
       * - 槽名认不得(旧版/手改):该 uid 会被排除出行囊,却没有任何槽卡显示它 —— 装备凭空消失
       * - uid 对不上任何一件(ghost):槽位看着已占,点进去却是空的
       * - 件与槽不符(把武器塞进头冠):属性照算,槽卡与候选列表却各说各话
       * - 同一件占两个槽:一件装备被当成两个槽位用,行囊里还看不见
       * 只保留「槽名合法 + 件存在 + 件属该槽 + 未被前面的槽占用」的映射。
       */
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
      /**
       * 丹匣按 id 认丹:认不出的 id 在丹匣/坊市/修行快捷栏里都画不出来,
       * 却会一直留在存档里,并被道童「寻药」的缺口统计当成存量(凭空少派一趟)。
       * 归零的条目也不必留 —— spendPill 吃完就删,零条只可能来自坏档。
       */
      pills.value = Object.fromEntries(
        Object.entries(asNumberRecord(pills.value, 0)).filter(
          ([id, n]) => !!pillDef(id) && Math.floor(n) > 0
        )
      )
      /**
       * 同一件法宝只该有一条:库里两条同 defId 会让「是否已拥有」与祭炼判定各看各的。
       * 认不出的 defId 一并清掉 —— 法宝页按 `artifactDef(a.defId)!` 取品质排序,
       * 野 id 会在渲染期对 undefined 取 quality 当场抛错;而且它本就不产生任何被动。
       */
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
        // 重数也要逐条修形:坏档里的 'x'/NaN 会绕过满重判断,祭炼价算成 NaN,
        // 点一次还把悟道点写成 NaN;夹回 [0, ARTIFACT_MAX_LEVEL] 后价与被动同源。
        .map(a => ({
          defId: a.defId,
          level: Math.min(ARTIFACT_MAX_LEVEL, Math.max(0, Math.floor(asFiniteNumber(a.level, 0, 0))))
        }))
      /**
       * 祭炼位:同一个 id 写两遍会让被动算两次(实际只有一件);
       * 条数超过 ARTIFACT_MAX_SLOTS(坏档写 5 件)则会让每一件被动一起生效 ——
       * 槽位上限是境界闸(toggleArtifact/applyLoadout 都按它裁),读档同一把尺。
       */
      // 祭炼位同样按 id 认物:清掉的野法宝不该继续占格(它既不产生被动,也画不出卡)
      const ownedArtifactIds = new Set(artifacts.value.map(a => a.defId))
      equippedArtifacts.value = [...new Set(asStringArray(equippedArtifacts.value))]
        .filter(id => ownedArtifactIds.has(id))
        .slice(0, ARTIFACT_MAX_SLOTS)
    }

    const equippedUids = computed(() => new Set(Object.values(equipped.value).filter(Boolean) as string[]))

    const equippedItems = computed(() => items.value.filter(it => equippedUids.value.has(it.uid)))

    const bagItems = computed(() => items.value.filter(it => !equippedUids.value.has(it.uid)))

    const bagFull = computed(() => bagItems.value.length >= BAG_CAPACITY)

    /** 已装备件的平铺数值合计 */
    const equipFlats = computed(() => {
      const out = { attack: gnZero() as GNum, defense: gnZero() as GNum, maxHp: gnZero() as GNum }
      for (const it of equippedItems.value) {
        const r = resolveEquipStats(it)
        out.attack = add(out.attack, r.flats.attack)
        out.defense = add(out.defense, r.flats.defense)
        out.maxHp = add(out.maxHp, r.flats.maxHp)
      }
      return out
    })

    /** 已装备件 + 法宝被动的百分比属性合计 */
    const equipMods = computed<StatMods>(() => {
      const sources: StatMods[] = equippedItems.value.map(it => resolveEquipStats(it).mods)
      for (const art of currentArtifacts.value) {
        const def = artifactDef(art.defId)
        if (!def) continue
        // 被动按「品阶 × 祭炼」放大 —— 与背包卡片、图鉴、战斗读同一份(artifactValue)
        sources.push(artifactValue(def, art.level).passive)
      }
      return mergeMods(sources)
    })

    /**
     * 随身法宝里**真正生效**的那几件 —— 认得出的、在库的,且不超法宝位上限。
     *
     * 上限这道裁是从前的漏网处:`sanitize`(读档)、`toggleArtifact`(替换)、
     * `applyLoadout`(切换构筑)、忆战快照都按槽位裁过了,而这里是**属性汇总与
     * 战斗快照的读入口** —— 偏偏没裁。坏档或内存直塞写进三件时,第三件的被动
     * 与神通会一起进 `equipMods`、一起进 `buildPlayerSnap`、一起进流派检测:
     * 实测三件 maxHp 法宝(5% + 21.6% + 18%)在两位之下给出 51.9% 而非 44.6%,
     * 面板、战斗与忆战对不上账,而玩家从未点过那个按钮。
     *
     * 裁到 `ARTIFACT_MAX_SLOTS` 而非境界槽位:这一层与 `sanitize` 的读档裁剪同尺
     * (硬上限),境界那一道(1 位 / 2 位)由 `player.sanitize` 按 `artifactSlotsFor`
     * 收紧 —— store 之间不互相 import,免得 inventory 与 player 结成环。
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
      // 「亲手用过」记在图鉴的见闻里:收录深度因此有一档由玩家自己推进(见 ui/codex)
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
     *
     * autoEquip=false 时只入囊、不自动祭上 —— 玩家本世立下「整世不祭法宝」之题时
     * 走这条路,否则系统替他祭出第一件,等于他一句话没说到底(玩家反馈两条)。
     * 手动祭炼(loot.ts)才交给 taboo 判定,破题必须是玩家自己的选择。
     */
    function addArtifact(defId: string, autoEquip = true): boolean {
      if (!artifactDef(defId)) return false
      if (artifacts.value.some(a => a.defId === defId)) return false
      artifacts.value = [...artifacts.value, { defId, level: 0 }]
      if (autoEquip && equippedArtifacts.value.length === 0) equippedArtifacts.value = [defId]
      return true
    }

    /** 升级一件已拥有且未满重的法宝;拒绝野 id/未拥有/满重,返回是否真的升了一重 */
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
       * 替下第一件 —— 与界面槽位的画法同一份顺序(见 data/artifacts.artifactEvictedBy):
       * 玩家看到的第一格,就是按下之后真的让位的那一件。
       *
       * 结果一律裁到 `slots` 条:进入这里时列表可能**本来就超编**(境界跌落、
       * 或未经 sanitize 的内存直塞),旧的 `slice(1)` 只去掉一件、余下的照旧生效,
       * 于是「槽位上限」在这条路上形同虚设。裁到 `slots - 1` 再补上新的这一件。
       *
       * 留下的是**最近祭炼的**那几件(`slice(-(slots-1))`,尾部),被挤掉的是列表
       * 前端的旧件 —— 与「替下最早祭炼的一件」同一条语义。`slots === 1` 时
       * `slice(-0)` 会返回整条,故单独取空数组。
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
