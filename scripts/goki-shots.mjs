import { chromium } from "playwright";

const base = "http://127.0.0.1:8080";
const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function shot(page, name) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    title: document.querySelector("h1")?.textContent,
  }));
  console.log(name, box.title, "overflow", box.scroll - box.client);
}

for (const [w, h, tag] of [
  [1280, 800, "d"],
  [390, 844, "m"],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.setDefaultTimeout(60000);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await shot(page, `home-${tag}`);

  await page.goto(base + "/models", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForFunction(() => document.body.innerText.includes("Map-Net") && document.body.innerText.includes("Completeness-Net") && document.body.innerText.includes("params"), { timeout: 45000 });
  await shot(page, `models-${tag}`);

  await page.goto(base + "/issuer/hk-00005", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1500);
  await shot(page, `hsbc-${tag}`);

  await page.goto(base + "/issuer/hk-00016", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1200);
  await shot(page, `shkp-${tag}`);

  await page.goto(base + "/issuer/hk-00388", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1200);
  await shot(page, `hkex-${tag}`);

  await page.goto(base + "/issuer/hk-00883", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(1200);
  await shot(page, `cnooc-${tag}`);

  await page.goto(base + "/map", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForFunction(() => document.body.innerText.includes("科目映射") && document.body.innerText.includes("规范科目"), { timeout: 45000 });
  await shot(page, `map-${tag}`);

  await page.goto(base + "/rules", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await shot(page, `rules-${tag}`);
  await page.close();
}

await browser.close();
console.log("done");
