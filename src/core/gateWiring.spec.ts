/**
 * 门禁接线守卫 —— 「本地能过 = CI 能过」这句话,得有一条会自己跑的判据。
 *
 * 移植自参考仓(玄枢录 src/core/gateWiring.spec.ts)。云隐的 CI 形态与 xian 不同:
 *   xian 的 CI 直接在 workflow 里 `bun scripts/*.mjs`,所以它守「CI 里跑的自检 → 本地有对等入口」;
 *   云隐的 CI 只 `bun run check / test:report / build`(全走 package.json 别名),直接跑
 *   `bun scripts/x.mjs` 的写法一处都没有 —— 所以判据变成两条:
 *
 *   ① CI 里出现的每个命令都能本地解析:
 *        `bun run X` → package.json 里真有这个脚本;
 *        `bun|node scripts/*`(若哪天有人这么写) → 文件真实存在。
 *   ② 反向:每个 `scripts/*.mjs` 都必须声明在 package.json 里(有可发现的本地入口),
 *        否则它要么是没人跑得到的死脚本,要么是「只在 CI 里、本地跑不了」的暗门。
 *
 * 两条一起,那句「本地绿 = CI 绿」才算不是注释。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOWS = join(ROOT, ".github/workflows");

/** package.json 的 scripts(名字 → 命令正文) */
const SCRIPTS: Record<string, string> = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
).scripts as Record<string, string>;

/** CI 里点名别名的写法:`bun run X` / `bun run X --args` */
const RUN_NAME = /(?:\bbun|\bnpm)\s+run\s+([\w:-]+)/g;
/** CI 里直接跑脚本的写法:`bun scripts/x.mjs` / `node scripts/x.mjs`(云隐目前没有,守未来) */
const CI_SCRIPT = /(?:\bbun\s+(?:run\s+)?|\bnode\s+)["']?(?:\.\/)?(scripts\/[\w./-]+\.(?:mjs|ts))/g;

/** 全部 workflow 拼一份 CI 正文 */
const ciText = readdirSync(WORKFLOWS)
  .filter((f) => f.endsWith(".yml"))
  .map((f) => readFileSync(join(WORKFLOWS, f), "utf-8"))
  .join("\n");

/** CI 里点名的 script 名(去重、保留首次出现) */
const citedScriptNames = [...new Set([...ciText.matchAll(RUN_NAME)].map((m) => m[1] as string))];
/** CI 里直接点名的 `scripts/*.(mjs|ts)`(去重) */
const citedScriptPaths = [...new Set([...ciText.matchAll(CI_SCRIPT)].map((m) => m[1] as string))];
/** 仓库里真实的 `scripts/*.mjs` 入口文件(smoke-classify.ts 是被 import 的模块,不算入口) */
const repoScripts = readdirSync(join(ROOT, "scripts")).filter((f) => f.endsWith(".mjs")).sort();

describe("门禁接线 —— CI 里跑的命令,本地得有对等入口", () => {
  it("workflow 里每个 `bun run X` 都得是 package.json 里真有的脚本", () => {
    const missing = citedScriptNames.filter((name) => !(name in SCRIPTS));
    expect(missing, `CI 引用了 package.json 里没有的脚本: ${missing.join(", ")}`).toEqual([]);
  });

  it("workflow 里每个 `bun|node scripts/x` 都得指向真实文件", () => {
    const absent = citedScriptPaths.filter((p) => {
      try {
        readFileSync(join(ROOT, p), "utf8");
        return false;
      } catch {
        return true;
      }
    });
    expect(absent, `CI 引用了不存在的脚本文件: ${absent.join(", ")}`).toEqual([]);
  });

  it("每个 `scripts/*.mjs` 都必须在 package.json 里有可发现的本地入口", () => {
    const orphan = repoScripts.filter(
      (file) => !Object.values(SCRIPTS).some((cmd) => cmd.includes(`scripts/${file}`)),
    );
    expect(
      orphan,
      `scripts/ 下有没登记的脚本 —— 要么给它加一条 package.json 别名,要么删掉: ${orphan.join(", ")}`,
    ).toEqual([]);
  });

  it("从 workflow 里至少读到了些命令,没把目录读空", () => {
    expect(citedScriptNames.length + citedScriptPaths.length > 0, "没从 workflow 里读出任何命令 —— 目录/写法变了?").toBe(
      true,
    );
  });
});
