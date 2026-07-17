/* CyberScope — สคริปต์ส่วนกลางทุกหน้า */
(function () {
  "use strict";

  // ---- เมนูมือถือ (hamburger) ----
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "✕" : "☰";
    });

    // ปิดเมนูเมื่อคลิกลิงก์ (มือถือ)
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "☰";
      }
    });
  }

  // ---- ฟอร์แมตวันเวลาเป็นภาษาไทย (ใช้ร่วมกับ news.js) ----
  var THAI_MONTHS = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];

  window.CyberScope = window.CyberScope || {};

  window.CyberScope.formatThaiDate = function (isoString, withTime) {
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    var text = d.getDate() + " " + THAI_MONTHS[d.getMonth()] + " " + (d.getFullYear() + 543);
    if (withTime) {
      var hh = String(d.getHours()).padStart(2, "0");
      var mm = String(d.getMinutes()).padStart(2, "0");
      text += " " + hh + ":" + mm + " น.";
    }
    return text;
  };

  // ---- แบนเนอร์ข่าวหน้าแรก: แสดงเวลาอัปเดตล่าสุดจาก data/news.json ----
  var bannerUpdated = document.getElementById("banner-updated");
  if (bannerUpdated) {
    fetch("data/news.json?v=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.generatedAt) {
          bannerUpdated.textContent =
            "อัปเดตล่าสุด: " + window.CyberScope.formatThaiDate(data.generatedAt, true) +
            (data.items ? " · " + data.items.length + " ข่าว" : "");
        } else {
          bannerUpdated.textContent = "คลิกเพื่ออ่านข่าวล่าสุด →";
        }
      })
      .catch(function () {
        bannerUpdated.textContent = "คลิกเพื่ออ่านข่าวล่าสุด →";
      });
  }
})();
