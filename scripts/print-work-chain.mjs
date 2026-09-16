import { chromium } from "playwright";
import { mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = resolve(root, "docs/goki-work-chain.html");
const outDir = resolve(root, "artifacts");
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, "GOKI-工作链.pdf");
const publicDir = resolve(root, "public");
mkdirSync(publicDir, { recursive: true });

if (!existsSync(html)) {
  console.error("missing html", html);
  process.exit(1);
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage();
  await page.goto(`file://${html}`, { waitUntil: "load", timeout: 30000 });
  await page.pdf({
    path: out,
    format: "A4",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size:8px;color:#7A7368;width:100%;padding:0 14mm;font-family:sans-serif;">GOKI · WP-2026-0916</div>',
    footerTemplate:
      '<div style="font-size:8px;color:#7A7368;width:100%;padding:0 14mm;font-family:sans-serif;display:flex;justify-content:space-between;"><span>年报审核工作链 · 工作底稿</span><span>第 <span class="pageNumber"></span> / <span class="totalPages"></span> 页</span></div>',
    margin: { top: "14mm", bottom: "14mm", left: "0", right: "0" },
  });
} finally {
  await browser.close();
}

if (!existsSync(out) || statSync(out).size < 1000) {
  console.error("pdf not written", out, existsSync(out) ? statSync(out).size : 0);
  process.exit(1);
}
copyFileSync(out, resolve(publicDir, "goki-work-chain.pdf"));
console.log("wrote", out, statSync(out).size);
