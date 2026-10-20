/* oxlint-disable no-console -- 自检脚本的产出就是给人看的报告 */
/**
 * 首屏自检 —— 冷启动要传多少字节、第几毫秒看得见字、楷体第几毫秒换上
 *
 * 用法:
 *   bun run build && bun scripts/first-paint.mjs                 # 按预算量一遍(CI 用这个)
 *   bun scripts/first-paint.mjs --variant preload                # 换一份带 preload 的 index.html 再量
 *   bun scripts/first-paint.mjs --variant built --repeat 3       # 连量几遍取中位(本机自测用)
 *
 * 为什么要有这一条
 * ----------------
 * 「首屏多大、多快」此前全靠人记得跑一次 `du -sh dist`,没有任何门。于是楷体子集长到
 * 1.8MB、legacy 产物在每次构建里多打一份,都没有东西拦得住。这里把三件事量成数字:
 *   一 **冷启动传输**:从 document 到 load 之后再静一会儿,这一趟真正过了线的字节
 *      (CDP 的 encodedDataLength,不是 `du` 的磁盘占用 —— 两者差着 gzip 与压缩率);
 *   二 **FCP**:第一块内容画出来的时刻。字体走的是 font-display: swap,所以它**不**该
 *      被楷体拖住 —— 这一条正是为了守住这句话;
 *   三 **楷体换上的时刻**:swap 那一瞬间(第一次 loadingdone)。FCP 与它的差,就是玩家
 *      看着回退字体读了几百毫秒的时间 —— 「要不要上 preload」这个取舍得看这两个数,
 *      而不是看字体文件的大小(它是首屏 JS+CSS 的二十倍,抢带宽未必划算)。
 *
 * 量法上的两个讲究
 * ----------------
 * · **走 HTTP,不走 file://**:file:// 没有传输这回事(没有响应头、没有 gzip、没有
 *   `encodedDataLength`),量出来的"字节"是假的。故这里自带一个小静态服务器。
 * · **限速到 4G**:本地回环上一切都是一毫秒,量不出取舍。用 CDP 把下行压到 4Mbps、
 *   RTT 100ms(DevTools 的 4G 档),让「字体抢带宽」这件事真的发生。
 *
 * 判据:三条读数各有上限(见 BUDGETS)。红了先看报告里的分项 —— 是哪一类资源涨了。
 *
 * 在本仓量到的读数(2026-10-19,本机 4G 档):
 *   冷启动解码 1332KB(含楷体 225KB) · FCP 2252ms · 楷体换上 2947ms
 *   —— 楷体只取到前 5 片(225KB),不是整份 1.8MB:这是切片按需生效的证据。
 *
 * 预算怎么定、何时重定,见 README 的「性能自检」一节。默认值按上面这组读数
 * 留约 30% 余量;拿到 CI 或更快的机器上、或改完字体/构建方式时,要按当时读数重校一次。
 */
import { createServer } from "node:http";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/**
 * 三条上限(4G 档、冷缓存、390×844)。
 *
 * 定法:先量出真实读数,再按「留出约 30% 余量」定上限 —— 余量是为了让机型/版本差异
 * 不至于一有风吹草动就红,而不是为了让当前这份读数勉强过关。改完字体或构建方式,
 * 这两个数要跟着重定一次(见 README 的「性能自检」一节)。
 */
const BUDGETS = {
  /**
   * 冷启动**解码**字节上限(含楷体):KB。
   *
   * 用解码后的字节而不是线传字节当主读数:上一轮记下的 2.6MB 就是这个口径(1.8MB 楷体
   * + 约 0.8MB JS/CSS),两者可比;而且浏览器真正要解析的就是这些字节。线传字节
   * (gzip 之后)另印一行,它随产物压缩率变化,不适合当唯一上限。
   */
  bytes: Number(process.env.FIRST_PAINT_BUDGET_KB ?? 1500),
  /** FCP 上限:ms */
  fcp: Number(process.env.FIRST_PAINT_BUDGET_FCP ?? 3000),
  /**
   * 楷体换上的时刻上限:ms —— 时序是**二级**信号,量级守卫请看 fontBytes。
   *
   * 本机切完片后实测 ~2947ms,3800 给约 30% 余量。这一条只守"字体加载奇慢";
   * 「整份 1.8MB 楷体打进来」那种量级回归由 fontBytes 断言确定性拦截,与机器快慢无关。
   */
  fontSwap: Number(process.env.FIRST_PAINT_BUDGET_FONT ?? 3800),
  /**
   * 楷体**子集**总字节上限:KB —— 反「整份打进来」的硬判据。
   *
   * 按需切片后首屏只取前几片 ~225KB;整份字体 ~1.8MB。600KB 上限给足合法生长空间
   * (字形加字只长一点也放行),十倍于头的量级回归当场红。这一条**确定性**、
   * 与机器快慢无关 —— 时序预算可以松,它不能松。
   */
  fontBytes: Number(process.env.FIRST_PAINT_BUDGET_FONT_KB ?? 600),
};

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const VARIANT = argOf("--variant", "built"); // built | preload
const REPEAT = Number(argOf("--repeat", "1"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/**
 * 产物里的楷体切片名(带 hash),preload 变体要拿它写 <link rel=preload>。
 *
 * 取的是**第一片**:它是按用法频次切出来的最热那一片,首屏多半真会用到它 —— 这也正是
 * 「要不要 preload」这个取舍的关键:preload 只会提前拽第一片,后面几片该来还得来。
 */
function fontFile() {
  const cssDir = join(DIST, "assets");
  const files = readdirSync(cssDir).filter((f) => f.endsWith(".woff2"));
  if (!files.length) throw new Error("产物里没有 woff2 —— 字体没进 dist,先 bun run build");
  const first = files.find((f) => /subset-1-/.test(f));
  return first ?? files[0];
}

/**
 * 静态服务器:照常吐 dist,只对 index.html 做一件事 —— `--variant preload` 时往 <head> 里
 * 插一条 preload 链接。这样「加不加 preload」是**同一个产物**上的 A/B,量的差就是
 * 那一条链接的差,不掺构建差异。
 */
function startServer() {
  const preload = VARIANT === "preload";
  const font = preload ? fontFile() : null;
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
      if (rel.includes("..")) {
        res.writeHead(400).end("bad path");
        return;
      }
      let body;
      try {
        body = readFileSync(join(DIST, rel));
      } catch {
        res.writeHead(404).end("not found");
        return;
      }
      const type = MIME[extname(rel)] ?? "application/octet-stream";
      if (rel === "index.html" && preload && font) {
        const html = body
          .toString("utf-8")
          .replace(
            "</head>",
            `  <link rel="preload" href="./assets/${font}" as="font" type="font/woff2" crossorigin>\n  </head>`,
          );
        body = Buffer.from(html, "utf-8");
      }
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "no-store",
        "content-length": body.length,
      });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

/** 一趟冷启动:清缓存 → 限速 4G → 打开首页 → 收字节与时刻 */
async function coldStart(browser, origin) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    // 每次都是新 context:HTTP 缓存天然是空的,故"冷启动"名副其实
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // swap 那一瞬间:楷体第一次可用(loadingdone)
    window.__kaiSwap = null;
    try {
      document.fonts.addEventListener("loadingdone", () => {
        if (window.__kaiSwap === null) window.__kaiSwap = performance.now();
      });
    } catch {
      /* 老的 WebView 没有 FontFaceSet:那就不量这一条,下面会报 null */
    }
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  // DevTools 的 4G 档:下行 4Mbps、上行 3Mbps、RTT 100ms
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });
  const encodedByType = new Map();
  let encodedBytes = 0;
  /**
   * 字节账:逐个响应量两遍 —— 线传看 `content-length`(上了 gzip/br 就是压缩后的大小),
   * 解码看响应体长度(浏览器真正要解析的)。
   *
   * **必须等字体落定再结账**:上一版在 load+1.5s 就收数,1.8MB 的楷体在 4G 档上下不完,
   * 那一趟直接把字体算成 0 字节(实测踩过)。另一版改用 CDP 的 encodedDataLength 也一样
   * 漏掉了字体 —— 同一份账用同一个来源算,比两处各记一份更不容易分叉。
   */
  const decodedByType = new Map();
  let decodedBytes = 0;
  const resources = [];
  page.on("response", async (resp) => {
    try {
      const body = await resp.body();
      const req = resp.request();
      const type =
        req.resourceType() === "document"
          ? "Document"
          : `${req.resourceType()[0].toUpperCase()}${req.resourceType().slice(1)}`;
      const wire = Number(resp.headers()["content-length"] ?? 0) || body.length;
      decodedBytes += body.length;
      decodedByType.set(type, (decodedByType.get(type) ?? 0) + body.length);
      encodedBytes += wire;
      encodedByType.set(type, (encodedByType.get(type) ?? 0) + wire);
      resources.push({ type, url: resp.url(), bytes: body.length });
    } catch {
      /* 预检/中止的请求拿不到体,忽略 */
    }
  });
  const t0 = Date.now();
  await page.goto(origin, { waitUntil: "load" });
  // 等字体落定(swap 那一瞬间在这里发生);拿不到就按 6 秒封顶
  await page
    .evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 6000))]))
    .catch(() => {});
  await page.waitForTimeout(400); // 让最后几个响应体结算
  const marks = await page.evaluate(async () => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    let ready = null;
    try {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
      ready = performance.now();
    } catch {
      /* ignore */
    }
    return {
      fcp,
      fontReady: ready,
      fontSwap: window.__kaiSwap,
      kaiUsable: document.fonts?.check?.('12px "LXGW WenKai GB Screen"') ?? null,
      title: document.title,
    };
  });
  const wall = Date.now() - t0;
  await ctx.close();
  return {
    decodedBytes,
    encodedBytes,
    byType: [...decodedByType].sort((a, b) => b[1] - a[1]),
    encodedByType: [...encodedByType].sort((a, b) => b[1] - a[1]),
    resources,
    marks,
    wall,
  };
}

const kb = (n) => `${Math.round(n / 1024)}KB`;
const ms = (n) => (n === null || n === undefined ? "—" : `${Math.round(n)}ms`);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

mkdirSync(DIST, { recursive: true });
const server = await startServer();
const origin = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const runs = [];
for (let i = 0; i < REPEAT; i += 1) runs.push(await coldStart(browser, origin));
await browser.close();
server.close();

const total = runs.map((r) => r.decodedBytes);
const wire = runs.map((r) => r.encodedBytes);
const fcp = runs.map((r) => r.marks.fcp ?? Infinity);
const swap = runs.map((r) => r.marks.fontSwap ?? Infinity);
const decodedOf = Object.fromEntries(runs[0].byType);
const encodedOf = Object.fromEntries(runs[0].encodedByType);
const types = [...new Set([...Object.keys(decodedOf), ...Object.keys(encodedOf)])].sort(
  (a, b) => (decodedOf[b] ?? 0) - (decodedOf[a] ?? 0),
);
console.log(
  `首屏自检(变体 ${VARIANT}${REPEAT > 1 ? `,${REPEAT} 遍取中位` : ""} · 390×844 · 冷缓存 · 4G 档)`,
);
console.log(
  `  冷启动解码字节 ${kb(median(total))}  —— 预算 ${kb(BUDGETS.bytes * 1024)}(线传 ${kb(median(wire))})`,
);
for (const type of types)
  console.log(
    `    ${type.padEnd(10)} 解码 ${kb(decodedOf[type] ?? 0).padStart(6)} · 线传 ${kb(encodedOf[type] ?? 0).padStart(6)}`,
  );
console.log(`  FCP       ${ms(median(fcp))}  —— 预算 ${ms(BUDGETS.fcp)}`);
console.log(`  楷体换上   ${ms(median(swap))}  —— 预算 ${ms(BUDGETS.fontSwap)}`);
console.log(
  `  楷体可用:${runs[0].marks.kaiUsable ? "是" : "否"} · 字体就绪 ${ms(runs[0].marks.fontReady)}`,
);
// 首屏到底取了哪几片楷体 —— 「按需」这件事要看得出证据,不然切片白切了也不知道;
// 总字节同时是反「整份打进来」的确定性判据(见 BUDGETS.fontBytes 的说明)
const fontReqs = runs[0].resources.filter((r) => r.type === "Font");
const fontBytes = fontReqs.reduce((n, r) => n + r.bytes, 0);
console.log(`  楷体切片:取了 ${fontReqs.length} 份 · ${kb(fontBytes)}`);
for (const r of fontReqs) console.log(`    ${kb(r.bytes).padStart(6)}  ${r.url.split("/").pop()}`);

const failures = [];
if (median(total) > BUDGETS.bytes * 1024)
  failures.push(`冷启动解码字节 ${kb(median(total))} 超过预算 ${kb(BUDGETS.bytes * 1024)}`);
if (median(fcp) > BUDGETS.fcp) failures.push(`FCP ${ms(median(fcp))} 超过预算 ${ms(BUDGETS.fcp)}`);
if (median(swap) > BUDGETS.fontSwap)
  failures.push(`楷体换上太晚:${ms(median(swap))} 超过预算 ${ms(BUDGETS.fontSwap)}`);
// 防空转:量不到楷体(字体没进产物/名字写错)时,那条预算永远绿
if (!runs[0].marks.kaiUsable)
  failures.push("楷体没被用上(dist 里没有字体、或 family 名对不上)—— 字体那条预算空转了");
if (runs[0].marks.fcp === null) failures.push("拿不到 FCP —— 判据空转了");
if (fontBytes > BUDGETS.fontBytes * 1024)
  failures.push(
    `楷体子集 ${kb(fontBytes)} 超过预算 ${kb(BUDGETS.fontBytes * 1024)} —— 「整份打进来」的回归在这里红,与机器快慢无关`,
  );

if (failures.length) {
  for (const f of failures) console.log(`✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log("✓ 首屏三条读数都在预算内");
}
