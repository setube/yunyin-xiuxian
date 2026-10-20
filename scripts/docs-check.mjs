/**
 * 文档自检 —— 文档里写下的**命令、路径与规模数**,必须与仓库里真实的东西一致。
 *
 * 移植自参考仓(玄枢录 scripts/docs-check.mjs),按云隐的实际裁剪:
 *   本仓没有 packages/engine,规模数只对「全量 N 个 spec」(src 下的 spec 文件数);
 *   归档豁免与 xian 一致(plans/ 是历史计划,里面的路径是"当时打算建的"),
 *   另加 docs/study-xian.md —— 那是研读参考仓的学习笔记,引用的是 *xian* 的脚本
 *   (bun run check:engine 之类),拿云隐的清单去校对只会假红。
 *
 * 用法: bun run docs-check(也接在 bun run check 里)。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const scripts = Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).scripts);
/** 归档豁免:历史计划(路径是"当时打算建的")+ 研读参考仓的学习笔记(引用 xian 的脚本) */
const EXCLUDES = ["docs/superpowers/plans/", "docs/study-xian.md"];
const isExcluded = (rel) => EXCLUDES.some((prefix) => rel.startsWith(prefix));

const docFiles = [
  "README.md",
  ...readdirSync(join(ROOT, "docs"), { recursive: true, encoding: "utf-8" })
    .filter((name) => typeof name === "string" && name.endsWith(".md"))
    .map((name) => `docs/${name}`),
]
  // 归一化分隔符(Windows 上 readdirSync recursive 会带反斜杠),统一按正斜杠处理
  .map((rel) => rel.replace(/\\/g, "/"))
  .filter((rel) => !isExcluded(rel));

/** 递归数 src 下的 .spec.ts */
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

  // ① 命令 —— `bun run X` 与 `bun/node scripts/*`
  for (const [, name] of text.matchAll(/bun run ([a-zA-Z:_-]+)/g)) {
    if (name.length < 2) continue; // 占位写法 `bun run x`,不当命令查
    commands += 1;
    if (!scripts.includes(name))
      failures.push(`${rel}: \`bun run ${name}\` 在 package.json 里没有这个脚本`);
  }
  for (const [, path] of text.matchAll(/(?:bun|node) (scripts\/[\w./-]+)/g)) {
    commands += 1;
    if (!existsSync(join(ROOT, path))) failures.push(`${rel}: \`${path}\` 不存在`);
  }

  // ② 路径 —— 反引号里的源码/脚本/公共路径 + 相对链接
  // 只查「带扩展名」的引用(模块常用无扩展名写法 src/core/equipSet,省略不查;
  // android/ 是本地可造的产物目录,keystore.local.properties 这类"待创建"文件不查)。
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

  // ③ 规模数 —— 只守「全量 N 个 spec」这一条规范措辞(见 README 的写法)
  for (const [, n] of text.matchAll(/全量 (\d+) 个 spec/g)) {
    sizeClaims += 1;
    if (Number(n) !== totalSpecs)
      failures.push(`${rel}: 写着「全量 ${n} 个 spec」,实际 ${totalSpecs} 个`);
  }
}

// 防空转:文档被挪走、正则失灵时,这条判据会"通过"得毫无意义
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
