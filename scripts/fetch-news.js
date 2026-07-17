#!/usr/bin/env node
/**
 * CyberScope — ดึงข่าวจาก RSS feeds ใน scripts/feeds.json
 * กรองด้วยคีย์เวิร์ด จัดหมวดหมู่ แล้วเขียนผลลัพธ์ลง data/news.json
 *
 * รันด้วยมือ:  npm run fetch-news
 * รันอัตโนมัติ: GitHub Actions (.github/workflows/update-news.yml) ทุกวัน
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");

const FEEDS_FILE = path.join(__dirname, "feeds.json");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "news.json");
const MAX_ITEMS = 40;
const MAX_AGE_DAYS = 45; // ไม่เอาข่าวเก่าเกินไป
const FEED_TIMEOUT_MS = 20000;

// ---- คีย์เวิร์ดสำหรับกรองและจัดหมวด ----
// เรียงลำดับความจำเพาะ: pqc > ai-security > kill-chain
const CATEGORY_KEYWORDS = {
  "pqc": [
    "post-quantum", "post quantum", "pqc", "quantum computing", "quantum computer",
    "quantum-safe", "quantum safe", "quantum resistant", "quantum-resistant",
    "ml-kem", "ml-dsa", "slh-dsa", "kyber", "dilithium", "sphincs",
    "fips 203", "fips 204", "fips 205", "cryptography", "cryptographic",
    "encryption", "rsa", "tls", "harvest now", "cnsa 2.0", "nist",
    "ควอนตัม", "เข้ารหัส", "การเข้ารหัสลับ"
  ],
  "ai-security": [
    "ai attack", "ai-powered", "ai powered", "ai-driven", "ai driven",
    "artificial intelligence", "machine learning", "deepfake", "deep fake",
    "llm", "large language model", "chatbot", "generative ai", "genai",
    "ai phishing", "voice clone", "voice cloning", "face swap", "ai agent",
    "agentic", "ai security", "ai threat", "ai scam", "ai fraud",
    "ปัญญาประดิษฐ์", "ดีพเฟค", "เอไอ"
  ],
  "kill-chain": [
    "kill chain", "apt", "advanced persistent", "ransomware", "malware",
    "phishing", "spear-phishing", "spear phishing", "backdoor", "botnet",
    "command and control", "command-and-control", "c2 server", "exploit",
    "zero-day", "zero day", "vulnerability", "cve-", "data breach",
    "breach", "infostealer", "info-stealer", "credential", "trojan",
    "supply chain attack", "lateral movement", "threat actor", "intrusion",
    "แรนซัมแวร์", "มัลแวร์", "ฟิชชิง", "ข้อมูลรั่วไหล", "แฮกเกอร์", "ช่องโหว่",
    "โจมตีไซเบอร์", "ภัยคุกคาม"
  ]
};

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

/**
 * ตรวจว่าข่าวเกี่ยวข้องกับหัวข้อของเว็บหรือไม่ และจัดหมวดหมู่
 * คืนค่า category string หรือ null ถ้าไม่เกี่ยวข้อง
 */
function categorize(text, isThaiFeed) {
  const lower = text.toLowerCase();

  let matched = null;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched = category;
      break; // เจอหมวดที่จำเพาะกว่าก่อน (pqc > ai > kill-chain)
    }
  }

  // ข่าวจาก feed ไทย: ถ้าแมตช์คีย์เวิร์ดใดๆ ให้ tag เป็น thailand เสมอ
  if (isThaiFeed) {
    return matched ? "thailand" : null;
  }
  return matched;
}

async function fetchFeed(parser, feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).map((item) => {
      const title = stripHtml(item.title);
      const rawSummary = item.contentSnippet || item.summary || item.content || "";
      const summary = truncate(stripHtml(rawSummary), 220);
      const publishedAt = item.isoDate || item.pubDate || null;
      const category = categorize(title + " " + summary, feed.group === "thai");

      if (!title || !item.link || !category) return null;

      return {
        title: truncate(title, 160),
        summary: summary || title,
        source: feed.name,
        url: item.link,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
        category
      };
    }).filter(Boolean);

    console.log(`  ✓ ${feed.name}: ได้ ${items.length} ข่าวที่เกี่ยวข้อง (จากทั้งหมด ${(parsed.items || []).length})`);
    return items;
  } catch (err) {
    // feed เดียวล่มไม่ทำให้ทั้ง script พัง
    console.warn(`  ✗ ${feed.name}: ดึงไม่สำเร็จ — ${err.message}`);
    return [];
  }
}

async function main() {
  console.log("CyberScope: เริ่มดึงข่าวจาก RSS feeds…\n");

  const { feeds } = JSON.parse(fs.readFileSync(FEEDS_FILE, "utf8"));
  const parser = new Parser({
    timeout: FEED_TIMEOUT_MS,
    headers: { "User-Agent": "CyberScopeNewsBot/1.0 (+static site news aggregator)" }
  });

  const results = await Promise.all(feeds.map((feed) => fetchFeed(parser, feed)));

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set();

  const items = results
    .flat()
    .filter((item) => {
      const t = new Date(item.publishedAt).getTime();
      if (isNaN(t) || t < cutoff) return false;
      if (seen.has(item.url)) return false; // กันข่าวซ้ำ
      seen.add(item.url);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS);

  const output = {
    generatedAt: new Date().toISOString(),
    items
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

  // ถ้าดึงไม่ได้เลยสักข่าว และมีไฟล์เดิมที่มีข่าวอยู่ ให้เก็บข่าวเดิมไว้
  // (อัปเดตแค่ generatedAt) ดีกว่าเขียนทับด้วยไฟล์ว่าง
  if (items.length === 0 && fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
      if (Array.isArray(existing.items) && existing.items.length > 0) {
        console.warn("\n⚠ ดึงข่าวใหม่ไม่ได้เลย — คงข่าวชุดเดิมไว้");
        output.items = existing.items;
      }
    } catch (_) { /* ไฟล์เดิมเสีย ก็เขียนใหม่ตามปกติ */ }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\nเสร็จสิ้น: เขียน ${output.items.length} ข่าวลง ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาดร้ายแรง:", err);
  process.exit(1);
});
