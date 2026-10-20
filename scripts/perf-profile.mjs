/* eslint-disable no-console -- 自检脚本的产出就是给人看的报告 */
/**
 * 运行时回归门 —— 每个游戏视图上采几秒帧间隔,量 jank 有没有回来。
 *
 * 与 first-paint(冷启动:字节 / FCP / 字体)互补:那条管「第一屏多快」,
 * 这条管「玩起来卡不卡」—— 放置游戏的心跳每秒改一堆响应式状态,视图若
 * 在数据增长或内容变多时开始整块重渲染,帧间隔会拉长。这是此前唯一没有门
 * 的性能维度。
 *
 * 用法(需已 bun run build，playwright chromium 已装):
 *   bun scripts/perf-profile.mjs               # 全视图,默认新档
 *   bun scripts/perf-profile.mjs --seconds 4   # 每视图采 4 秒(默认 3)
 *   bun scripts/perf-profile.mjs --view home   # 只量一个视图
 *   bun scripts/perf-profile.mjs --no-gate     # 只报数字,不判红(人工排查用)
 *
 * 量法讲究
 * --------
 * · 复用 390×844 移动视口,默认新档(首启自动建号;本仓暂无造后期档的存档夹具,
 *   故测的是各视图默认渲染 + 引擎心跳 —— 仍是有效的回归基线,能拦「某视图开始
 *   每心跳整块重渲染」这类卡顿;要量「几百件装备列表」那种内容密度,jank 得先补
 *   一份像 reference 仓 saveFixture 那样的后期存档夹具,再回来加 --late);
 * · 每视图独立 context、独立存档,路由直接写进载入 URL(哈希路由);
 * · 在页内跑一段 rAF 采样,量「相邻两帧的间隔」:>50ms 的那一拍就是卡顿
 *   (浏览器一个任务 >50ms 即 Long Task)。headless 无 vsync 会以 ~60fps 节流,
 *   与真机同口径,足够当回归判据。
 *
 * 判据(见 BUDGET):单视图不得有长帧(>50ms)超过上限、最差帧不超过上限、
 * 不得崩溃、不得有未处理的页面异常、视图必须真的渲染出内容(不然门是空的)。
 * CI 机器比本机核多但单核弱,故上限按「本机读数留出数倍余量」定 —— 红的是
 * 「成倍长回去」那类回归,不是机器抖动。
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { lateSlices, seedSave } from "./lib/saveFixture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const extOf = (p) => p.slice(p.lastIndexOf("."));

const args = process.argv.slice(2);
const secs = Number(args[args.indexOf("--seconds") + 1] ?? 3);
const vi = args.indexOf("--view");
const only = vi >= 0 ? args[vi + 1] : undefined;
const gate = !args.includes("--no-gate");

/**
 * 判据上限。定法:先量出真实读数,再按「无头浏览器机型/负载差异留出数倍余量」
 * 定上限 —— 拦的是「成倍长回去」,不是机器抖动。改过会显著影响渲染量的代码后,
 * 这两个数要跟着重校(连同 README 的「性能自检」一节)。
 */
const BUDGET = {
  /** 单视图最差帧间隔上限:ms —— 无头 ~60fps 基准是 ~16-17ms,留到 5 倍 */
  maxFrameMs: Number(process.env.PERF_MAX_FRAME_MS ?? 100),
  /** 单视图 >50ms 长帧数量上限 */
  longFramesMax: Number(process.env.PERF_LONG_FRAMES ?? 2),
  /** 单视图必须渲染出的 DOM 节点下限 —— 防空转:量到的是空白/被重定向的页,那条预算永远绿 */
  minNodes: Number(process.env.PERF_MIN_NODES ?? 20),
};

function startServer() {
  return new Promise((res) => {
    const server = createServer((req, r) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
      if (rel.includes("..")) return r.writeHead(400).end("bad");
      try {
        const body = readFileSync(join(DIST, rel));
        r.writeHead(200, { "content-type": MIME[extOf(rel)] ?? "application/octet-stream" });
        r.end(body);
      } catch {
        r.writeHead(404).end("nf");
      }
    });
    server.listen(0, "127.0.0.1", () => res(server));
  });
}

/** 游戏各视图(欢迎 / 建号页需要无档,默认档下会被路由重定向,故不列入) */
const VIEWS = [
  { route: "/", name: "home" },
  { route: "/cultivation", name: "cultivation" },
  { route: "/adventure", name: "adventure" },
  { route: "/inventory", name: "inventory" },
  { route: "/character", name: "character" },
  { route: "/codex", name: "codex" },
  { route: "/souls", name: "souls" },
  { route: "/titles", name: "titles" },
  { route: "/settings", name: "settings" },
  { route: "/build", name: "build" },
  { route: "/collection", name: "collection" },
  { route: "/legacy", name: "legacy" },
  { route: "/dongfu", name: "dongfu" },
  { route: "/world", name: "world" },
  { route: "/celestial", name: "celestial" },
];

/** 页内采样器:记录相邻帧间隔,`__perfStop()` 时汇总。IIFE 用 void 包裹,
 *  让 `evaluate(SAMPLER)` 立即返回(不被未 resolve 的 Promise 卡住)。 */
const SAMPLER = `
  void (() => {
    let resolveFn;
    window.__perf = new Promise((r) => { resolveFn = r; });
    const frames = [];
    let last = performance.now();
    let raf;
    function step(now) {
      frames.push(now - last);
      last = now;
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    window.__perfStop = () => {
      cancelAnimationFrame(raf);
      const n = frames.length;
      const s = [...frames].sort((a, b) => a - b);
      const p = (q) => s[Math.min(n - 1, Math.floor(q * n))];
      const long = frames.filter((f) => f > 50).length;
      resolveFn({
        frames: n,
        max: Math.round(p(1)),
        p95: Math.round(p(0.95)),
        median: Math.round(p(0.5)),
        over50ms: long,
        nodes: document.querySelectorAll('*').length,
        title: document.title,
      });
      return window.__perf;
    };
  })();
`;

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const results = [];
const failures = [];
for (const view of VIEWS) {
  if (only && view.name !== only) continue;
  let record = null;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // 注入后期档(神人境 + 成套装备,见 scripts/lib/saveFixture.mjs)—— 档是每个视图
    // 独立一份,视图才真正渲染出终局内容;没有它会落到欢迎页,门就量空了。
    await seedSave(context, lateSlices());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("crash", () => errors.push("RENDERER_CRASH"));
    const url = base + `#${view.route}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(SAMPLER);
    await page.waitForTimeout(secs * 1000);
    const data = await page.evaluate("window.__perfStop()");
    record = { name: view.name, route: view.route, ...data, errors };
    await context.close();
  } catch (err) {
    record = { name: view.name, route: view.route, crashed: String(err).slice(0, 160) };
  }
  results.push(record);
}
await browser.close();
server.close();

// ---- 报告 ----
for (const r of results) {
  const state = r.crashed
    ? `✗ ${r.name} CRASHED: ${r.crashed}`
    : `✓ ${r.name.padEnd(11)} frames=${r.frames} max=${r.max}ms p95=${r.p95}ms med=${r.median}ms >50ms=${r.over50ms} dom=${r.nodes}${
        r.errors.length ? ` errors=${r.errors.join("|").slice(0, 60)}` : ""
      }`;
  console.log(state);
  if (r.crashed) failures.push(`${r.name}: 崩溃 (${r.crashed})`);
  else if (r.errors.length) failures.push(`${r.name}: 页面异常 (${r.errors[0].slice(0, 80)})`);
  else if (gate && r.nodes < BUDGET.minNodes)
    failures.push(`${r.name}: 只渲染了 ${r.nodes} 个节点(< ${BUDGET.minNodes})—— 视图没出来,门空转`);
  else if (gate && r.max > BUDGET.maxFrameMs)
    failures.push(`${r.name}: 最差帧 ${r.max}ms > ${BUDGET.maxFrameMs}ms`);
  else if (gate && r.over50ms > BUDGET.longFramesMax)
    failures.push(`${r.name}: ${r.over50ms} 帧 >50ms 长帧 > ${BUDGET.longFramesMax}`);
}

console.log(
  `\n判据:最差帧 ≤ ${BUDGET.maxFrameMs}ms · 长帧 ≤ ${BUDGET.longFramesMax} · DOM ≥ ${BUDGET.minNodes} · 无崩溃/异常`,
);
if (failures.length > 0) {
  console.log(`✗ 有 ${failures.length} 处超限:`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部 ${results.length} 个视图在预算内`);
}
