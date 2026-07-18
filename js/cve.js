/* CyberScope — โหลดและแสดงช่องโหว่จาก data/cve.json (หน้า cve.html) */
(function () {
  "use strict";

  var grid = document.getElementById("cve-grid");
  var updatedEl = document.getElementById("cve-updated");
  var filterBar = document.getElementById("filter-bar");
  if (!grid) return;

  var SEVERITY_LABELS = {
    "kev": "ถูกโจมตีจริง (KEV)",
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low"
  };

  var FALLBACK_SOURCES = [
    { name: "NVD (NIST)", url: "https://nvd.nist.gov/vuln/search" },
    { name: "CISA KEV Catalog", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" }
  ];

  var allItems = [];
  var currentFilter = "all";

  function formatDate(iso) {
    if (window.CyberScope && window.CyberScope.formatThaiDate) {
      return window.CyberScope.formatThaiDate(iso, false);
    }
    return iso || "";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function showFallback(message) {
    var links = FALLBACK_SOURCES.map(function (s) {
      return '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + "</a>";
    }).join(" · ");
    grid.innerHTML =
      '<div class="news-empty"><p>' + message + "</p>" +
      '<p style="margin-top:0.75rem;">ระหว่างนี้สามารถดูข้อมูลได้โดยตรงจาก: ' + links + "</p></div>";
    if (updatedEl) updatedEl.textContent = "ยังไม่มีข้อมูลล่าสุด";
  }

  function matchesFilter(item) {
    if (currentFilter === "all") return true;
    if (currentFilter === "kev") return item.kev === true;
    return item.severity === currentFilter;
  }

  function render() {
    var items = allItems.filter(matchesFilter);

    if (items.length === 0) {
      grid.innerHTML =
        '<div class="news-empty">ไม่มีรายการในหมวดนี้ในรอบล่าสุด ลองเลือก "ทั้งหมด" ดูครับ</div>';
      return;
    }

    grid.innerHTML = items.map(function (item) {
      var sev = SEVERITY_LABELS[item.severity] ? item.severity : "high";
      var badge = SEVERITY_LABELS[sev];
      if (sev === "kev" && item.ransomware) badge += " · Ransomware";
      var scoreHtml = item.score != null
        ? '<span class="cvss-score">CVSS ' + escapeHtml(item.score.toFixed(1)) + "</span>"
        : "";
      var vendorHtml = item.vendorProduct
        ? '<div class="cve-vendor">' + escapeHtml(item.vendorProduct) + "</div>"
        : "";
      var url = /^https?:\/\//i.test(item.url || "") ? item.url : "#";
      return (
        '<article class="card news-card cve-card">' +
          '<div class="cve-head">' +
            '<span class="news-tag sev-' + sev + '">' + escapeHtml(badge) + "</span>" +
            scoreHtml +
          "</div>" +
          '<h3 class="cve-id">' + escapeHtml(item.id) + "</h3>" +
          vendorHtml +
          '<p class="news-summary">' + escapeHtml(item.description) + "</p>" +
          '<div class="news-meta">' +
            '<span class="news-source">' + escapeHtml(item.source) + "</span>" +
            "<span>" + escapeHtml(formatDate(item.published)) + "</span>" +
          "</div>" +
          '<a class="read-more" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">ดูรายละเอียดใน NVD →</a>' +
        "</article>"
      );
    }).join("");
  }

  if (filterBar) {
    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-chip");
      if (!btn) return;
      currentFilter = btn.dataset.filter || "all";
      filterBar.querySelectorAll(".filter-chip").forEach(function (c) {
        c.classList.toggle("active", c === btn);
      });
      render();
    });
  }

  fetch("data/cve.json?v=" + Date.now())
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        showFallback("ยังไม่มีข้อมูลช่องโหว่ในระบบขณะนี้ (ไฟล์ข้อมูลว่างเปล่า)");
        return;
      }
      allItems = data.items;
      if (updatedEl && data.generatedAt) {
        updatedEl.textContent = "อัปเดตล่าสุด: " +
          (window.CyberScope && window.CyberScope.formatThaiDate
            ? window.CyberScope.formatThaiDate(data.generatedAt, true)
            : data.generatedAt);
      }
      render();
    })
    .catch(function (err) {
      console.error("โหลด data/cve.json ไม่สำเร็จ:", err);
      showFallback("ขออภัย ไม่สามารถโหลดข้อมูลช่องโหว่ได้ในขณะนี้");
    });
})();
