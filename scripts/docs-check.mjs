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
