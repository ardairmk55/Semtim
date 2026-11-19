#!/usr/bin/env node
/* Semtim — Lucide ikonlarından js/ikonlar.js sprite modülünü üretir.

   Uygulama derlemesiz çalışır; bu betik sadece ikon listesi değiştiğinde
   geliştirici tarafından elle çalıştırılır ve çıktısı depoya eklenir.

     npm i --no-save lucide-static@0.460.0
     node araclar/ikonlari-uret.mjs node_modules/lucide-static/icons

   Lucide: ISC lisansı (vendor/LUCIDE-LICENSE). */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const IKONLAR = [
  // arayüz
  "search", "locate-fixed", "map-pin", "crosshair", "radar", "x", "info", "sun", "moon", "sun-moon",
  "download", "upload", "printer", "phone", "message-circle", "navigation", "square-pen", "globe",
  "instagram", "facebook", "mail", "clock", "chevron-down", "chevron-right", "check", "external-link",
  "list", "kanban", "target", "circle-alert", "triangle-alert", "circle-check", "wifi-off", "rotate-cw",
  "loader-circle", "calendar-clock", "keyboard", "trash-2", "sliders-horizontal", "list-filter",
  "notebook-pen", "history", "layers", "store", "copy", "arrow-up-right", "file-spreadsheet",
  "grip-vertical", "arrow-right-left", "undo-2", "shield-check", "database", "lock", "chevron-up", "chevron-left",
  // sektörler
  "coffee", "utensils-crossed", "croissant", "shopping-cart", "scissors", "spray-can", "sparkles",
  "smile", "stethoscope", "pill", "paw-print", "wrench", "shirt", "house", "flower-2", "glasses",
  "ruler", "bed-double", "dumbbell", "graduation-cap", "hammer", "briefcase", "shopping-bag",
];

const kaynak = process.argv[2];
if (!kaynak) {
  console.error("Kullanım: node araclar/ikonlari-uret.mjs <lucide-static/icons klasörü>");
  process.exit(1);
}

const govde = (svg) =>
  svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>[\s\S]*$/, "")
    .replace(/\s*\n\s*/g, "")
    .trim();

const satirlar = IKONLAR.map((ad) => {
  const svg = readFileSync(join(kaynak, `${ad}.svg`), "utf8");
  return `    ${JSON.stringify(ad)}: ${JSON.stringify(govde(svg))},`;
});

const cikti = `/* Semtim — ikon sprite'ı. OTOMATİK ÜRETİLDİ: araclar/ikonlari-uret.mjs
   Kaynak: Lucide (ISC lisansı, vendor/LUCIDE-LICENSE). Elle düzenlemeyin. */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const YOL = {
${satirlar.join("\n")}
  };

  /** Sayfaya gizli bir <svg> sprite ekler; HTML'deki <use href="#i-ad"> referansları buna bağlanır. */
  function spriteEkle(belge) {
    if (!belge || belge.getElementById("semtim-ikonlar")) return;
    const semboller = Object.entries(YOL)
      .map(([ad, ic]) => \`<symbol id="i-\${ad}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${ic}</symbol>\`)
      .join("");
    const kap = belge.createElement("div");
    kap.innerHTML =
      '<svg id="semtim-ikonlar" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + semboller + "</svg>";
    belge.body.prepend(kap.firstChild);
  }

  /** JS ile üretilen HTML için: ikon("phone") → <svg class="i">…</svg> */
  function ikon(ad, sinif = "") {
    if (!YOL[ad]) ad = "circle-alert";
    return \`<svg class="i \${sinif}" aria-hidden="true" focusable="false"><use href="#i-\${ad}"></use></svg>\`;
  }

  S.ikon = ikon;
  S.ikonlar = { YOL, spriteEkle, var: (ad) => Object.prototype.hasOwnProperty.call(YOL, ad) };
  if (typeof document !== "undefined" && document.body) spriteEkle(document);
})(window.Semtim);
`;

const hedef = join(dirname(fileURLToPath(import.meta.url)), "..", "js", "ikonlar.js");
writeFileSync(hedef, cikti);
console.log(`${IKONLAR.length} ikon yazıldı → ${hedef}`);
