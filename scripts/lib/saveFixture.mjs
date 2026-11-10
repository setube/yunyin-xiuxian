/**
 * 存档夹具:ui-smoke --late 与 perf-profile 共用的后期存档,启动前注入。
 *
 * 格式须与 src/utils/storage.ts 的 persistConfig 一致:每个 store 一枚键 `yunyin.<storeId>`,
 * 值是 CryptoJS.AES 加密的 JSON。
 * 自检夹具,不是作弊入口:密钥本就写在包里。
 * 单一事实源:后期档只改这一处。
 */
import CryptoJS from "crypto-js";

const SAVE_SECRET = "yunyin-xiuxian::dao-in-the-clouds::v1";
const SAVE_PREFIX = "yunyin.";

function encryptSlice(slice) {
  return CryptoJS.AES.encrypt(JSON.stringify(slice), SAVE_SECRET).toString();
}

/** 启动前把切片写入 context 的 localStorage;一次性守卫,不盖掉游戏写回的进度 */
export async function seedSave(context, slices, guard = "__fixtureSeeded") {
  const data = Object.fromEntries(
    Object.entries(slices).map(([k, v]) => [`${SAVE_PREFIX}${k}`, encryptSlice(v)]),
  );
  await context.addInitScript(
    ({ payload, flag }) => {
      if (localStorage.getItem(flag)) return;
      for (const [k, v] of Object.entries(payload)) localStorage.setItem(k, v);
      localStorage.setItem(flag, "1");
    },
    { payload: data, flag: guard },
  );
}

const gn = (m, e) => ({ m, e });

/**
 * 给一份存档挂上「历练在途」的会话,让引擎每 tick 真的打一场。
 *
 * 内存那一档需要真实负载:空闲心跳不分配,量出来必然是平的。
 * `nextBattleAt` 取过去时刻,进页面就立刻开打。
 */
export function withActiveRun(slices, regionId = "qingyun") {
  const now = Date.now();
  return {
    ...slices,
    adventure: {
      session: {
        regionId,
        mode: "normal",
        startedAt: now - 60_000,
        endsAt: now + 3600_000,
        nextBattleAt: now - 1,
        wins: 0,
        losses: 0,
        events: 0,
        stoneGain: { m: 0, e: 0 },
        expGain: { m: 0, e: 0 },
        itemGain: 0,
      },
    },
  };
}

/** 后期档:神人境 + 成套装备。巡页与形制自检共用这一份,任何一片缺口都会让它们量到初始态 */
export function lateSlices() {
  return {
    /** 时间戳须取当前时刻:写 1970 会补算半个世纪的离线收益,冒烟每翻一页重算一次 */
    game: {
      started: true,
      saveVersion: 2,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      totalPlaySec: 0,
      createRerolls: 8,
      createProfile: null,
    },
    player: {
      major: 14,
      sub: 0,
      exp: gn(0, 0),
      age: 3000,
      lifespanBonusYears: 0,
      dead: false,
      reincarnation: {
        count: 2,
        daoFruit: 12,
        talents: [],
        insight: 400,
        lives: [],
        vow: null,
        trial: null,
        bonds: [],
      },
      linggen: {
        roots: [
          { element: "fire", aptitude: 88 },
          { element: "water", aptitude: 70 },
        ],
        gradeName: "双灵根",
        growthMult: 1.4,
      },
    },
    /*
     * herb 必须写成 herbByGrade 按品阶分账 —— store 里的 herb 是 computed(五档汇总),
     * 不是可写字段。原先写成 `herb: 900` 会被 Vue 直接忽略,于是所有 QA 脚本里灵草都是 0:
     * 炼丹页的「神品灵草 ×N」、背包材料页的灵草格全读 herbOf(grade),拿到的始终是空账。
     * ore/page/dust 在 smallRefs 里,原名就对。
     */
    resources: {
      spiritStone: gn(9, 12),
      qi: 5000,
      wudao: 800,
      herbByGrade: { 1: 200, 2: 200, 3: 200, 4: 200, 5: 300 },
      ore: 900,
      page: 300,
      dust: 500
    },
    /** 两件「背水」词条凑成一路流派;缺了它流派页的成路界面(五维评级 / 组合技 / 成路来源)不渲染 */
    inventory: {
      items: [
        { uid: "smoke_w", templateId: "w_zidian", quality: "heaven", tier: 20, level: 0, affixes: [{ id: "bs3", roll: 1 }] },
        { uid: "smoke_a", templateId: "h_muzan", quality: "heaven", tier: 20, level: 0, affixes: [{ id: "low2", roll: 1 }] },
      ],
      // 槽位名取 EquipSlot('weapon'|'head'|'body'|…);原先写的 armor 不在表里,那件装备从不会出现在已装备栏
      equipped: { weapon: "smoke_w", head: "smoke_a" },
      pills: {},
      artifacts: [],
      equippedArtifacts: [],
    },
    endgame: { daoPath: "sword", daoSource: 1200, souls: [], equippedSouls: [] },
    /**
     * 图鉴:材料与敌人各铺几条见闻,让图鉴页/敌情面板不再全空。
     *
     * 与 dongfu / cultivation 同一类缺口 —— 没有这一片时,图鉴页是空的、
     * 敌人详情里「已见 N 次」恒为 0,巡页脚本量到的是「什么都没见过」。
     *
     * 只铺少量:id 必须是 data/materials、data/enemies 里的真值,sanitize 会清掉认不出的。
     */
    lore: {
      materialLore: { mat_qingzhi: 3, mat_chiyan: 2, mat_xuanyin: 1 },
      materialSeen: { mat_qingzhi: 5, mat_chiyan: 4, mat_xuanyin: 3 },
      recipeLore: {},
      blueprintLore: {},
      skillExp: {},
      enemyLore: { e_wolf: 5, e_boar: 4, e_wolfking: 3 },
      enemySeen: { e_wolf: 12, e_boar: 9, e_wolfking: 2 },
      studyFrac: 0
    },
    /**
     * 功法:主修一门满级 + 两门辅修 + 两门秘术(learned 的键须是 data/gongfa 里的真 id)。
     *
     * 与 dongfu 同一类缺口:没这一片时,修行页的功法栏、属性汇总里的功法词条、
     * 择道/进修入口全是初始态,巡页脚本量到的是「什么都没学」。
     * 等级取满级(主辅 9 / 秘术 3),让「已修满」这类分支也能被量到。
     */
    cultivation: {
      learned: { m_taixuan: 9, s_tuna: 9, s_lianti: 9, m_qingmu: 3, s_yufeng: 3 },
      mainGongfa: "m_taixuan",
      subGongfa: ["s_tuna", "s_lianti"],
      buffs: [],
      gongfaBranch: {}
    },
    /**
     * 洞府:七座建筑各建到「当前洞府等级允许的上限」。
     *
     * 原先这一片完全没有 —— 于是 lateSlices 的「后期档」在洞府页上看到的是
     * 七座全 0 级的未启用建筑,与「后期」名不副实(而注释只承诺「神人境 + 成套装备」,
     * 严格说没撒谎,但依赖它的巡页脚本量到的洞府状态是初始态)。
     *
     * 等级取 (mansion + 1) * 5 这条与 stores/dongfu 的 buildingLevelCap 同源,
     * 手写 4/5 级是为了让「已营 7/7」在页面上成立;洞府本身满 4 级。
     */
    dongfu: {
      levels: { mansion: 4, array: 5, alchemy: 5, forge: 4, field: 5, library: 4, beast: 3 },
      frac: { herb: 0, ore: 0, wudao: 0 },
      veinMain: "gather",
      veinPoints: { gather: 20, craft: 10, alchemy: 5, insight: 5 }
    },
    settings: {
      privacyAccepted: true,
      sfxOn: false,
      musicOn: false,
      musicVol: 0,
      sfxVol: 0,
      reduceMotion: true,
      battleSpeed: 4,
      decomposeRanks: [],
      smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
      theme: "dark",
    },
    /**
     * 一名开局白送的入门弟子。
     *
     * 字段名踩过坑:sanitize()` 只认 `archId`(且必须在 APPRENTICE_BY_ID 里),
     * 写成 `id`/`name` 的条目会被**静默丢弃** —— 页面上还是显示 1/4(开局白送那一个),
     * 看起来像夹具没生效,实际是自己写错了字段。另注:槽位数由 `apprenticeSlots(major)` 推,
     * 不在分片里;`major: 14` 给 4 个槽,填满四个即「门中已满」。
     */
    apprentice: {
      apprentices: [
        { uid: "ap_geo_1", archId: "ap_lingtong", task: null, level: 1, bornAt: 0, taskEndsAt: 0 },
      ],
      rebirthKarma: 0,
    },
  };
}

/**
 * 满行囊夹具:120 件满词条神品,九个可穿戴槽全穿上。
 *
 * 这是玩家真能达到的上限,也是渲染量最大的一档:行囊页 DOM 从轻量夹具的 270
 * 涨到 2800 上下。压测(perf-profile --stress)读它。
 *
 * 每一条都必须**真能进档**,否则 inventory.sanitize() 会静默剔除,
 * 压测就变成「在七条词条的装备上量性能」而门照旧报绿。校验见
 * src/utils/fixtureParity.spec.ts —— 它直接调用本函数,不用源码文本猜。
 *
 * @param {number} [itemCount] 行囊件数,默认 120(即 BAG_CAPACITY 上限)。
 *   供性能实验用:调小它可以看启动开销随件数的增长曲线,
 *   从而分清哪一段是「与存档大小成正比」、哪一段是固定成本。
 */
export function stressSlices(itemCount = 120) {
  const base = lateSlices();
  /*
   * 九个可穿戴槽,每个槽一件 32 阶神品,模板与物品同阶。
   * 首版用 30 阶的 h_zhenling 等配 tier:32,阶数对不上。
   */
  const SLOT_TEMPLATES = [
    ["weapon", "w_benyuan"],
    ["head", "h_benyuan"],
    ["body", "b_benyuanshen"],
    ["wrist", "wr_benyuan"],
    ["belt", "bl_benyuan"],
    ["boots", "bo_benyuan"],
    ["necklace", "n_hongmengzhu"],
    ["ring", "r_daozu"],
    ["talisman", "tl_daozuzhuan"],
  ];
  /*
   * 九条 = 神品的词条上限(qualities 里 divine 的 affixes 是 [6, 9])。
   * 这九条须真实存在且九个槽全兼容:首版写的 res1 不存在、low1 是 slots:A(仅护甲),
   * 只按武器挑时护甲五槽又用不了 crit1/cdmg1/dmg1/bs1。
   */
  const AFFIX_IDS = ["atk1", "atk2", "atk3", "def1", "def2", "def3", "hp1", "hp2", "hp3"];
  const ITEM_COUNT = itemCount;
  const items = [];
  for (let i = 0; i < ITEM_COUNT; i += 1) {
    const slotPair = i < SLOT_TEMPLATES.length ? SLOT_TEMPLATES[i] : null;
    items.push({
      uid: `perf_stress_${i}`,
      // 前九件按槽取模板(同阶 32),其余用 32 阶武器模板
      templateId: slotPair ? slotPair[1] : "w_benyuan",
      quality: "divine",
      tier: 32,
      level: 5,
      affixes: AFFIX_IDS.map(id => ({ id, roll: 1 })),
    });
  }
  return {
    ...base,
    inventory: {
      ...base.inventory,
      items,
      /*
       * equipped 必须由同一套 uid 现算。照抄 base 那张图(指向 smoke_w / smoke_a)
       * 会让 sanitize 找不到 uid,把九个槽整个清空 —— 构筑页于是按「没装备加成」算。
       */
      equipped: Object.fromEntries(SLOT_TEMPLATES.map(([slot], i) => [slot, `perf_stress_${i}`])),
      pills: { p_xuanyuan: 999 },
      artifacts: [],
      equippedArtifacts: [],
    },
  };
}
