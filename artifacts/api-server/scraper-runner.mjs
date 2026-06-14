/**
 * scraper-runner.mjs
 * ──────────────────────────────────────────────────────────────────────────────
 * Runs inside GitHub Actions. Scrapes Shoob.gg via Playwright, writes:
 *
 *   ../../cards.json        — array of card objects (metadata only, no blobs)
 *   ../../cards-media/{id}  — image/video file for each card
 *
 * The bot reads cards.json on startup and loads new cards into its SQLite DB.
 * Images are served from cards-media/ via a static route or fetched on demand.
 *
 * Does NOT touch the bot's SQLite DB directly — that lives on the server.
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config from env ───────────────────────────────────────────────────────────
const MAX_PAGES   = parseInt(process.env.SHOOB_MAX_PAGES  || "50",   10);
const SYNC_ONLY   = process.env.SHOOB_SYNC_ONLY === "true";
const CARDS_OUT   = path.resolve(__dirname, process.env.CARDS_OUTPUT  || "../../cards.json");
const MEDIA_OUT   = path.resolve(__dirname, process.env.MEDIA_OUTPUT  || "../../cards-media");
const PAGE_DELAY  = parseInt(process.env.SHOOB_PAGE_DELAY || "800",  10);
const MEDIA_DELAY = parseInt(process.env.SHOOB_MEDIA_DELAY|| "120",  10);

const SHOOB_CARDS_URL  = "https://shoob.gg/cards";
const SHOOB_CARDR_BASE = "https://api.shoob.gg/site/api/cardr";
const SHOOB_PAGE_SIZE  = 15;

// ── React state extraction (exact logic confirmed working in browser console) ─
const REACT_EXTRACT_SCRIPT = `
  (() => {
    try {
      const el = document.querySelector('.card-main');
      if (!el) return { error: 'no .card-main element found' };
      let f = Object.values(el).find(x => x?.return);
      if (!f) return { error: 'no React fiber found on .card-main' };
      while (f && !f.stateNode?.state?.cards) { f = f.return; }
      if (!f || !f.stateNode?.state?.cards) return { error: 'card state not found in fiber tree' };
      const cards = f.stateNode.state.cards;
      if (!Array.isArray(cards)) return { error: 'cards is not an array' };
      return { cards };
    } catch (e) { return { error: String(e) }; }
  })()
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseTier(raw) {
  if (raw == null) return "T1";
  const s = String(raw).trim().toUpperCase();
  const VALID = ["T1","T2","T3","T4","T5","T6","TS","TX","TZ"];
  if (s.startsWith("T") && VALID.includes(s)) return s;
  if (/^\d$/.test(s)) return `T${s}`;
  if (s === "S") return "TS";
  if (s === "X") return "TX";
  if (s === "Z") return "TZ";
  return "T1";
}

function extractSeries(card) {
  if (Array.isArray(card.category) && card.category.length > 0) {
    return (card.category[0] || "Shoob").trim() || "Shoob";
  }
  return "Shoob";
}

function isAnimated(card) {
  const file = String(card.file || "").toLowerCase();
  return file.endsWith(".gif") || file.endsWith(".webm") ||
    card.has_webp === true || card.has_webm === true || card.patched === true;
}

function mediaUrl(card) {
  const id = card._id || card.id;
  if (card.has_webm) return { url: `${SHOOB_CARDR_BASE}/${id}?type=webm`, ext: "webm" };
  const file = String(card.file || "").toLowerCase();
  if (file.endsWith(".gif")) return { url: `${SHOOB_CARDR_BASE}/${id}?size=400`, ext: "gif" };
  return { url: `${SHOOB_CARDR_BASE}/${id}?size=400`, ext: "jpg" };
}

async function downloadMedia(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Referer": "https://shoob.gg/",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Load existing cards.json so we can do incremental syncs ──────────────────

function loadExistingCards() {
  try {
    if (fs.existsSync(CARDS_OUT)) {
      const data = JSON.parse(fs.readFileSync(CARDS_OUT, "utf8"));
      const map = new Map();
      for (const c of (data.cards || [])) map.set(c.shoob_id, c);
      return map;
    }
  } catch {}
  return new Map();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Shoob scraper starting`);
  console.log(`   Max pages : ${MAX_PAGES}`);
  console.log(`   Sync only : ${SYNC_ONLY}`);
  console.log(`   Output    : ${CARDS_OUT}`);
  console.log(`   Media dir : ${MEDIA_OUT}\n`);

  fs.mkdirSync(MEDIA_OUT, { recursive: true });

  const existingCards = loadExistingCards();
  console.log(`   Existing cards in cards.json: ${existingCards.size}`);

  const allCards = new Map(existingCards); // start with existing, merge new ones in
  const stats = { imported: 0, updated: 0, skipped: 0, errors: 0, totalSeen: 0 };
  const startTime = Date.now();

  // ── Launch Playwright ─────────────────────────────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"],
  });

  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });

  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(20000);

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${SHOOB_CARDS_URL}?page=${pageNum}`;
      console.log(`[Page ${pageNum}/${MAX_PAGES}] Navigating...`);

      // Navigate
      try {
        await page.goto(url, { waitUntil: "networkidle" });
      } catch {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(3000);
        } catch (e) {
          console.warn(`  ⚠ Navigation failed on page ${pageNum}: ${e.message}`);
          break;
        }
      }

      // Wait for cards to render
      try {
        await page.waitForSelector(".card-main", { timeout: 20000 });
      } catch {
        console.warn(`  ⚠ .card-main not found on page ${pageNum} — assuming end of catalogue`);
        break;
      }

      // Extract React state
      const result = await page.evaluate(REACT_EXTRACT_SCRIPT);

      if (result.error) {
        if (pageNum === 1) {
          throw new Error(`React extraction failed on page 1: ${result.error}`);
        }
        console.log(`  End of catalogue reached at page ${pageNum}`);
        break;
      }

      const cards = result.cards || [];
      if (cards.length === 0) {
        console.log(`  No cards on page ${pageNum} — done`);
        break;
      }

      stats.totalSeen += cards.length;
      console.log(`  Got ${cards.length} cards`);

      // Process each card
      for (const card of cards) {
        const shoobId = String(card._id || card.id || "").trim();
        if (!shoobId) { stats.skipped++; continue; }

        const alreadyHave = existingCards.has(shoobId);

        // In sync mode, skip cards we already have media for
        if (SYNC_ONLY && alreadyHave) {
          // Still update metadata in case it changed
          const existing = allCards.get(shoobId);
          if (existing) {
            existing.name   = (card.name || card.slug || shoobId).replace(/_/g, " ");
            existing.tier   = normaliseTier(card.tier);
            existing.series = extractSeries(card);
            existing.raw    = card;
          }
          stats.skipped++;
          continue;
        }

        const cardName = (card.name || card.slug || shoobId).trim().replace(/_/g, " ");
        const tier     = normaliseTier(card.tier);
        const series   = extractSeries(card);
        const animated = isAnimated(card);
        const { url: mUrl, ext } = mediaUrl(card);

        // Download media
        const mediaFile = path.join(MEDIA_OUT, `${shoobId}.${ext}`);
        let hasMedia = fs.existsSync(mediaFile);

        if (!hasMedia || !SYNC_ONLY) {
          const buf = await downloadMedia(mUrl);
          if (buf) {
            fs.writeFileSync(mediaFile, buf);
            hasMedia = true;
          } else {
            stats.errors++;
            console.warn(`  ⚠ Failed to download media for ${cardName} (${shoobId})`);
          }
          await sleep(MEDIA_DELAY);
        }

        // Build card record (no image blobs — just metadata + file reference)
        const record = {
          shoob_id   : shoobId,
          name       : cardName,
          tier,
          series,
          is_animated: animated,
          media_file : `cards-media/${shoobId}.${ext}`,
          media_ext  : ext,
          has_webm   : card.has_webm === true,
          has_webp   : card.has_webp === true,
          slug       : card.slug || "",
          file_hash  : card.file || "",
          raw        : card,
          scraped_at : Math.floor(Date.now() / 1000),
        };

        if (alreadyHave) {
          stats.updated++;
        } else {
          stats.imported++;
        }
        allCards.set(shoobId, record);
      }

      // Save cards.json after every page so we don't lose progress if interrupted
      const output = {
        version    : 1,
        total      : allCards.size,
        updated_at : new Date().toISOString(),
        cards      : [...allCards.values()],
      };
      fs.writeFileSync(CARDS_OUT, JSON.stringify(output, null, 2));

      // Progress update every 5 pages
      if (pageNum % 5 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n📊 Progress after page ${pageNum}:`);
        console.log(`   Total seen : ${stats.totalSeen}`);
        console.log(`   Imported   : ${stats.imported}`);
        console.log(`   Updated    : ${stats.updated}`);
        console.log(`   Skipped    : ${stats.skipped}`);
        console.log(`   Errors     : ${stats.errors}`);
        console.log(`   Elapsed    : ${elapsed}s\n`);
      }

      if (cards.length < SHOOB_PAGE_SIZE) {
        console.log(`  Last page reached (${cards.length} < ${SHOOB_PAGE_SIZE})`);
        break;
      }

      await sleep(PAGE_DELAY);
    }
  } finally {
    await browser.close();
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ Scrape complete!`);
  console.log(`   Total cards in DB : ${allCards.size}`);
  console.log(`   New imported      : ${stats.imported}`);
  console.log(`   Updated           : ${stats.updated}`);
  console.log(`   Skipped           : ${stats.skipped}`);
  console.log(`   Media errors      : ${stats.errors}`);
  console.log(`   Duration          : ${duration}s`);
  console.log(`   Output            : ${CARDS_OUT}`);
  console.log(`${"=".repeat(50)}\n`);
}

main().catch(err => {
  console.error("❌ Scraper failed:", err);
  process.exit(1);
});
