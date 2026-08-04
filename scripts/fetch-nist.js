#!/usr/bin/env node
/**
 * CyberScope — ดึงข่าว/ประกาศล่าสุดจาก NIST แล้วเขียนลง data/nist.json
 *
 * แหล่งข้อมูล:
 *  1. NIST Cybersecurity Insights (บล็อกทางการด้านไซเบอร์ของ NIST) — เอาทุกโพสต์
 *  2. NIST News (ข่าวรวมทุกสาขาของ NIST) — กรองเฉพาะเรื่องไซเบอร์/การเข้ารหัส
 *
 * รันด้วยมือ:  npm run fetch-nist
 * รันอัตโนมัติ: GitHub Actions (.github/workflows/update-news.yml) ทุกวัน
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");

const OUTPUT_FILE = path.join(__dirname, "..", "data", "nist.json");
const MAX_ITEMS = 15;
const MAX_AGE_DAYS = 240; // NIST ออกข่าวไม่ถี่ ให้ย้อนหลังได้ไกลกว่า feed ข่าวทั่วไป
const FEED_TIMEOUT_MS = 20000;

const FEEDS = [
  {
    name: "NIST Cybersecurity Insights",
    url: "https://www.nist.gov/blogs/cybersecurity-insights/rss.xml",
    filter: false // บล็อกไซเบอร์โดยตรง ไม่ต้องกรอง
  },
  {
    name: "NIST News",
    url: "https://www.nist.gov/news-events/news/rss.xml",
    filter: true // ข่าวรวมทุกสาขา ต้องกรองเฉพาะเรื่องไซเบอร์
  }
];

const CYBER_KEYWORDS = [
  "cybersecurity", "cyber security", "security", "csf", "framework",
  "encryption", "cryptograph", "post-quantum", "quantum", "pqc",
  "privacy", "identity", "authentication", "zero trust", "ransomware",
  "vulnerability", "nvd", "risk management", "ai safety", "fips",
  "sp 800", "iot security", "software supply chain", "supply chain security"
];

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

async function fetchFeed(parser, feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).map((item) => {
      const title = stripHtml(item.title);
      const summary = truncate(stripHtml(item.contentSnippet || item.summary || item.content || ""), 220);
      if (!title || !item.link) return null;
      if (feed.filter) {
        const text = (title + " " + summary).toLowerCase();
        if (!CYBER_KEYWORDS.some((kw) => text.includes(kw))) return null;
      }
      const publishedAt = item.isoDate || item.pubDate;
      return {
        title: truncate(title, 160),
        summary: summary || title,
        source: feed.name,
        url: item.link,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString()
      };
    }).filter(Boolean);

    console.log(`  ✓ ${feed.name}: ได้ ${items.length} รายการ (จากทั้งหมด ${(parsed.items || []).length})`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${feed.name}: ดึงไม่สำเร็จ — ${err.message}`);
    return [];
  }
}

async function main() {
  console.log("CyberScope: เริ่มดึงอัปเดตจาก NIST…\n");

  const parser = new Parser({
    timeout: FEED_TIMEOUT_MS,
    headers: { "User-Agent": "CyberScopeNewsBot/1.0 (+static site news aggregator)" }
  });

  const results = await Promise.all(FEEDS.map((feed) => fetchFeed(parser, feed)));

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set();

  const items = results
    .flat()
    .filter((item) => {
      const t = new Date(item.publishedAt).getTime();
      if (isNaN(t) || t < cutoff) return false;
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS);

  const output = { generatedAt: new Date().toISOString(), items };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

  // ถ้าดึงไม่ได้เลย ให้คงข้อมูลชุดเดิมไว้แทนการเขียนทับด้วยไฟล์ว่าง
  if (items.length === 0 && fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
      if (Array.isArray(existing.items) && existing.items.length > 0) {
        console.warn("\n⚠ ดึงข้อมูลใหม่ไม่ได้เลย — คงข้อมูลชุดเดิมไว้");
        output.items = existing.items;
      }
    } catch (_) { /* ไฟล์เดิมเสีย ก็เขียนใหม่ตามปกติ */ }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\nเสร็จสิ้น: เขียน ${output.items.length} รายการลง ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาดร้ายแรง:", err);
  process.exit(1);
});
