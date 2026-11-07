/* oxlint-disable no-console -- 产出就是给人看的报告 */
/**
 * 首屏自检:冷启动解码字节、FCP、楷体换上(第一次 loadingdone)的时刻,各有上限(见 BUDGETS)
 *
 * 用法:
 *   bun run build && bun scripts/first-paint.mjs                 # 按预算量一遍
 *   bun scripts/first-paint.mjs --variant preload                # 换一份带 preload 的 index.html 再量
 *   bun scripts/first-paint.mjs --variant built --repeat 3       # 连量几遍取中位
 *
 * 走 HTTP 不走 file://(自带静态服务器):file:// 没有传输,量出的字节是假的。
 * 限速到 4G 档:本地回环上量不出「字体抢带宽」。FCP 不该被楷体拖住(font-display: swap)。
 *
 * 基线(2026-10-19,本机 4G 档):冷启动解码 1332KB(含楷体前 5 片 225KB) · FCP 2252ms · 楷体换上 2947ms
 * 预算按基线留约 30% 余量;改完字体/构建方式或换机器须按当时读数重校,见 README 的「性能自检」一节。
 */
import { createServer } from "node:http";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/** 上限:4G 档、冷缓存、390×844 */
const BUDGETS = {
  /** 冷启动解码字节上限(含楷体),单位:KB;线传字节随产物压缩率变化,只另印一行 */
  bytes: Number(process.env.FIRST_PAINT_BUDGET_KB ?? 1500),
  /** FCP 上限:ms */
  fcp: Number(process.env.FIRST_PAINT_BUDGET_FCP ?? 3000),
  /** 楷体换上的时刻上限:ms;只守"字体加载奇慢",量级回归由 fontBytes 拦 */
  fontSwap: Number(process.env.FIRST_PAINT_BUDGET_FONT ?? 3800),
  /** 楷体子集总字节上限:KB;防整份 ~1.8MB 打进来,与机器快慢无关,不能松 */
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

/** 产物里楷体第一片(按用法频次最热)的文件名,preload 变体拿它写 <link rel=preload> */
function fontFile() {
  const cssDir = join(DIST, "assets");
  const files = readdirSync(cssDir).filter((f) => f.endsWith(".woff2"));
  if (!files.length) throw new Error("产物里没有 woff2 —— 字体没进 dist,先 bun run build");
  const first = files.find((f) => /subset-1-/.test(f));
  return first ?? files[0];
}

/** 静态服务器照常吐 dist;`--variant preload` 时往 index.html 的 <head> 插一条 preload 链接(同一产物上的 A/B) */
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

async function coldStart(browser, origin) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    // 新 context 即空 HTTP 缓存
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__kaiSwap = null;
    try {
      document.fonts.addEventListener("loadingdone", () => {
        if (window.__kaiSwap === null) window.__kaiSwap = performance.now();
      });
    } catch {
      /* 老 WebView 没有 FontFaceSet:不量这一条,报 null */
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
   * 字节账:线传取 `content-length`(上了 gzip/br 就是压缩后),解码取响应体长度,同一来源。
   * 须等字体落定再结账:load+1.5s 就收数会把 4G 档上没下完的楷体算成 0 字节;CDP 的 encodedDataLength 同样漏字体。
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
// 首屏取了哪几片楷体:按需切片生效的证据;总字节对 BUDGETS.fontBytes
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
// 防空转:量不到楷体(字体没进产物/名字写错)时字体预算永远绿
if (!runs[0].marks.kaiUsable)
  failures.push("楷体没被用上(dist 里没有字体、或 family 名对不上)—— 字体那条预算空转了");
if (runs[0].marks.fcp === null) failures.push("拿不到 FCP —— 判据空转了");
if (fontBytes > BUDGETS.fontBytes * 1024)
  failures.push(
    `楷体子集 ${kb(fontBytes)} 超过预算 ${kb(BUDGETS.fontBytes * 1024)} —— 「整份打进来」的回归在这里红,与机器快慢无关`,
  );

/*
 * 余量提示(不判红)。
 *
 * 三条预算都按基线留了约三成余量,于是「离上限只剩一成」这个状态是静默的 ——
 * 下一处小改动就可能把某条顶过线,而红的时候已经不知道是哪天开始变紧的。
 * 实测现状:FCP 2588ms / 预算 3000ms(余 14%),已比基线 2252ms 涨了 14%。
 * 读到这条的人该去核一下是产物真涨了,还是本机负载不同。
 */
const TIGHT_RATIO = 0.85;
const tight = [];
const readings = [
  ["冷启动解码字节", median(total) / (BUDGETS.bytes * 1024)],
  ["FCP", median(fcp) / BUDGETS.fcp],
  ["楷体换上", median(swap) / BUDGETS.fontSwap],
  ["楷体子集", fontBytes / (BUDGETS.fontBytes * 1024)],
];
for (const [name, ratio] of readings) {
  if (Number.isFinite(ratio) && ratio >= TIGHT_RATIO && ratio <= 1) {
    tight.push(`${name} 已用掉 ${(ratio * 100).toFixed(0)}% 预算`);
  }
}

if (failures.length) {
  for (const f of failures) console.log(`✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log("✓ 首屏三条读数都在预算内");
  if (tight.length) console.log(`· 余量偏紧:${tight.join(" · ")} —— 核对是否产物真的涨了`);
}
