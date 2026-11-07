/**
 * 门禁接线守卫:本地能过 = CI 能过。
 *   ① CI 里每个命令都能本地解析:`bun run X` → package.json 有此脚本;`bun|node scripts/*` → 文件存在。
 *   ② 每个 `scripts/*.mjs` 都在 package.json 里有本地入口。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { matchingCategories } from "../../scripts/testCategories";

const ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOWS = join(ROOT, ".github/workflows");

/** package.json 的 scripts(名字 → 命令正文) */
const SCRIPTS: Record<string, string> = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
).scripts as Record<string, string>;

/** CI 里点名别名的写法:`bun run X` / `bun run X --args` */
const RUN_NAME = /(?:\bbun|\bnpm)\s+run\s+([\w:-]+)/g;
/** CI 里直接跑脚本的写法:`bun scripts/x.mjs` / `node scripts/x.mjs` */
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
/** 仓库里的 `scripts/*.mjs` 入口(smoke-classify.ts 是被 import 的模块,不算) */
const repoScripts = readdirSync(join(ROOT, "scripts")).filter((f) => f.endsWith(".mjs")).sort();

/** 递归收集 src 下的 spec;分类须覆盖每个测试文件 */
function specFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return specFiles(path);
    return entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

const SPECS = specFiles(join(ROOT, "src")).map((path) => path.slice(ROOT.length + 1).split("\\").join("/"));

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

  it("扫到的 spec 数量足够,没把 src 读空", () => {
    /*
     * 下一条判据是「每个 spec 恰好命中一个分类」—— SPECS 为空时它恒真,
     * 而 test:report 的分类覆盖率也就无从谈起。
     * 现有那条「没把目录读空」只查 workflow 里读到的命令,没查 SPECS。
     * 下限按现网规模取(数百),改动时若真删了整片测试,这条会提醒一并下调。
     */
    expect(SPECS.length, `只扫到 ${SPECS.length} 个 spec —— src 遍历没读到东西`).toBeGreaterThan(300);
  });

  it("每个 spec 恰好命中一个测试分类,没有漏登记也没有被两个分类截胡", () => {
    const bad = SPECS.map((path) => ({ path, hits: matchingCategories(path).map((c) => c.name) })).filter(
      ({ hits }) => hits.length !== 1,
    );
    expect(
      bad,
      `分类映射必须是一对一;未命中或重复命中都会让 test:report 少算/重算: ${JSON.stringify(bad, null, 2)}`,
    ).toEqual([]);
  });

  it("stores/endgame.spec 与 data/endgame.spec 都归入真仙终局,不再被 game.spec 截胡", () => {
    for (const path of ["src/stores/endgame.spec.ts", "src/data/endgame.spec.ts"]) {
      expect(matchingCategories(path).map((c) => c.name)).toEqual(["Celestial   真仙终局"]);
    }
  });
});
