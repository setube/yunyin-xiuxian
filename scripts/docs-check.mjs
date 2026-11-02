/**
 * 文档自检:文档里的命令、路径与规模数须与仓库一致。规模数只认「全量 N 个 spec」(src 下 spec 文件数,见 README 的写法)。
 * 移植自参考仓(玄枢录 scripts/docs-check.mjs)。用法: bun run docs-check(也接在 bun run check 里)。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const scripts = Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).scripts);
/** 豁免:历史计划(路径是"当时打算建的")+ 研读参考仓的学习笔记(引用 xian 的脚本,校对会假红) */
const EXCLUDES = ["docs/superpowers/plans/", "docs/study-xian.md"];
const isExcluded = (rel) => EXCLUDES.some((prefix) => rel.startsWith(prefix));

const docFiles = [
  "README.md",
  ...readdirSync(join(ROOT, "docs"), { recursive: true, encoding: "utf-8" })
    .filter((name) => typeof name === "string" && name.endsWith(".md"))
    .map((name) => `docs/${name}`),
]
  // Windows 上 readdirSync recursive 返回反斜杠
  .map((rel) => rel.replace(/\\/g, "/"))
  .filter((rel) => !isExcluded(rel));

const countSpecs = (dir) =>
  readdirSync(dir, { recursive: true, encoding: "utf-8" }).filter(
    (name) => typeof name === "string" && name.endsWith(".spec.ts"),
  ).length;
const totalSpecs = countSpecs(join(ROOT, "src"));

const failures = [];
let commands = 0;
let paths = 0;
let sizeClaims = 0;

for (const rel of docFiles) {
  const text = readFileSync(join(ROOT, rel), "utf-8");

  for (const [, name] of text.matchAll(/bun run ([a-zA-Z:_-]+)/g)) {
    if (name.length < 2) continue; // 占位写法 `bun run x`
    commands += 1;
    if (!scripts.includes(name))
      failures.push(`${rel}: \`bun run ${name}\` 在 package.json 里没有这个脚本`);
  }
  for (const [, path] of text.matchAll(/(?:bun|node) (scripts\/[\w./-]+)/g)) {
    commands += 1;
    if (!existsSync(join(ROOT, path))) failures.push(`${rel}: \`${path}\` 不存在`);
  }

  // 只查带扩展名的引用;android/ 不查(本地可造的产物目录,keystore.local.properties 这类"待创建"文件)
  const FILE_EXT = "(?:ts|js|mjs|mts|cts|vue|css|json|html|py|txt|toml|webp|png|ico|svg|woff2)";
  for (const [, path] of text.matchAll(new RegExp(`\`((?:src|scripts|public|electron)\\/[\\w./@-]+\\.${FILE_EXT})\``, "g"))) {
    if (path.includes("*")) continue;
    paths += 1;
    if (!existsSync(join(ROOT, path))) failures.push(`${rel}: 反引号里的 \`${path}\` 不存在`);
  }
  for (const [, path] of text.matchAll(/`((?:tailwind|vite|vitest|tsconfig)[\w.-]*\.(?:js|ts|json))`/g)) {
    if (path.includes("*")) continue;
    paths += 1;
    if (!existsSync(join(ROOT, path))) failures.push(`${rel}: 反引号里的 \`${path}\` 不存在`);
  }
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    paths += 1;
    const clean = target.split("#")[0];
    if (clean === "") continue;
    const full = resolve(join(ROOT, rel, ".."), clean);
    if (!existsSync(full)) failures.push(`${rel}: 链接 \`${target}\` 指向的地方不存在`);
  }

  for (const [, n] of text.matchAll(/全量 (\d+) 个 spec/g)) {
    sizeClaims += 1;
    if (Number(n) !== totalSpecs)
      failures.push(`${rel}: 写着「全量 ${n} 个 spec」,实际 ${totalSpecs} 个`);
  }
}

/*
 * README 的「项目结构」块里复述了一批规模数。它不参与任何构建,
 * 于是从来没人校 —— 实测 8 处全飘:data 48→58、affixes 113→119、
 * gongfa 46→63、branches 107→141、core 124+222→126+243、
 * stores 14→19、views 17→19、components 8→12。
 *
 * 只校能用一行数出来的那几项;星宿/宫/卦这类要从嵌套结构里数的,
 * 判据写出来比数字本身还长,不值当。
 */
{
  const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
  const dirCount = (dir, ext) =>
    readdirSync(join(ROOT, "src", dir)).filter((f) => f.endsWith(ext) && !f.endsWith(".spec.ts")).length;
  /** [README 里的正则, 实际值, 说明] */
  const checks = [
    [/├── data\/\s+# 内容层：纯静态声明式定义（(\d+) 个模块）/, dirCount("data", ".ts"), "data 模块"],
    [
      /├── core\/\s+# 逻辑层（(\d+) 个模块 \+ (\d+) 个同目录 spec）/,
      [dirCount("core", ".ts"), readdirSync(join(ROOT, "src/core")).filter((f) => f.endsWith(".spec.ts")).length],
      "core 模块与 spec",
    ],
    [/├── stores\/\s+# Pinia 状态（(\d+) 个/, dirCount("stores", ".ts"), "stores"],
    [
      /├── views\/\s+# (\d+) 个页面/,
      readdirSync(join(ROOT, "src/views")).filter((f) => f.endsWith(".vue")).length,
      "views",
    ],
    [
      /├── components\/\s+# 组件（(\d+) 组）/,
      readdirSync(join(ROOT, "src/components"), { withFileTypes: true }).filter((d) => d.isDirectory()).length,
      "components 组",
    ],
  ];
  /*
   * 这几项的数目在数据模块里没有同名常量,要把模块读进来才数得出。
   * 用「从源码数声明行」的办法:模块都写成 `{ id: '…', … }` 的数组字面量,
   * 数 id 声明的个数即可,不需要跑 vitest。
   */
  const countById = (rel, exportName) => {
    const src = readFileSync(join(ROOT, "src/data", rel), "utf-8");
    /*
     * 从 `export const NAME… = [` 起,到下一个顶层 `export const` 或文件末为止。
     * 不按 `];` 找结尾 —— 这几个文件里有缩进不同的收尾写法(ziwei 的 PALACES
     * 后面还跟着别的导出)。
     */
    const at = src.indexOf(`export const ${exportName}`);
    if (at < 0) return -1;
    const rest = src.slice(at);
    const next = rest.slice(1).search(/\nexport const /);
    const block = next < 0 ? rest : rest.slice(0, next + 1);
    /*
     * 数「顶格单花括号」= 数组里的一条记录。
     *
     * 别改成数 id / name:这几个模块的写法并不统一(MANSIONS 只有 name、
     * PALACES 只有 id、TRIGRAMS 两者都有),按字段数会分别得到 0、0、16。
     */
    return (block.match(/^\s*\{/gm) ?? []).length;
  };
  const dataChecks = [
    [/│\s+├── xiangxiu\.ts\s+# (\d+) 星宿/, countById("xiangxiu.ts", "MANSIONS"), "xiangxiu 星宿"],
    [/│\s+├── ziwei\.ts\s+# (\d+) 宫/, countById("ziwei.ts", "PALACES"), "ziwei 宫"],
    [/│\s+├── yijing\.ts\s+# (\d+) 卦/, countById("yijing.ts", "TRIGRAMS"), "yijing 卦"],
  ];
  for (const [re, actual, label] of dataChecks) {
    const m = re.exec(readme);
    if (!m) failures.push(`README 项目结构里找不到「${label}」—— 写法变了?`);
    else if (Number(m[1]) !== actual) failures.push(`README 项目结构写 ${label} ${m[1]},实际 ${actual}`);
  }

  for (const [re, actual, label] of checks) {
    const m = re.exec(readme);
    if (!m) {
      failures.push(`README 的项目结构里找不到「${label}」那一行 —— 写法变了?`);
      continue;
    }
    const stated = m.slice(1).map(Number);
    const want = Array.isArray(actual) ? actual : [actual];
    if (stated.length !== want.length || stated.some((v, i) => v !== want[i])) {
      failures.push(`README 项目结构写 ${label} ${stated.join(" + ")},实际 ${want.join(" + ")}`);
    }
  }
}

/*
 * 楷体切片的事实只有一份:build-kai-font.py 写出的 kai-subset.meta.json。
 * README 与脚本注释各自复述了片数与母体大小,容易各说各话。
 * 实测踩过:README 写母体 24.4MB、脚本注释写 24.8MB;脚本里还留着一个
 * 从没用过的 `CHUNKS = 5`(实际切成 22 片)。
 */
{
  const meta = JSON.parse(readFileSync(join(ROOT, "scripts/fonts/kai-subset.meta.json"), "utf-8"));
  const shardCount = Array.isArray(meta.chunks) ? meta.chunks.length : -1;
  const onDisk = readdirSync(join(ROOT, "src/assets/fonts")).filter((f) => f.endsWith(".woff2")).length;
  if (shardCount !== onDisk) {
    failures.push(`kai-subset.meta.json 记 ${shardCount} 片,src/assets/fonts 里实际 ${onDisk} 个 woff2`);
  }
  // README 与脚本注释对母体大小的说法必须一致
  const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
  const readmeMb = /母体 ([\d.]+)MB 不入库/.exec(readme);
  const scriptMb = /母体 ([\d.]+)MB 太重/.exec(readFileSync(join(ROOT, "scripts/fonts/build-kai-font.py"), "utf-8"));
  if (!readmeMb) failures.push("README 里找不到「母体 N MB 不入库」—— 写法变了?");
  if (!scriptMb) failures.push("build-kai-font.py 里找不到「母体 N MB 太重」—— 写法变了?");
  if (readmeMb && scriptMb && readmeMb[1] !== scriptMb[1]) {
    failures.push(`母体大小两处不一致:README ${readmeMb[1]}MB / build-kai-font.py ${scriptMb[1]}MB`);
  }
}

/*
 * AGENTS.md 里的 spec 细分数必须与仓库一致。
 *
 * README 的「全量 N 个 spec」已有校验,但 AGENTS.md 另写了一份分目录明细,
 * 而它不在 docFiles 里(根目录文件),于是从没被校过。实测已飘:
 * 写 379/核心 239,实际 392/核心 243;constants 写 556 行,实际 432。
 *
 * 分目录明细只在这里校 —— README 不写细分,没必要两处都记。
 */
{
  const md = readFileSync(join(ROOT, "AGENTS.md"), "utf-8");
  const buckets = ["core", "ui", "stores", "utils", "data", "composables", "router"];
  const n = (dir) =>
    readdirSync(join(ROOT, "src", dir), { recursive: true, encoding: "utf-8" }).filter(
      (f) => typeof f === "string" && f.endsWith(".spec.ts"),
    ).length;
  const claim = /共 (\d+) 个 spec：core (\d+)、ui (\d+)、stores (\d+)、utils (\d+)、data (\d+)、composables (\d+)、router (\d+)/.exec(md);
  if (!claim) {
    failures.push("AGENTS.md 里找不到「共 N 个 spec：core A、ui B…」这份分目录明细 —— 写法变了?");
  } else {
    const stated = [Number(claim[1]), ...claim.slice(2).map(Number)];
    const actual = [totalSpecs, ...buckets.map(n)];
    if (stated[0] !== actual[0]) failures.push(`AGENTS.md 写共 ${stated[0]} 个 spec,实际 ${actual[0]}`);
    buckets.forEach((b, i) => {
      if (stated[i + 1] !== actual[i + 1]) failures.push(`AGENTS.md 写 ${b} ${stated[i + 1]} 个 spec,实际 ${actual[i + 1]}`);
    });
  }
  // Key Directories 表里也有一个 core 的 spec 数
  const row = /\| `src\/core\/` \| 游戏逻辑 \+ (\d+) 个同目录 `\*\.spec\.ts` \|/.exec(md);
  if (!row) failures.push("AGENTS.md 的 Key Directories 表里找不到 core 的 spec 数 —— 行被改了?");
  else if (Number(row[1]) !== n("core")) failures.push(`AGENTS.md 的 Key Directories 写 core ${row[1]} 个,实际 ${n("core")}`);

  // data 模块数与 constants 行数
  const mods = readdirSync(join(ROOT, "src/data")).filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts")).length;
  const modClaim = /(\d+) 个模块：realms/.exec(md);
  if (!modClaim) failures.push("AGENTS.md 里找不到「N 个模块:realms…」—— 写法变了?");
  else if (Number(modClaim[1]) !== mods) failures.push(`AGENTS.md 写 ${modClaim[1]} 个 data 模块,实际 ${mods}`);

  const lines = readFileSync(join(ROOT, "src/data/constants.ts"), "utf-8").split("\n").length - 1;
  const lineClaim = /constants（(\d+) 行，含/.exec(md);
  if (!lineClaim) failures.push("AGENTS.md 里找不到「constants(N 行,含…」—— 写法变了?");
  else if (Number(lineClaim[1]) !== lines) failures.push(`AGENTS.md 写 constants ${lineClaim[1]} 行,实际 ${lines}`);
}

/*
 * CHANGELOG 的当前版本段必须分「修复 / 调整与优化 / 新增」三节之一。
 *
 * 发版时这三节是现成的;若平时平铺成裸 bullet,发版那一刻就得手工归类,
 * 而归类依据只有写的人自己记得。实测踩过:连续十几条平铺着追加,
 * 到要发版时 31 条混在一起,每条讲的是修复还是调整只能逐条重读。
 */
{
  const log = readFileSync(join(ROOT, "CHANGELOG.md"), "utf-8").split("\n");
  const start = log.findIndex((l) => l.trim() === "## [Unreleased]");
  if (start < 0) failures.push("CHANGELOG.md 里找不到「## [Unreleased]」段");
  else {
    const end = log.findIndex((l, i) => i > start && l.startsWith("## ["));
    const body = log.slice(start + 1, end < 0 ? undefined : end);
    const bullets = body.filter((l) => /^- /.test(l));
    const heads = body.filter((l) => /^### /.test(l));
    if (bullets.length > 0 && heads.length === 0) {
      failures.push(
        `CHANGELOG.md 的 [Unreleased] 段有 ${bullets.length} 条却一个「### 」小节都没有 —— 平铺了,` +
          `发版时得逐条重读才知道归「修复」还是「调整与优化」`,
      );
    }
    for (const h of heads) {
      const known = ["### 修复", "### 调整与优化", "### 新增"];
      if (!known.includes(h.trim())) failures.push(`CHANGELOG.md 的 [Unreleased] 段有未知小节「${h.trim()}」`);
    }
  }
}

// 防空转:文档挪走或正则失灵时判据会空过
if (commands < 4) failures.push(`只从文档里读出 ${commands} 条命令 —— 路径变了,或者写法改了?`);
if (paths < 5) failures.push(`只从文档里读出 ${paths} 条路径 —— 写法变了?`);
if (sizeClaims < 2)
  failures.push(`只从文档里读出 ${sizeClaims} 处规模数 —— 「全量 N 个 spec」这种写法被改掉了?`);

if (failures.length > 0) {
  console.error("文档自检:以下地方与仓库对不上");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(
  `文档自检通过(${docFiles.length} 份文档里的 ${commands} 条命令、${paths} 条路径都真实存在;` +
    `规模数对得上:全量 ${totalSpecs} 个 spec)`,
);
console.log(
  "  用例条数不记也不查 —— 它每次都变,记进文档只会逼人频繁改。要真实数请看 `bun run test:report` 的输出",
);
