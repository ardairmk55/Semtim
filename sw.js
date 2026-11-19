/* Semtim — service worker: uygulama kabuğunu çevrimdışı açar, harita karolarını önbelleğe alır.
   Overpass ve Nominatim yanıtları burada önbelleklenmez; onları uygulama IndexedDB'de tutar.
   Yeni sürüm yayınlarken SURUM'ü artırın: eski kabuk önbelleği silinir. */
"use strict";

const SURUM = "2.4.0";
const KABUK = `semtim-kabuk-${SURUM}`;
const KARO = "semtim-karo-v1";
const EN_FAZLA_KARO = 600;

const KABUK_DOSYALARI = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/semtim.css",
  "fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  "fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "vendor/markercluster/MarkerCluster.css",
  "vendor/markercluster/leaflet.markercluster.js",
  "js/tema-erken.js",
  "js/ikonlar.js",
  "js/turkce.js",
  "js/sektor.js",
  "js/saatler.js",
  "js/huni.js",
  "js/site-kontrol.js",
  "js/surukle.js",
  "js/veri.js",
  "js/app.js",
  "img/semtim-ikon.png",
  "img/semtim-logo.webp",
  "img/favicon.png",
  "img/pwa-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(KABUK).then((c) => c.addAll(KABUK_DOSYALARI)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a.startsWith("semtim-kabuk-") && a !== KABUK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

async function karoBudama() {
  const c = await caches.open(KARO);
  const anahtarlar = await c.keys();
  const fazla = anahtarlar.length - EN_FAZLA_KARO;
  for (let i = 0; i < fazla; i++) await c.delete(anahtarlar[i]); // en eskiler önce eklenmiştir
}

/** Harita karosu: önce önbellek, yoksa ağ (OSM karo politikası önbelleğe almayı önerir). */
async function karo(istek) {
  const c = await caches.open(KARO);
  const kayitli = await c.match(istek);
  if (kayitli) return kayitli;
  const yanit = await fetch(istek);
  if (yanit.ok) {
    await c.put(istek, yanit.clone());
    if (Math.random() < 0.05) karoBudama();
  }
  return yanit;
}

/** Kabuk dosyaları: önbellekten anında aç, arka planda tazele (stale-while-revalidate). */
async function kabuk(e) {
  const c = await caches.open(KABUK);
  const kayitli = await c.match(e.request, { ignoreSearch: true });
  const ag = fetch(e.request)
    .then((y) => { if (y.ok) c.put(e.request, y.clone()); return y; })
    .catch(() => null);
  if (kayitli) {
    e.waitUntil(ag);
    return kayitli;
  }
  const y = await ag;
  if (y) return y;
  if (e.request.mode === "navigate") return (await c.match("index.html")) || Response.error();
  return Response.error();
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith(karo(e.request));
  } else if (url.origin === self.location.origin) {
    e.respondWith(kabuk(e));
  }
  // Overpass / Nominatim: doğrudan ağ.
});
