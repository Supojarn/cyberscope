#!/usr/bin/env node
/**
 * CyberScope — ดึงข้อมูลช่องโหว่ (CVE) ล่าสุด แล้วเขียนลง data/cve.json
 *
 * แหล่งข้อมูล:
 *  1. NVD API (NIST)  — CVE ที่เผยแพร่ใน 7 วันล่าสุด คัดเฉพาะ CVSS >= 7.0
 *  2. CISA KEV        — ช่องโหว่ที่ยืนยันแล้วว่าถูกใช้โจมตีจริง (Known Exploited)
 *
 * รันด้วยมือ:  npm run fetch-cve
 * รันอัตโนมัติ: GitHub Actions (.github/workflows/update-news.yml) ทุกวัน
 */

"use strict";

const fs = require("fs");
const path = require("path");

const OUTPUT_FILE = path.join(__dirname, "..", "data", "cve.json");
const NVD_DAYS_BACK = 7;
const NVD_MIN_SCORE = 7.0;
const NVD_MAX_CRITICAL = 15; // โควตา CVSS >= 9.0
const NVD_MAX_HIGH = 10;     // โควตา CVSS 7.0-8.9
const KEV_MAX_ITEMS = 15;
const FETCH_TIMEOUT_MS = 60000; // NVD API ช้าเป็นปกติเมื่อไม่ใช้ API key
const FETCH_RETRIES = 2;

const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

function nvdUrl() {
  const end = new Date();
  const start = new Date(end.getTime() - NVD_DAYS_BACK * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().replace(/Z$/, "");
  return (
    "https://services.nvd.nist.gov/rest/json/cves/2.0/?noRejected" +
    "&pubStartDate=" + encodeURIComponent(fmt(start)) +
    "&pubEndDate=" + encodeURIComponent(fmt(end)) +
    "&resultsPerPage=2000"
  );
}

async function fetchJson(url, label) {
  for (let attempt = 1; attempt <= 1 + FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "CyberScopeCVEBot/1.0 (+static site aggregator)" }
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      if (attempt <= FETCH_RETRIES) {
        console.warn(`  … ${label}: ครั้งที่ ${attempt} ไม่สำเร็จ (${err.message}) — ลองใหม่`);
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        console.warn(`  ✗ ${label}: ดึงไม่สำเร็จ — ${err.message}`);
      }
    }
  }
  return null;
}

function severityFromScore(score) {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  return "low";
}

function cvssOf(cve) {
  const m = cve.metrics || {};
  const list = m.cvssMetricV31 || m.cvssMetricV40 || m.cvssMetricV30 || m.cvssMetricV2 || [];
  const primary = list.find((x) => x.type === "Primary") || list[0];
  return primary ? primary.cvssData.baseScore : null;
}

function truncate(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function parseNvd(data) {
  if (!data || !Array.isArray(data.vulnerabilities)) return [];
  const items = data.vulnerabilities
    .map(({ cve }) => {
      const score = cvssOf(cve);
      if (score == null || score < NVD_MIN_SCORE) return null;
      const desc = (cve.descriptions || []).find((d) => d.lang === "en");
      return {
        id: cve.id,
        description: truncate(desc ? desc.value : "", 260),
        score,
        severity: severityFromScore(score),
        published: cve.published
          ? new Date(/Z$|[+-]\d\d:\d\d$/.test(cve.published) ? cve.published : cve.published + "Z").toISOString()
          : null,
        source: "NVD",
        url: "https://nvd.nist.gov/vuln/detail/" + cve.id,
        kev: false,
        vendorProduct: null
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.published) - new Date(a.published));

  // แบ่งโควตาให้มีทั้ง Critical และ High เสมอ (เรียงตามความใหม่ในแต่ละกลุ่ม)
  const critical = items.filter((i) => i.severity === "critical").slice(0, NVD_MAX_CRITICAL);
  const high = items.filter((i) => i.severity === "high").slice(0, NVD_MAX_HIGH);
  const selected = [...critical, ...high]
    .sort((a, b) => b.score - a.score || new Date(b.published) - new Date(a.published));

  console.log(`  ✓ NVD: ได้ ${selected.length} CVE (critical ${critical.length}, high ${high.length}) จาก ${data.vulnerabilities.length} รายการใน ${NVD_DAYS_BACK} วันล่าสุด`);
  return selected;
}

function parseKev(data) {
  if (!data || !Array.isArray(data.vulnerabilities)) return [];
  const items = data.vulnerabilities
    .slice()
    .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
    .slice(0, KEV_MAX_ITEMS)
    .map((v) => ({
      id: v.cveID,
      description: truncate(v.vulnerabilityName + " — " + (v.shortDescription || ""), 260),
      score: null,
      severity: "kev",
      published: new Date(v.dateAdded).toISOString(),
      source: "CISA KEV",
      url: "https://nvd.nist.gov/vuln/detail/" + v.cveID,
      kev: true,
      vendorProduct: [v.vendorProject, v.product].filter(Boolean).join(" "),
      ransomware: v.knownRansomwareCampaignUse === "Known"
    }));
  console.log(`  ✓ CISA KEV: ได้ ${items.length} ช่องโหว่ที่ถูกใช้โจมตีจริงล่าสุด (แคตตาล็อกทั้งหมด ${data.count || data.vulnerabilities.length} รายการ)`);
  return items;
}

async function main() {
  console.log("CyberScope: เริ่มดึงข้อมูลช่องโหว่ CVE…\n");

  const [nvdData, kevData] = await Promise.all([
    fetchJson(nvdUrl(), "NVD"),
    fetchJson(KEV_URL, "CISA KEV")
  ]);

  const kevItems = parseKev(kevData);
  const kevIds = new Set(kevItems.map((i) => i.id));
  const nvdItems = parseNvd(nvdData).filter((i) => !kevIds.has(i.id));

  // KEV (ถูกโจมตีจริง = ด่วนสุด) ขึ้นก่อน ตามด้วย NVD เรียงตามคะแนน
  const items = [...kevItems, ...nvdItems];

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
