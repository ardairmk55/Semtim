import { test } from "node:test";
import assert from "node:assert/strict";
import { yukle } from "./yukle.mjs";

const S = yukle("turkce.js", "saatler.js");
const { durum, ayristir, haftalik } = S.saatler;
const j = (x) => JSON.parse(JSON.stringify(x)); // vm içindeki dizileri karşılaştırılabilir yap

// 19 Kasım 2026 Perşembe
const per = (sa, dk = 0) => new Date(2026, 10, 19, sa, dk);
const paz = (sa, dk = 0) => new Date(2026, 10, 22, sa, dk);
const pzt = (sa, dk = 0) => new Date(2026, 10, 23, sa, dk);

test("24/7 her zaman açık", () => {
  const d = durum("24/7", per(3));
  assert.equal(d.durum, "acik");
  assert.equal(d.metin, "7/24 açık");
});

test("hafta içi saatleri: açık ve kapanış metni", () => {
  const d = durum("Mo-Fr 09:00-18:00", per(14, 30));
  assert.equal(d.durum, "acik");
  assert.equal(d.metin, "18:00'e kadar açık");
  assert.equal(d.kalanDk, 210);
});

test("açılmadan önce: bugün açılış saati, doğru ek", () => {
  assert.equal(durum("Mo-Fr 09:00-18:00", per(7)).metin, "09:00'da açılıyor");
  assert.equal(durum("Mo-Fr 10:00-18:00", per(7)).metin, "10:00'da açılıyor");
  assert.equal(durum("Mo-Fr 08:30-18:00", per(7)).metin, "08:30'da açılıyor");
  assert.equal(durum("Mo-Fr 11:00-18:00", per(7)).metin, "11:00'de açılıyor");
});

test("kapandıktan sonra: yarın açılıyor", () => {
  const d = durum("Mo-Fr 09:00-18:00", per(19));
  assert.equal(d.durum, "kapali");
  assert.equal(d.metin, "Yarın 09:00'da açılıyor");
});

test("hafta sonu kapalı: pazartesi gün adıyla", () => {
  const d = durum("Mo-Fr 09:00-18:00; Sa,Su off", paz(12));
  assert.equal(d.durum, "kapali");
  assert.equal(d.metin, "Yarın 09:00'da açılıyor");
  const c = durum("Mo-Fr 09:00-18:00", new Date(2026, 10, 21, 12)); // Cumartesi
  assert.equal(c.metin, "Pazartesi 09:00'da açılıyor");
});

test("öğle arası", () => {
  const oh = "Mo-Sa 09:00-12:00,13:00-19:00";
  assert.equal(durum(oh, per(12, 30)).durum, "kapali");
  assert.equal(durum(oh, per(12, 30)).metin, "13:00'te açılıyor");
  assert.equal(durum(oh, per(13, 30)).metin, "19:00'a kadar açık");
});

test("gece yarısını aşan saat ve haftayı saran gün", () => {
  const oh = "Mo-Su 18:00-02:00";
  assert.equal(durum(oh, per(1)).durum, "acik"); // çarşamba gecesinden sarkan
  assert.equal(durum(oh, per(1)).metin, "02:00'ye kadar açık");
  assert.equal(durum(oh, pzt(1)).durum, "acik"); // pazar gecesinden pazartesiye sarkan
  assert.equal(durum(oh, per(3)).durum, "kapali");
  assert.equal(durum("Fr-Mo 10:00-20:00", paz(11)).durum, "acik");
  assert.equal(durum("Fr-Mo 10:00-20:00", per(11)).durum, "kapali");
});

test("sonraki kural öncekini ezer", () => {
  const oh = "Mo-Su 09:00-22:00; Th off";
  assert.equal(durum(oh, per(12)).durum, "kapali");
  assert.equal(durum(oh, paz(12)).durum, "acik");
});

test("24:00 bitişi gece yarısı olarak yazılır", () => {
  assert.equal(durum("Mo-Su 10:00-24:00", per(23)).metin, "Gece yarısına kadar açık");
});

test("gün belirtmeyen saat her gün geçerli", () => {
  assert.equal(durum("08:00-20:00", paz(10)).durum, "acik");
});

test("PH kuralları atlanır, desteklenmeyen ifade bilinmiyor döner", () => {
  assert.equal(durum("Mo-Fr 09:00-18:00; PH off", per(10)).durum, "acik");
  assert.equal(durum("Mo-Fr 09:00-18:00, PH", per(10)).durum, "bilinmiyor");
  assert.equal(durum("Mo-Fr sunrise-sunset", per(10)).durum, "bilinmiyor");
  assert.equal(durum("Jan-Mar Mo-Fr 09:00-17:00", per(10)).durum, "bilinmiyor");
  assert.equal(durum("Mo-Fr 18:00+", per(10)).durum, "bilinmiyor");
  assert.equal(durum("", per(10)).metin, "Saat bilgisi yok");
  assert.equal(durum("öğlen açık", per(10)).durum, "bilinmiyor");
});

test("ayristir ve haftalik", () => {
  assert.deepEqual(j(ayristir("Sa 10:00-14:00")[5]), [[600, 840]]);
  assert.equal(ayristir("Mo 25:00-26:00"), null);
  const h = haftalik("Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off");
  assert.equal(h[0].metin, "09:00–18:00");
  assert.equal(h[5].metin, "10:00–14:00");
  assert.equal(h[6].metin, "Kapalı");
  assert.equal(haftalik("24/7")[2].metin, "24 saat");
});
