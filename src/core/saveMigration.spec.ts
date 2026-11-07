/**
 * 旧版存档迁移:v1 单法宝位(`equippedArtifact`)→ v2 多法宝位(`equippedArtifacts`)。
 * 两个入口:启动时 `migrateLocalSchema` 就地升级本机分片,并把旧明文档转成密文;
 * 导入时 `save.ts` 的 migrate 按 version 链式升级。
 * 故障注入:让 migrateInventorySlice 丢掉旧值(或保留 equippedArtifact),第一条红;
 * 去掉 migrateLocalSchema 里的 encryptSave,密文那条红。
 *
 * 灵草五品(`migrateHerbSlice`)此前一条测试都没有 —— 它动的是玩家资源,
 * 且是「同版本形状迁移、恒执行」,比只跑一次的法宝位迁移更容易被后续改动碰坏。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import {
  SAVE_VERSION,
  clearAllSave,
  dropPendingWrites,
  migrateHerbSlice,
  migrateInventorySlice,
  migrateLocalSchema,
  storageKey
} from '@/utils/storage'
import { decryptSave, encryptSave, readSaveText } from '@/utils/crypto'
import { readFileSync } from 'node:fs'
import { importSaveText } from './save'
import { useInventoryStore } from '@/stores/inventory'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'

function installStorage(): Map<string, string> {
  const disk = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
    clear: () => disk.clear(),
    key: () => null,
    length: 0
  })
  return disk
}

function bootStores(): void {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  createApp({ render: () => null }).use(pinia)
  setActivePinia(pinia)
}

const LEGACY_V1 = {
  items: [{ uid: 'u1', templateId: 'w_zhuqing', quality: 'fine', tier: 1, level: 0, affixes: [] }],
  equipped: { weapon: 'u1' },
  pills: {},
  artifacts: [{ defId: 'af_youming', level: 2 }],
  equippedArtifact: 'af_youming'
}

describe('迁移 · v1 单法宝位 → v2 多法宝位', () => {
  it('旧值搬进新字段,旧字段清掉', () => {
    const next = migrateInventorySlice(structuredClone(LEGACY_V1))
    expect(next.equippedArtifacts, '旧法宝没搬过来 —— 玩家的法宝位会空着').toEqual(['af_youming'])
    expect('equippedArtifact' in next, '旧字段留在档里,会反复参与后续迁移').toBe(false)
    expect(next.items, '其它字段不该被动').toEqual(LEGACY_V1.items)
  })

  it('已经是新形状的原样返回(幂等)', () => {
    const v2 = { equippedArtifacts: ['af_a', 'af_b'], items: [] }
    const first = migrateInventorySlice(structuredClone(v2))
    expect(first).toEqual(v2)
    expect(migrateInventorySlice(structuredClone(first)), '跑第二遍不该变样').toEqual(v2)
  })

  it('旧字段是空串/垃圾时,新字段该是空数组而不是垃圾', () => {
    expect(migrateInventorySlice({ equippedArtifact: '' }).equippedArtifacts).toEqual([])
    expect(migrateInventorySlice({ equippedArtifact: 42 }).equippedArtifacts).toEqual([])
    expect(migrateInventorySlice({}).equippedArtifacts).toEqual([])
  })
})

describe('迁移 · 灵草单标量 → 五品分账', () => {
  const herbMap = (out: Record<string, unknown>): Record<string, number> =>
    out.herbByGrade as Record<string, number>

  it('旧档的标量整份落进凡品(品 1),旧字段清掉', () => {
    const out = migrateHerbSlice({ herb: 300 })
    expect(herbMap(out)[1], '标量没搬进品 1 —— 玩家的草会凭空少 300').toBe(300)
    expect(herbMap(out)[2]).toBe(0)
    expect(herbMap(out)[5]).toBe(0)
    expect('herb' in out, '旧字段留在档里,下次迁移又会再加一遍').toBe(false)
  })

  /*
   * 已有分账 + 还残留标量:两者要**相加**,不是用标量盖掉分账。
   * 这条路只有「手改存档」或「旧版写过一半」才会走到,但盖掉就是凭空吞资源。
   */
  it('分账与标量并存时相加,不互相覆盖', () => {
    const out = migrateHerbSlice({ herb: 100, herbByGrade: { 1: 7, 2: 30, 3: 40 } })
    expect(herbMap(out)[1], '标量该加到品 1 上').toBe(107)
    expect(herbMap(out)[2], '高品分账不该被标量迁移冲掉').toBe(30)
    expect(herbMap(out)[3]).toBe(40)
  })

  it('负数标量按 0 处理,不产生负库存', () => {
    const out = migrateHerbSlice({ herb: -100 })
    expect(herbMap(out)[1], '负数标量会变成负的草').toBe(0)
  })

  /*
   * 负标量 + 已有分账:走的是 `hasMap && scalar <= 0` 的提前返回分支,
   * 于是 `herb` 原样留着、没被清掉。下游 sanitize 会把它丢掉,
   * 但迁移层的契约是「清掉旧字段」—— 留着它,下次迁移会再看到这个 -100。
   * 这一条钉住提前返回分支的行为,不论将来是清掉还是留着,都必须是有意的。
   */
  it('负标量 + 已有分账:旧字段要么清掉,要么按 0 搬,不许原位留着', () => {
    const out = migrateHerbSlice({ herb: -100, herbByGrade: { 1: 5 } })
    expect('herb' in out, '负数旧标量留在档里,下次迁移还会再看见它').toBe(false)
    expect(herbMap(out)[1], '已有分账不该被负标量冲掉').toBe(5)
  })

  it('标量是 NaN / 字符串时按 0 处理', () => {
    expect(herbMap(migrateHerbSlice({ herb: Number.NaN }))[1]).toBe(0)
    expect(herbMap(migrateHerbSlice({ herb: '300' }))[1]).toBe(0)
  })

  it('已有合法分账且无标量时原样返回(幂等)', () => {
    const fresh = { herbByGrade: { 1: 10, 2: 20, 3: 0, 4: 0, 5: 0 } }
    expect(migrateHerbSlice(structuredClone(fresh))).toEqual(fresh)
  })

  it('跑第二遍不该变样', () => {
    const first = migrateHerbSlice({ herb: 300 })
    expect(migrateHerbSlice(structuredClone(first))).toEqual(first)
  })

  it('空白对象补出全零分账', () => {
    const out = migrateHerbSlice({})
    expect(herbMap(out)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })
})

describe('迁移 · 启动时就地升级本机分片', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
    dropPendingWrites()
    clearAllSave()
  })

  it('旧明文档被升级并转成密文', () => {
    localStorage.setItem(storageKey('inventory'), JSON.stringify(LEGACY_V1))
    migrateLocalSchema()
    const raw = localStorage.getItem(storageKey('inventory'))!
    expect(raw, '迁移后的分片必须落密文').not.toContain('af_youming')
    const back = JSON.parse(decryptSave(raw)!)
    expect(back.equippedArtifacts).toEqual(['af_youming'])
    expect('equippedArtifact' in back).toBe(false)
  })

  it('分片是垃圾时不动它、也不抛(交由损坏扫描兜底)', () => {
    localStorage.setItem(storageKey('inventory'), '这不是 JSON')
    expect(() => migrateLocalSchema()).not.toThrow()
    expect(localStorage.getItem(storageKey('inventory'))).toBe('这不是 JSON')
  })

  it('其它分片还是明文的老档,也读得出来(迁移只碰 inventory,但读取要认明文)', () => {
    // v1 档分片全是明文;迁移只把 inventory 转密文,其余靠 readSaveText 的明文回退读回
    // (明文被误当密文会解出乱码)
    localStorage.setItem(storageKey('player'), JSON.stringify({ major: 6, age: 300 }))
    localStorage.setItem(storageKey('inventory'), JSON.stringify(LEGACY_V1))
    migrateLocalSchema()
    bootStores()
    expect(usePlayerStore().major, '明文 player 分片没读回来').toBe(6)
    expect(useInventoryStore().equippedArtifacts).toEqual(['af_youming'])
  })

  it('已是新档的分片不再重写:迁移 no-op 时不重复加密落盘(不再白付 AES/parse)', () => {
    // 无旧字段时 migrateLocalSchema 不得回写分片:密文含随机盐,重加密必变字节
    const inv = { equippedArtifacts: ['af_youming'] }
    const res = { herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 }, ore: 1 }
    localStorage.setItem(storageKey('inventory'), encryptSave(JSON.stringify(inv)))
    localStorage.setItem(storageKey('resources'), encryptSave(JSON.stringify(res)))
    const invBefore = localStorage.getItem(storageKey('inventory'))!
    const resBefore = localStorage.getItem(storageKey('resources'))!
    migrateLocalSchema()
    expect(localStorage.getItem(storageKey('inventory'))).toBe(invBefore)
    expect(localStorage.getItem(storageKey('resources'))).toBe(resBefore)
  })
})

describe('迁移 · 导入一份 v1 存档', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
    dropPendingWrites()
    clearAllSave()
  })

  it('导得进来,法宝位有东西,旧字段不残留', () => {
    const payload = {
      game: 'yunyin-xiuxian',
      version: 1,
      exportedAt: Date.now(),
      data: { game: { started: true }, player: { major: 3 }, inventory: structuredClone(LEGACY_V1) }
    }
    expect(importSaveText(JSON.stringify(payload)), 'v1 存档应当能导入').toBeNull()

    const raw = localStorage.getItem(storageKey('inventory'))!
    const stored = JSON.parse(decryptSave(raw)!)
    expect(stored.equippedArtifacts, '导入后旧法宝位没搬过来').toEqual(['af_youming'])
    expect('equippedArtifact' in stored).toBe(false)

    bootStores()
    const inventory = useInventoryStore()
    const game = useGameStore()
    expect(inventory.artifacts.map(a => a.defId)).toEqual(['af_youming'])
    expect(inventory.$state, '旧字段不该出现在运行时状态里').not.toHaveProperty('equippedArtifact')
    expect(game.started, '导入后应当已开局').toBe(true)
  })
})

describe('迁移 · 灵草五品(旧档单标量 herb → 品阶分账)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
    dropPendingWrites()
    clearAllSave()
  })

  it('启动迁移:resources 分片旧 scalar 统一落凡品账,清掉、不丢草', () => {
    // 20 境玩家 40 株旧草 → 全部并入凡品账,不随境界折算
    localStorage.setItem(storageKey('player'), JSON.stringify({ major: 20 }))
    localStorage.setItem(storageKey('resources'), JSON.stringify({ herb: 40, wudao: 5 }))
    migrateLocalSchema()
    const raw = localStorage.getItem(storageKey('resources'))!
    const back = JSON.parse(decryptSave(raw)!)
    expect(back.herbByGrade).toEqual({ 1: 40, 2: 0, 3: 0, 4: 0, 5: 0 })
    expect('herb' in back, '旧标量字段必须清掉,否则反复折算').toBe(false)
    expect(back.wudao, '其它资源字段不该被动').toBe(5)
  })

  it('灵品境(5)玩家:旧草统一并入凡品账,不丢草', () => {
    localStorage.setItem(storageKey('player'), JSON.stringify({ major: 5 }))
    localStorage.setItem(storageKey('resources'), JSON.stringify({ herb: 12 }))
    migrateLocalSchema()
    const back = JSON.parse(decryptSave(localStorage.getItem(storageKey('resources'))!)!)
    expect(back.herbByGrade[1], '旧草并入凡品账').toBe(12)
  })

  it('导入路径同样归一 resources 分片旧草到凡品账(不丢草)', () => {
    const payload = {
      game: 'yunyin-xiuxian',
      version: 2,
      exportedAt: Date.now(),
      data: { game: { started: true }, player: { major: 9 }, resources: { herb: 60 } }
    }
    expect(importSaveText(JSON.stringify(payload))).toBeNull()
    const back = JSON.parse(decryptSave(localStorage.getItem(storageKey('resources'))!)!)
    expect(back.herbByGrade[1], '仙界(9 境)旧草同样并入凡品账').toBe(60)
    expect('herb' in back).toBe(false)
  })
})

/**
 * 版本号有三处:信封的 `version`(导入闸门用)、`game` 分片里的 `saveVersion`、界面印的那个。
 *
 * `game.saveVersion` 此前只写不读:连 `sanitize` 都没碰过,界面印的是常量。
 * 于是导入一份 v1 旧档之后,信封已升到 2、档内还写着 1、界面印 v2 —— 三处各说各话。
 * 故障注入:去掉 migrate 里的 `saveVersion: SAVE_VERSION`,第一条红;
 * 去掉 sanitize 里的夹取,第二条红。
 */
describe('迁移 · 档内版本号跟着升,且坏值修得掉', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installStorage()
    dropPendingWrites()
    clearAllSave()
  })

  it('导入 v1 旧档后,档内 saveVersion 也是当前版本', () => {
    const v1 = {
      game: 'yunyin-xiuxian',
      version: 1,
      exportedAt: Date.now(),
      data: {
        game: { started: true, saveVersion: 1, createdAt: 1, lastActiveAt: Date.now(), totalPlaySec: 0 },
        player: { major: 2 }
      }
    }
    expect(importSaveText(encryptSave(JSON.stringify(v1))), '旧档应能导入').toBeNull()
    const back = JSON.parse(readSaveText(localStorage.getItem(storageKey('game'))!)!)
    expect(back.saveVersion, '档内版本号没跟着升 —— 三处版本会各说各话').toBe(SAVE_VERSION)
  })

  it('坏值(字符串 / 负数 / 越界)在修形时夹回合法区间', () => {
    bootStores()
    const game = useGameStore()
    for (const [raw, want] of [
      ['2' as unknown as number, SAVE_VERSION],
      [-3, 0],
      [999, SAVE_VERSION],
      [Number.NaN, SAVE_VERSION]
    ] as const) {
      game.saveVersion = raw
      game.sanitize()
      expect(game.saveVersion, `坏值 ${String(raw)} 应夹回 ${want}`).toBe(want)
    }
  })

  it('界面报档内那一份,不印常量', () => {
    const view = readFileSync(new URL('../components/settings/SettingsSaveSection.vue', import.meta.url), 'utf-8')
    expect(view, '版本应读 game.saveVersion').toContain('game.saveVersion')
  })
})
