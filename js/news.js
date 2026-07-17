/* CyberScope — โหลดและแสดงข่าวจาก data/news.json (หน้า news.html) */
(function () {
  "use strict";

  var grid = document.getElementById("news-grid");
  var updatedEl = document.getElementById("news-updated");
  var filterBar = document.getElementById("filter-bar");
  if (!grid) return;

  var CATEGORY_LABELS = {
    "kill-chain": "Kill Chain",
    "ai-security": "AI & Security",
    "pqc": "PQC",
    "thailand": "ข่าวไทย"
  };

  var FALLBACK_SOURCES = [
    { name: "The Hacker News", url: "https://thehackernews.com/" },
    { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/" },
    { name: "ThaiCERT", url: "https://www.thaicert.or.th/" },
    { name: "NCSA", url: "https://www.ncsa.or.th/" }
  ];

  var allItems = [];
  var currentFilter = "all";

  function formatDate(iso, withTime) {
    if (window.CyberScope && window.CyberScope.formatThaiDate) {
      return window.CyberScope.formatThaiDate(iso, withTime);
    }
    return iso || "";
  }

  function showFallback(message) {
    var links = FALLBACK_SOURCES.map(function (s) {
      return '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + "</a>";
    }).join(" · ");
    grid.innerHTML =
      '<div class="news-empty"><p>' + message + "</p>" +
      '<p style="margin-top:0.75rem;">ระหว่างนี้สามารถติดตามข่าวได้โดยตรงจาก: ' + links + "</p></div>";
    if (updatedEl) updatedEl.textContent = "ยังไม่มีข้อมูลข่าวล่าสุด";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function render() {
    var items = currentFilter === "all"
      ? allItems
      : allItems.filter(function (it) { return it.category === currentFilter; });

    if (items.length === 0) {
      grid.innerHTML =
        '<div class="news-empty">ยังไม่มีข่าวในหมวดนี้ในรอบล่าสุด ลองเลือกหมวด "ทั้งหมด" ดูครับ</div>';
      return;
    }

    grid.innerHTML = items.map(function (item) {
      var cat = CATEGORY_LABELS[item.category] ? item.category : "ai-security";
      var tagLabel = CATEGORY_LABELS[cat];
      var url = /^https?:\/\//i.test(item.url || "") ? item.url : "#";
      return (
        '<article class="card news-card">' +
          '<span class="news-tag tag-' + cat + '">' + escapeHtml(tagLabel) + "</span>" +
          "<h3>" + escapeHtml(item.title) + "</h3>" +
          '<p class="news-summary">' + escapeHtml(item.summary) + "</p>" +
          '<div class="news-meta">' +
            '<span class="news-source">' + escapeHtml(item.source) + "</span>" +
            "<span>" + escapeHtml(formatDate(item.publishedAt, false)) + "</span>" +
          "</div>" +
          '<a class="read-more" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">อ่านต่อ →</a>' +
        "</article>"
      );
    }).join("");
  }

  // ---- ปุ่ม filter ----
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

  // ---- โหลดข้อมูล (cache-busting ด้วย timestamp) ----
  fetch("data/news.json?v=" + Date.now())
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        showFallback("ยังไม่มีข่าวในระบบขณะนี้ (ไฟล์ข้อมูลว่างเปล่า)");
        return;
      }
      allItems = data.items.slice().sort(function (a, b) {
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });
      if (updatedEl && data.generatedAt) {
        updatedEl.textContent = "อัปเดตล่าสุด: " + formatDate(data.generatedAt, true);
      }
      render();
    })
    .catch(function (err) {
      console.error("โหลด data/news.json ไม่สำเร็จ:", err);
      showFallback("ขออภัย ไม่สามารถโหลดข่าวได้ในขณะนี้");
    });
})();
