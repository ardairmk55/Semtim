#!/usr/bin/env node
/* Semtim — yayın öncesi kontrol (npm run kontrol). Her yere konunca çalışma şartını doğrular:
   1. index.html'in yüklediği her yerel dosya var.
   2. Mutlak yol ("/css/..") ya da dış CDN'den script/stil yok.
   3. sw.js'in önbelleğe aldığı her dosya var (yoksa service worker kurulamaz).
   4. Arayüz kodunda emoji yok (ikon sistemi kullanılır).
   Hata varsa çıkış kodu 1 olur; CI bunu kullanır. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const oku = (d) => readFileSync(join(kok, d), "utf8");
const hatalar = [];

const html = oku("index.html");
const baglantilar = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
for (const b of baglantilar) {
  if (/^(https?:|mailto:|tel:)/.test(b)) {
    if (/<(script|link)[^>]+(?:src|href)="https?:/.test(html)) hatalar.push(`Dış kaynaktan script/stil yükleniyor: ${b}`);
    continue;
  }
  if (b.startsWith("/")) hatalar.push(`Mutlak yol, alt klasörde kırılır: ${b}`);
  const yol = b === "./" ? "index.html" : b.split("?")[0];
  if (!existsSync(join(kok, yol))) hatalar.push(`index.html'deki dosya yok: ${b}`);
}

const sw = oku("sw.js");
const liste = sw.match(/KABUK_DOSYALARI = \[([\s\S]*?)\]/);
if (!liste) hatalar.push("sw.js içinde KABUK_DOSYALARI bulunamadı");
else {
  for (const m of liste[1].matchAll(/"([^"]+)"/g)) {
    const yol = m[1] === "./" ? "index.html" : m[1];
    if (!existsSync(join(kok, yol))) hatalar.push(`sw.js önbellek listesindeki dosya yok: ${m[1]}`);
  }
}

const manifest = JSON.parse(oku("manifest.webmanifest"));
for (const i of manifest.icons) if (!existsSync(join(kok, i.src))) hatalar.push(`Manifest ikonu yok: ${i.src}`);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/u;
const arayuz = ["index.html", "css/semtim.css", ...readdirSync(join(kok, "js")).filter((d) => d.endsWith(".js")).map((d) => "js/" + d)];
for (const d of arayuz) {
  oku(d).split("\n").forEach((satir, i) => {
    if (EMOJI.test(satir)) hatalar.push(`Emoji bulundu: ${d}:${i + 1}`);
  });
}

if (hatalar.length) {
  console.error("Yayın kontrolü BAŞARISIZ:\n  - " + hatalar.join("\n  - "));
  process.exit(1);
}
console.log(`Yayın kontrolü tamam: ${baglantilar.length} bağlantı, ${liste[1].match(/"/g).length / 2} önbellek dosyası, ${arayuz.length} arayüz dosyası.`);
