/* eslint-disable no-console -- 自检报告 */
/**
 * 运行时回归门:每个视图采几秒 rAF 帧间隔,量 jank。冷启动归 first-paint。
 *
 * 用法(需已 bun run build,playwright chromium 已装):
 *   bun scripts/perf-profile.mjs               # 全视图
 *   bun scripts/perf-profile.mjs --seconds 4   # 每视图采 4 秒(默认 3)
 *   bun scripts/perf-profile.mjs --view home   # 只量一个视图
 *   bun scripts/perf-profile.mjs --no-gate     # 只报数字,不判红
 *
 * · 每视图独立 context、独立存档,路由写进载入 URL(哈希路由);
 * · 相邻两帧间隔 >50ms 计长帧(Long Task 口径);headless 无 vsync,按 ~60fps 节流。
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
/*
 * 不传 --seconds 时 indexOf 返回 -1,args[-1+1] = args[0] 会被当成秒数 ——
 * 而 `--view home` 下 args[0] 是 "--view",Number("--view") 得到 NaN,
 * 于是调度器收到 NaN 超时(node 直接告警 TimeoutNaNWarning),采样只跑了 1 帧。
 * 这也是本门此前「注入卡顿仍报绿」的一半原因。
 */
const si = args.indexOf("--seconds");
const secs = si >= 0 ? Number(args[si + 1] ?? 3) : 3;
const vi = args.indexOf("--view");
const only = vi >= 0 ? args[vi + 1] : undefined;
const gate = !args.includes("--no-gate");
/*
 * 满行囊档:夹具默认只放 2 件装,而玩家真实上限是 BAG_CAPACITY=120 件满词条神品。
 * 性能门的读数因此来自一份「几乎空的行囊」—— 行囊页、构筑页、图鉴页在小档与满档下
 * 的渲染量差一个数量级,小档过线不代表满档过线。
 * 用法:`node scripts/perf-profile.mjs --stress`
 *
 * 两档共用 dist/:两个 perf 命令并行跑时,后启动的那个会先 `bun run build` 重写 dist,
 * 而前者正按需从该目录取资源 —— 读数会混杂甚至 404。故须串行跑,不要同时开两个。
 */
const stress = args.includes("--stress");

/**
 * 判据上限:本机读数留数倍余量(机型/负载差异),只拦成倍回退。
 * 显著改动渲染量后须重校,并同步 README「性能自检」一节。
 */
const BUDGET = {
  /** 单视图最差帧间隔上限,单位 ms;无头基准 ~16-17ms,留到 5 倍 */
  maxFrameMs: Number(process.env.PERF_MAX_FRAME_MS ?? 100),
  /** 单视图 >50ms 长帧数量上限 */
  longFramesMax: Number(process.env.PERF_LONG_FRAMES ?? 2),
  /** 单视图 DOM 节点下限:防量到空白/被重定向的页而空转 */
  minNodes: Number(process.env.PERF_MIN_NODES ?? 20),
  /**
   * 单视图采样帧数下限:防「页面被长任务卡死,几乎采不到帧」被判成通过。
   *
   * 实测踩过:在 App.vue 里注入一个每 100ms 占 80ms 的忙循环后,
   * home 视图只采到 frames=1、max=-13ms(负数),而本门照样报 ✓ ——
   * 因为判据只查 DOM 节点数、最差帧与长帧数,唯独不查「到底采了几帧」。
   * 帧数不足时 max/median 全是无意义读数,拿它判红判绿都是在赌。
   *
   * 下限取每视图采样秒数 × 20:headless 按 ~60fps 节流,正常档实测约 60fps;
   * 留到 1/3 是容许首帧冷启动与 gc 抖动。
   */
  minFramesPerSecond: Number(process.env.PERF_MIN_FPS ?? 20),
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

/**
 * 满行囊夹具:120 件满词条神品(BAG_CAPACITY 上限),外加一堆丹药。
 *
 * 词条取无部位限制的通用项(atk1 / def1 / hp1 等),每件 8 条即 EQUIP_AFFIX_HARD_CAP 的量级;
 * 这正是玩家真能堆到的上限,也是渲染量最大的一档。
 */
function stressSlices() {
  const base = lateSlices();
  /*
   * 各槽一件 32 阶神品,让装备栏八格都满 —— 构筑页要读身上八件的加成,
   * 空装备栏下它算的是「没有装备加成的角色」,满档性能门就漏掉了真实负载。
   */
  const SLOT_TEMPLATES = [
    "w_benyuan", "h_zhenling", "b_benyuan", "wr_zhenling",
    "bl_kaidao", "bt_shenmo", "n_hundunzhu", "r_wuji",
  ];
  const SLOTS = ["weapon", "head", "body", "wrist", "belt", "boots", "necklace", "ring"];
  const items = [];
  for (let i = 0; i < 120; i += 1) {
    items.push({
      uid: `perf_stress_${i}`,
      // 模板与物品同阶:首版拿 9 阶的 w_zidian 配 tier:32,阶数对不上
      templateId: i < SLOT_TEMPLATES.length ? SLOT_TEMPLATES[i] : "w_benyuan",
      quality: "divine",
      tier: 32,
      level: 5,
      /*
       * 九条 = 神品的词条上限(qualities.ts 里 divine 的 affixes 是 [6, 9]),
       * 也就是玩家单件能堆到的最多行数。
       *
       * 这九条须**真实存在且八个槽全兼容**,否则 sanitize 会静默剔掉:
       * 首版写的 res1 在 affixes 里没有、low1 是 slots:A(仅护甲);
       * 只按武器挑词条时,护甲五槽又用不了 crit1/cdmg1/dmg1/bs1。
       * 故取全槽通用的十二种里前九个,保证每件都真能进九条。
       */
      affixes: [
        { id: "atk1", roll: 1 },
        { id: "atk2", roll: 1 },
        { id: "atk3", roll: 1 },
        { id: "def1", roll: 1 },
        { id: "def2", roll: 1 },
        { id: "def3", roll: 1 },
        { id: "hp1", roll: 1 },
        { id: "hp2", roll: 1 },
        { id: "hp3", roll: 1 },
      ],
    });
  }
  return {
    ...base,
    inventory: {
      ...base.inventory,
      items,
      // equipped 必须指向 items 里真有的 uid:base 那张图指的是 smoke_w / smoke_a,
      // 而这两个 uid 已被替换掉 —— sanitize 找不到就会把装备栏整个清空
      equipped: Object.fromEntries(SLOTS.map((slot, i) => [slot, `perf_stress_${i}`])),
      pills: { p_xuanyuan: 999 },
      artifacts: [],
      equippedArtifacts: [],
    },
  };
}

/** 欢迎页与建号页有档即被路由重定向,不列入 */
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

/** 页内 rAF 采样器,`__perfStop()` 汇总;IIFE 套 void,`evaluate(SAMPLER)` 才不等未 resolve 的 Promise */
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
    // 每视图注入一份后期档;缺档会落到欢迎页,门量空
    await seedSave(context, stress ? stressSlices() : lateSlices());
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
  else if (gate && r.frames < BUDGET.minFramesPerSecond * secs)
    failures.push(
      `${r.name}: 只采到 ${r.frames} 帧(< ${BUDGET.minFramesPerSecond * secs})—— 页面被长任务卡死,max/median 都不可信,本门等于空转`,
    );
  else if (gate && !(r.max > 0))
    failures.push(`${r.name}: 最差帧读数 ${r.max}ms 非正数 —— 帧间隔没测出来`);
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
