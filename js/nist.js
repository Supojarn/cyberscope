/* CyberScope — โหลดและแสดงอัปเดตจาก NIST (หน้า nist.html) */
(function () {
  "use strict";

  var grid = document.getElementById("nist-grid");
  var updatedEl = document.getElementById("nist-updated");
  if (!grid) return;

  var FALLBACK_SOURCES = [
    { name: "NIST Cybersecurity Insights", url: "https://www.nist.gov/blogs/cybersecurity-insights" },
    { name: "NIST News", url: "https://www.nist.gov/news-events/news" },
    { name: "NIST CSRC", url: "https://csrc.nist.gov/" }
  ];

  function formatDate(iso, withTime) {
    if (window.CyberScope && window.CyberScope.formatThaiDate) {
      return window.CyberScope.formatThaiDate(iso, withTime);
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
      '<p style="margin-top:0.75rem;">ระหว่างนี้สามารถติดตามได้โดยตรงจาก: ' + links + "</p></div>";
    if (updatedEl) updatedEl.textContent = "ยังไม่มีข้อมูลล่าสุด";
  }

  fetch("data/nist.json?v=" + Date.now())
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        showFallback("ยังไม่มีอัปเดตในระบบขณะนี้ (ไฟล์ข้อมูลว่างเปล่า)");
        return;
      }
      if (updatedEl && data.generatedAt) {
        updatedEl.textContent = "อัปเดตล่าสุด: " + formatDate(data.generatedAt, true);
      }
      var items = data.items.slice().sort(function (a, b) {
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });
      grid.innerHTML = items.map(function (item) {
        var url = /^https?:\/\//i.test(item.url || "") ? item.url : "#";
        return (
          '<article class="card news-card">' +
            '<span class="news-tag tag-pqc">NIST</span>' +
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
    })
    .catch(function (err) {
      console.error("โหลด data/nist.json ไม่สำเร็จ:", err);
      showFallback("ขออภัย ไม่สามารถโหลดอัปเดตได้ในขณะนี้");
    });
})();
