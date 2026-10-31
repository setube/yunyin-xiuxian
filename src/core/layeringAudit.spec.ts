/* eslint-disable no-console -- 分层审计的产出是给人看的清单 */
/**
 * 分层审计:core 对 store 的依赖只许收拢,不许扩散。
 *   一 `STATEFUL_CORE` 与当前 import store 的 core 模块逐一相等,新增或遗留都红。
 *      基线用名单不用计数:计数能被搬位置绕过。
 *   二 引用处数不超过基线。
 *   三 `utils` 不许 import core / stores。
 *   四 `data` 不许反向 import core / stores / ui。
 *
 * 故障注入:在名单外的 core 模块加 `import { usePlayerStore } from "@/stores/player"`,
 * 第一条红;在 src/utils 夹一句对 core/store 的 import,第三条红。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const CORE = resolve(__dirname);
const UTILS = resolve(__dirname, "../utils");
const DATA = resolve(__dirname, "../data");

/** core 里 import store 的语句;单双引号都认 */
const STORE_IMPORT = /from\s+["']@\/stores\/[A-Za-z]+["']/g;

/** 允许 import store 的 core 模块点名清单(只许减);名字是含 `.ts` 的文件名 */
const STATEFUL_CORE = new Set<string>([
  "affixTransfer.ts",
  "astronomy.ts",
  "breakthrough.ts",
  "buildDetect.ts",
  "buildingService.ts",
  "challenge.ts",
  "craftability.ts",
  "dailyChallenge.ts",
  "daoluService.ts",
  "divinationService.ts",
  "earlyGameService.ts",
  "endgameService.ts",
  "engine.ts",
  "equipBest.ts",
  "eventEngine.ts",
  "expedition.ts",
  "exploration.ts",
  "forge.ts",
  "fortuneChain.ts",
  "fortuneEcho.ts",
  "firstStep.ts",
  "goal.ts",
  "gongfaService.ts",
  "heritageForge.ts",
  "identity.ts",
  "identityService.ts",
  "lab.ts",
  "lifeTrialService.ts",
  "loadoutService.ts",
  "loot.ts",
  "loreService.ts",
  "mentorService.ts",
  "mortalWorldService.ts",
  "offline.ts",
  "pillService.ts",
  "playerSnap.ts",
  "progress.ts",
  "questProgress.ts",
  "qiRepair.ts",
  "reforge.ts",
  "regionEvent.ts",
  "regionRevival.ts",
  "reincarnation.ts",
  "resourceGuidance.ts",
  "samsaraService.ts",
  "save.ts",
  "savePlatform.ts",
  "secretRealm.ts",
  "smartKeep.ts",
  "soulService.ts",
  "suppress.ts",
  "tribulationDecision.ts",
  "veinService.ts",
  "weather.ts",
  "worldMemory.ts",
]);

/** core → store 的引用处数基线(只许减;名单没变时防止单个模块越挂越多) */
const CORE_STORE_SITES = 192;
/**
 * core 用例里需要 Pinia 的文件数基线(只许减)。
 * 119 → 120:补 playerSnap.spec 时加的 —— 该模块本身就要读四个 store,测试绕不开 Pinia。
 * 120 → 121:同理,compare.spec 的 measureOnWorld 经 currentDaoRules 读 endgame store。
 */
const CORE_PINIA_SPECS = 121;

function sources(dir: string): { name: string; text: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8") }));
}

describe("分层 · core 对 store 的依赖只许收拢", () => {
  const core = sources(CORE);
  const withStore = core
    .map((f) => ({ name: f.name, hits: f.text.match(STORE_IMPORT) ?? [] }))
    .filter((f) => f.hits.length > 0);
  const sites = withStore.reduce((n, f) => n + f.hits.length, 0);

  it("扫描到了 core 源码(防空转)", () => {
    expect(core.length).toBeGreaterThan(50);
  });

  it("import store 的 core 模块 = 点名名单(新增或遗留都要在这里显式改)", () => {
    const actual = withStore.map((f) => f.name).sort();
    const baseline = [...STATEFUL_CORE].sort();
    const added = actual.filter((n) => !STATEFUL_CORE.has(n));
    const leftover = baseline.filter((n) => !actual.includes(n));
    if (added.length > 0)
      console.log(`\n新增的 core → store 模块(把纯模块拖下水?):${added.join("、")}`);
    if (leftover.length > 0)
      console.log(
        `\n已迁走、该从名单删掉的:${leftover.join("、")}\n` +
          `  (那一个是好事 —— 从 STATEFUL_CORE 里删掉它)`,
      );
    expect(actual).toEqual(baseline);
  });

  it("import store 的处数不超过基线", () => {
    if (sites > CORE_STORE_SITES) {
      const per = new Map<string, number>();
      for (const f of withStore) {
        for (const hit of f.hits) {
          const store = hit.replace(/^.*@\/stores\//, "").replace(/["']$/, "");
          per.set(store, (per.get(store) ?? 0) + 1);
        }
      }
      console.log(
        `\ncore → store 的引用分布(基线 ${CORE_STORE_SITES},现在 ${sites}):` +
          [...per.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `\n  ${k} ×${v}`)
            .join(""),
      );
    }
    expect(sites).toBeLessThanOrEqual(CORE_STORE_SITES);
  });

  it("core 用例需要 Pinia 的文件数不超过基线(只许减)", () => {
    const specs = readdirSync(CORE).filter(
      (f) => f.endsWith(".spec.ts") && f !== "layeringAudit.spec.ts",
    );
    const withPinia = specs.filter((f) =>
      readFileSync(join(CORE, f), "utf8").includes("setActivePinia"),
    );
    console.log(`\ncore 用例 ${specs.length} 个,其中 ${withPinia.length} 个要 Pinia`);
    expect(withPinia.length).toBeLessThanOrEqual(CORE_PINIA_SPECS);
  });

  it("utils 不依赖 core / stores —— 最底层只认自己与标准库", () => {
    const bad = sources(UTILS).filter((f) =>
      /from\s+["']@\/(core|stores)\//.test(f.text),
    );
    expect(bad.map((f) => f.name)).toEqual([]);
  });

  it("data 不反向依赖 core / stores / ui —— 唯一事实源只许静态声明", () => {
    // 只看运行时代码;spec 里 import core 对账允许
    const bad = sources(DATA).filter((f) =>
      /from\s+["']@\/(core|stores|ui)\//.test(f.text),
    );
    expect(
      bad.map((f) => f.name),
      "data 是纯静态声明式内容:反向 import 会让数据层带上副作用与显示口径",
    ).toEqual([]);
  });
});
