/**
 * 存档夹具 —— ui-smoke --late 与 perf-profile 共用的「造一份后期存档，启动前注入」。
 *
 * 存档按 store 分片、AES 加密后落在 localStorage(见 src/utils/storage.ts 的
 * persistConfig):每个 store 一枚键 `yunyin.<storeId>`,值是 CryptoJS.AES 加密的 JSON。
 * 这里照同一套格式造一份后期档,供真浏览器在启动前注入 —— 用于「要看到后期界面」
 * 的场景(UI 冒烟的 --late、帧率门的后期视图)。
 *
 * ⚠ 这是自检夹具,不是作弊入口:密钥本就写在包里,别据此以为存档不可改。
 *
 * 单一事实源:修改后期档(境界/装备/资源/流派)只改这一处,两个脚本同时生效,不会分叉。
 * 移植自参考仓(玄枢录 scripts/lib/saveFixture.mjs)的夹具思路,按云隐的存档 schema 落地。
 */
import CryptoJS from "crypto-js";

const SAVE_SECRET = "yunyin-xiuxian::dao-in-the-clouds::v1";
const SAVE_PREFIX = "yunyin.";

/** 把一份明文切片加密成落盘形态 */
function encryptSlice(slice) {
  return CryptoJS.AES.encrypt(JSON.stringify(slice), SAVE_SECRET).toString();
}

/**
 * 把若干切片注入 context 的 localStorage(启动前)。带一次性守卫:同一条导航
 * 不重复注入,免得把游戏自己写回的进度又盖掉。
 */
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
 * 「后期档」夹具 —— 神人境 + 成套装备,给 ui-smoke --late 覆盖终局界面、
 * 给 perf-profile 逼出终局渲染量。移植自 ui-smoke.mjs 原有的内联夹具。
 */
export function lateSlices() {
  return {
    /**
     * 时间戳用"现在":夹具若写 1970,离线结算会去补算半个世纪的挂机收益 ——
     * 冒烟脚本每翻一页都要重算一次,一轮要跑十分钟(实测)。
     */
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
    /**
     * 装备两件「背水」词条 —— 攒出一路流派。没有这一步,流派页的成路界面
     * (五维评级 / 组合技 / 成路来源)在冒烟里根本不会渲染,等于没测。
     */
    inventory: {
      items: [
        { uid: "smoke_w", templateId: "w_zidian", quality: "heaven", tier: 20, level: 0, affixes: [{ id: "bs3", roll: 1 }] },
        { uid: "smoke_a", templateId: "a_hufu", quality: "heaven", tier: 20, level: 0, affixes: [{ id: "low2", roll: 1 }] },
      ],
      equipped: { weapon: "smoke_w", armor: "smoke_a" },
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
