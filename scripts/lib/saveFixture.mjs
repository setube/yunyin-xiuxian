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

/** 后期档:神人境 + 成套装备 */
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
    resources: { spiritStone: gn(9, 12), qi: 5000, wudao: 800, herb: 900, ore: 900, page: 300, dust: 500 },
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
  };
}
