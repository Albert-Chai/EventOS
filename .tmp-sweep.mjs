import { chromium } from "@playwright/test";
const BASE="http://localhost:3000";
const E="/kl-food-lifestyle-collective/weekend-flavours-2026";
const b=await chromium.launch(); const c=await b.newContext(); const p=await c.newPage();

// Real ids from the live facets, so we prove the filters still *work*.
await p.goto(`${BASE}${E}/merchants`,{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1200);
const chip = await p.locator("a[href*='category=']").first().getAttribute("href").catch(()=>null);
console.log("a real category chip:", chip ?? "(none rendered)");

const JUNK = ["abc","1'%20or%20'1","..%2F..%2Fetc%2Fpasswd","%00","new","-1",
              "1b9d6bcd-bbfd-4b2d-9b5d","<script>alert(1)</script>"];
const targets = [];
for (const j of JUNK) {
  targets.push(`${E}/merchants?category=${j}`, `${E}/merchants?zone=${j}`,
               `${E}/moments/${j}`, `${E}/map?booth=${j}`, `/s/${j}`, `/q/${j}`);
}
targets.push(`${E}/merchants?priceMin=${"9".repeat(400)}`, `${E}/moments?view=${"x".repeat(500)}`);
if (chip) targets.push(chip);

let bad = 0;
for (const t of targets) {
  const res = await p.goto(BASE+t, {waitUntil:"domcontentloaded"}).catch(()=>null);
  const code = res?.status() ?? 0;
  if (code >= 500) { bad++; console.log(`  ✗ ${code}  ${t}`); }
}
console.log(bad === 0 ? `✓ ${targets.length} hostile URLs, no 5xx` : `✗ ${bad} of ${targets.length} still 5xx`);

// The real chip must still filter.
if (chip) {
  await p.goto(BASE+chip,{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(1200);
  const filtered = await p.locator("ul > li").count();
  await p.goto(`${BASE}${E}/merchants`,{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(1200);
  const all = await p.locator("ul > li").count();
  console.log(`${filtered < all ? "✓" : "✗"} a real category filter still narrows results (${filtered} of ${all})`);
}
await b.close();
