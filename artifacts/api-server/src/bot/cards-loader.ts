/**
 * cards-loader.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Reads cards.json (written by the GitHub Actions scraper) and syncs any new
 * or updated cards into the bot's SQLite database.
 *
 * Called once at bot startup. Fast — only processes cards not already in DB.
 *
 * Card ownership, issue numbers, trades, deck, etc. are all managed by SQLite
 * as normal. This loader only populates the cards table (metadata + image_data).
 *
 * cards.json location: repo root → ../../cards.json from api-server/
 * cards-media/ location: repo root → ../../cards-media/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./db/database.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// cards.json lives at the repo root, two levels up from artifacts/api-server/src/bot/
const CARDS_JSON  = path.resolve(__dirname, "../../../../cards.json");
const MEDIA_DIR   = path.resolve(__dirname, "../../../../cards-media");

export async function loadCardsFromRepo(): Promise<{ imported: number; updated: number; skipped: number }> {
  const stats = { imported: 0, updated: 0, skipped: 0 };

  if (!fs.existsSync(CARDS_JSON)) {
    logger.info("cards.json not found — skipping card loader (run GitHub Actions scraper first)");
    return stats;
  }

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(CARDS_JSON, "utf8"));
  } catch (e) {
    logger.warn({ e }, "Failed to parse cards.json — skipping loader");
    return stats;
  }

  const cards: any[] = data.cards || [];
  if (cards.length === 0) {
    logger.info("cards.json is empty — nothing to load");
    return stats;
  }

  logger.info({ total: cards.length }, "Loading cards from cards.json into SQLite...");

  const db = getDb();

  for (const card of cards) {
    const shoobId = String(card.shoob_id || "").trim();
    if (!shoobId) { stats.skipped++; continue; }

    // Check if already imported
    const existing = db.prepare(
      "SELECT id FROM cards WHERE shoob_id = ?"
    ).get(shoobId) as any;

    // Load image data from media file
    let imageData: Buffer | null = null;
    const mediaFile = path.resolve(__dirname, "../../../../", card.media_file || "");
    if (card.media_file && fs.existsSync(mediaFile)) {
      try {
        imageData = fs.readFileSync(mediaFile);
      } catch {
        // media file missing or unreadable — card still gets inserted with no image
      }
    }

    if (existing) {
      // Update metadata only (preserve image if we don't have a new one)
      db.prepare(`
        UPDATE cards SET
          name = ?, tier = ?, series = ?, is_animated = ?,
          raw_data = ?, file_hash = ?, has_webm = ?, has_webp = ?, slug = ?,
          source = 'shoob'
          ${imageData ? ", image_data = ?" : ""}
        WHERE id = ?
      `).run(
        card.name, card.tier, card.series, card.is_animated ? 1 : 0,
        JSON.stringify(card.raw || {}),
        card.file_hash || "",
        card.has_webm ? 1 : 0,
        card.has_webp ? 1 : 0,
        card.slug || "",
        ...(imageData ? [imageData] : []),
        existing.id,
      );
      db.prepare(
        "INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?, ?)"
      ).run(shoobId, existing.id);
      stats.updated++;
      continue;
    }

    // New card — generate local ID and insert
    const localId = genId(db);
    try {
      db.prepare(`
        INSERT INTO cards
          (id, name, series, tier, image_data, is_animated,
           uploaded_by, source, shoob_id,
           raw_data, file_hash, has_webm, has_webp, slug)
        VALUES (?, ?, ?, ?, ?, ?, 'github-actions', 'shoob', ?, ?, ?, ?, ?, ?)
      `).run(
        localId,
        card.name,
        card.series,
        card.tier,
        imageData,
        card.is_animated ? 1 : 0,
        shoobId,
        JSON.stringify(card.raw || {}),
        card.file_hash || "",
        card.has_webm ? 1 : 0,
        card.has_webp ? 1 : 0,
        card.slug || "",
      );
      db.prepare(
        "INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?, ?)"
      ).run(shoobId, localId);
      stats.imported++;
    } catch (e: any) {
      logger.warn({ e, shoobId }, "Failed to insert card from cards.json");
      stats.skipped++;
    }
  }

  logger.info(stats, "cards.json load complete");
  return stats;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function genId(db: any): string {
  const { randomBytes } = require("crypto");
  for (let i = 0; i < 50; i++) {
    const candidate = Array.from(randomBytes(8) as Uint8Array)
      .map((b: number) => ID_CHARS[b % ID_CHARS.length])
      .join("");
    if (!db.prepare("SELECT 1 FROM cards WHERE id = ?").get(candidate)) return candidate;
  }
  return "C" + Date.now().toString(36).toUpperCase();
}
