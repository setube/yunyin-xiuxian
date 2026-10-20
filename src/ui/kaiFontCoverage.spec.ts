/* eslint-disable no-console */
/**
 * 楷体子集 · 覆盖验收
 *
 * 安卓不带楷体,故随包带一份霞鹜文楷(GB 屏幕阅读版)子集 —— 生成脚本:
 * scripts/fonts/build-kai-font.py。三端已统一用这份字体,所以「字体里有没有这个字」
 * 直接决定所有端看到的字形。
 *
 * 子集是**裁过再切片的**:只留生成那一刻源码里出现的字 + GB2312 全字集,而且按用法
 * 频次切成二十来片(每片一段 unicode-range,浏览器按需取)。于是这里埋着两种只在内容
 * 更新时才现形的事故:新写的文案用了一个子集外的字(那一处掉回系统字体,整句里混进
 * 一个异类字形,比整句都用衬线更显眼);或者切片与 @font-face 的 unicode-range 对不上
 * (那一批字会被判给一片没装它们的字体,拉下来也画不出)。
 *
 * 三条判据:
 *   一 源码与模板里用到的每个字符,要么在**字体真实的 cmap** 里,要么在生成脚本
 *      记下的「交给系统字体画」名单里(▬▸▾◈✧ 这类装饰符号,母体里本来就没有)——
 *      红了就重跑生成脚本。注意比对的是字体实际收进去的字,不是「我要求收的字」:
 *      两者会差,照抄请求集等于开了张空头支票。
 *   二 每一片字体文件本身要与记账对得上(sha256 + 字数)—— 只手改字表不重做字体,
 *      等于账面上覆盖了、文件里没有。
 *   三 生成的 kai-subset.css 里,每一片的 unicode-range 与记账里的那一份逐字相同,
 *      而且没有孤儿:产物目录里的每一片都在记账里,记账里的每一片都在声明里。
 *      (CSS 是生成物,判在这里而不是靠人眼 —— 「有字拉不下来」这种错太难看出。)
 *
 * 三条都移植自参考仓(玄枢录 src/ui/kaiFontCoverage.spec.ts)。
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CHARS_FILE = resolve(ROOT, "scripts/fonts/kai-subset.chars.txt");
const META_FILE = resolve(ROOT, "scripts/fonts/kai-subset.meta.json");
const FONT_DIR = resolve(ROOT, "src/assets/fonts");
const CSS_FILE = join(FONT_DIR, "kai-subset.css");

interface ChunkMeta {
  file: string;
  chars: number;
  bytes: number;
  sha256: string;
  unicode_range: string;
}

/**
 * src 下所有 .ts/.vue/.js(跳过 *.spec.ts)+ 入口 index.html 里出现过的字符 ——
 * 与生成脚本的 needed_chars() 同一条规则:用例里有别人写下的正则区间端点
 * (如 /[⺀-鿿　-〿＀-￯]/ 的两端),那两个字符不会出现在界面上,不该算进来。
 */
function sourceChars(): Set<string> {
  const chars = new Set<string>();
  const eat = (text: string) => {
    for (const c of text) if (!/\s/.test(c)) chars.add(c);
  };
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|vue|js)$/.test(entry.name) && !entry.name.endsWith(".spec.ts"))
        eat(readFileSync(path, "utf-8"));
    }
  };
  walk(resolve(ROOT, "src"));
  eat(readFileSync(resolve(ROOT, "index.html"), "utf-8"));
  return chars;
}

describe("楷体子集 · 覆盖", () => {
  it("源码与模板里用到的每个字,要么字体画得出,要么在「交给系统字体」名单里", () => {
    // 字表是生成脚本从**产物**读回来的真实 cmap,不是「要求包含的字」
    const subset = new Set(readFileSync(CHARS_FILE, "utf-8"));
    const meta = JSON.parse(readFileSync(META_FILE, "utf-8")) as {
      delegated_to_system?: string;
      subset_chars: number;
    };
    const delegated = new Set(meta.delegated_to_system ?? "");
    const missing = [...sourceChars()].filter((c) => !subset.has(c) && !delegated.has(c));
    if (missing.length > 0) {
      console.log(
        `子集缺字 ${missing.length} 个:${missing.slice(0, 40).join("")}${missing.length > 40 ? " …" : ""}`,
      );
    }
    // 缺字意味着安卓上那几个字会突然换成衬线字体 —— 重跑生成脚本即可
    expect(missing.join("")).toBe("");
  });

  it("字体文件与记账文件对得上(换了字体就得重跑生成脚本)", () => {
    const meta = JSON.parse(readFileSync(META_FILE, "utf-8")) as {
      subset_chars: number;
      chunks: ChunkMeta[];
    };
    // 字形子集文件本身就是全角字:spread 逐码点清点字符数,与 needed_chars 同口径。
    expect([...readFileSync(CHARS_FILE, "utf-8")].length).toBe(meta.subset_chars);
    expect(meta.chunks.length, "切片少得不像话 —— 生成脚本或记账被改坏了").toBeGreaterThan(1);
    let total = 0;
    for (const chunk of meta.chunks) {
      const file = join(FONT_DIR, chunk.file);
      const bytes = readFileSync(file);
      total += bytes.length;
      expect(createHash("sha256").update(bytes).digest("hex"), `${chunk.file} 与记账对不上`).toBe(
        chunk.sha256,
      );
      expect(bytes.length, `${chunk.file} 的体积与记账对不上`).toBe(chunk.bytes);
    }
    // 顺带钉住体积:切片合计在 2MB 量级,长到几 MB 说明裁剪范围被改坏了
    expect(total).toBeLessThan(6 * 1024 * 1024);
    expect(meta.chunks.reduce((n, c) => n + c.chars, 0)).toBeGreaterThanOrEqual(meta.subset_chars);
  });

  it("每一片的 @font-face 与它的 unicode-range 逐字对得上,而且没有孤儿片", () => {
    const meta = JSON.parse(readFileSync(META_FILE, "utf-8")) as { chunks: ChunkMeta[] };
    const css = readFileSync(CSS_FILE, "utf-8");
    // 一条 @font-face 读成 { 文件名, unicode-range }
    const declared = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
      const body = m[1]!;
      const file = /url\(["']\.\/([^"']+)["']\)/.exec(body)?.[1] ?? "";
      const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      return { file, range };
    });
    expect(declared.length, "CSS 里的 @font-face 条数与切片数对不上").toBe(meta.chunks.length);
    for (const chunk of meta.chunks) {
      const row = declared.find((d) => d.file === chunk.file);
      expect(row, `${chunk.file} 没有对应的 @font-face 声明`).toBeTruthy();
      // 逐字相同:范围抄错一个字,那一批字就会被判给一片没装它们的字体
      expect(row!.range, `${chunk.file} 的 unicode-range 与记账不一致(重跑生成脚本)`).toBe(
        chunk.unicode_range.replace(/\s+/g, " ").trim(),
      );
    }
    // 产物目录里的每一片都得在记账里(孤儿文件 = 有人手搓了一份字体丢进来)
    const files = readdirSync(FONT_DIR).filter((f) => f.endsWith(".woff2"));
    const known = new Set(meta.chunks.map((c) => c.file));
    expect(
      files.filter((f) => !known.has(f)),
      "有切片没进记账",
    ).toEqual([]);
  });
});
