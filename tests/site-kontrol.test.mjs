import { test } from "node:test";
import assert from "node:assert/strict";
import { yukle, sahteDepo } from "./yukle.mjs";

const S = yukle("site-kontrol.js");
const { csvAyristir, ayristir, seviye, olustur, ANAHTAR } = S.siteKontrol;
const j = (x) => JSON.parse(JSON.stringify(x));

// araclar/semtim_kontrol.py çıktısının biçimi: Semtim CSV'si + kontrol sütunları, ; ayırıcı, BOM.
const ORNEK = "﻿" + [
  '"ad";"web";"osm";"site_durumu";"http_kodu";"son_adres";"https";"ssl_gecerli";"mobil_uyumlu";"yukleme_ms";"baslik";"dijital_skor";"notlar"',
  '"Kahve; Durağı";"kahve.com";"https://www.openstreetmap.org/node/42";"açılıyor";"200";"https://kahve.com/";"evet";"evet";"hayır";"1800";"Kahve ""Durağı""";"70";"mobil uyumlu değil"',
  '"Sitesiz";"";"https://www.openstreetmap.org/way/7";"site yok";"";"";"";"";"";"";"";"0";""',
  '"Park";"park.com";"https://www.openstreetmap.org/relation/9";"park edilmiş alan adı";"200";"";"hayır";"";"";"";"";"5";"HTTPS yok"',
  '"Bozuk";"x.com";"osm yok";"açılıyor";"";"";"";"";"";"";"";"90";""',
].join("\r\n") + "\r\n";

test("CSV ayrıştırıcı: tırnak içi ayırıcı, kaçışlı tırnak, BOM, CRLF", () => {
  const r = j(csvAyristir(ORNEK));
  assert.equal(r.length, 5);
  assert.equal(r[1][0], "Kahve; Durağı");
  assert.equal(r[1][10], 'Kahve "Durağı"');
  assert.deepEqual(j(csvAyristir("a,b\n1,\"x\ny\"\n")), [["a", "b"], ["1", "x\ny"]]);
});

test("kontrol sonucu osm adresinden eşleşir; site yok ve eşleşmeyen satırlar atlanır", () => {
  const s = ayristir(ORNEK, 1000);
  assert.equal(s.satir, 4);
  assert.equal(s.eslesen, 2);
  const k = s.kayitlar["node/42"];
  assert.equal(k.skor, 70);
  assert.equal(k.https, true);
  assert.equal(k.mobil, false);
  assert.equal(k.ms, 1800);
  assert.equal(k.tarih, 1000);
  assert.equal(s.kayitlar["relation/9"].ssl, null);
  assert.equal(s.kayitlar["way/7"], undefined);
});

test("eksik sütunlarda anlaşılır hata", () => {
  assert.throws(() => ayristir('"ad";"web"\n"a";"b"'), /osm/);
  assert.throws(() => ayristir('"ad";"osm"\n"a";"https://www.openstreetmap.org/node/1"'), /kontrol sonucu yok/);
  assert.throws(() => ayristir(""), /boş/);
});

test("seviye ve kalıcı depo", () => {
  assert.equal(seviye(85).id, "iyi");
  assert.equal(seviye(60).id, "orta");
  assert.equal(seviye(59).id, "zayif");
  const depo = sahteDepo();
  const k = olustur(depo);
  assert.equal(k.iceAktar(ORNEK).eslesen, 2);
  assert.equal(olustur(depo).al("node/42").skor, 70);
  k.temizle();
  assert.equal(depo.getItem(ANAHTAR), null);
});

test("yenidenOku: depodaki güncel sonucu alır, bozuk veride eldekini korur", () => {
  const depo = sahteDepo();
  const k = olustur(depo);
  k.iceAktar(ORNEK);
  assert.equal(k.sayi(), 2);
  depo.ham.set(ANAHTAR, JSON.stringify({ "node/1": { skor: 10 } }));
  k.yenidenOku();
  assert.equal(k.sayi(), 1);
  assert.equal(k.al("node/1").skor, 10);
  depo.ham.set(ANAHTAR, "{bozuk");
  k.yenidenOku();
  assert.equal(k.sayi(), 1);
});
