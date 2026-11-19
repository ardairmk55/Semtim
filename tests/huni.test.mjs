import { test } from "node:test";
import assert from "node:assert/strict";
import { yukle, sahteDepo } from "./yukle.mjs";

const S = yukle("turkce.js", "huni.js");
const { olustur, ANAHTAR } = S.huni;
const j = (x) => JSON.parse(JSON.stringify(x)); // vm dizilerini karşılaştırılabilir yap

const isletme = { id: "node/42", ad: "Kahve Durağı", sektor: "kafe", telefon: "+90 532 000 00 00", whatsapp: "905320000000", adres: "Moda", lat: 40.98, lng: 29.02, puan: 77 };
let zaman = 1_000;
const saat = () => zaman;

test("ekle, güncelle, depoya yaz", () => {
  const depo = sahteDepo();
  const h = olustur(depo, saat);
  const k = h.guncelle(isletme, { asama: "aday" });
  assert.equal(k.ad, "Kahve Durağı");
  assert.equal(k.asama, "aday");
  assert.equal(k.puan, undefined, "anlık görüntüye sadece gerekli alanlar girer");
  zaman = 2_000;
  h.guncelle(isletme, { asama: "teklif", not: "Pazartesi tekrar ara", takip: "2026-11-23" });
  const kayitli = JSON.parse(depo.getItem(ANAHTAR));
  assert.equal(kayitli["node/42"].asama, "teklif");
  assert.equal(kayitli["node/42"].olusturma, 1_000);
  assert.equal(kayitli["node/42"].guncel, 2_000);
  // yeniden yükleme aynı veriyi okur
  assert.equal(olustur(depo, saat).al("node/42").not, "Pazartesi tekrar ara");
});

test("geçersiz aşama ve tarih reddedilir", () => {
  const h = olustur(sahteDepo(), saat);
  assert.throws(() => h.guncelle(isletme, { asama: "bilinmeyen" }), /Bilinmeyen aşama/);
  assert.throws(() => h.guncelle(isletme, { takip: "23.11.2026" }), /YYYY-AA-GG/);
});

test("gruplar takip tarihine göre sıralı, gecikenler doğru", () => {
  const h = olustur(sahteDepo(), saat);
  h.guncelle({ ...isletme, id: "node/1", ad: "A" }, { takip: "2026-11-30" });
  h.guncelle({ ...isletme, id: "node/2", ad: "B" }, { takip: "2026-11-18" });
  h.guncelle({ ...isletme, id: "node/3", ad: "C" }, {});
  h.guncelle({ ...isletme, id: "node/4", ad: "D" }, { asama: "musteri", takip: "2026-11-01" });
  const g = h.gruplar();
  assert.deepEqual(j(g.aday.map((k) => k.ad)), ["B", "A", "C"]);
  assert.equal(g.musteri.length, 1);
  assert.deepEqual(j(h.gecikenler("2026-11-19").map((k) => k.ad)), ["B"]);
});

test("v1 notları taşınır ve eski anahtar silinir", () => {
  const depo = sahteDepo({ "semtim:notlar": JSON.stringify({ "way/7": "ilgilendi", "node/8": "musteri", "node/9": "saçma" }) });
  const h = olustur(depo, saat);
  assert.equal(h.al("way/7").asama, "teklif");
  assert.equal(h.al("node/8").asama, "musteri");
  assert.equal(h.al("node/9"), null);
  assert.equal(depo.getItem("semtim:notlar"), null);
});

test("dışa/içe aktarma: birleştirme daha yeni kaydı korur, bozuk veriyi süzer", () => {
  const a = olustur(sahteDepo(), saat);
  zaman = 5_000;
  a.guncelle(isletme, { asama: "musteri" });
  const yedek = a.disaAktar();

  const b = olustur(sahteDepo(), saat);
  zaman = 9_000;
  b.guncelle(isletme, { asama: "kayip" }); // b'deki daha yeni
  assert.equal(b.iceAktar(yedek), 0);
  assert.equal(b.al("node/42").asama, "kayip");

  const c = olustur(sahteDepo(), saat);
  assert.equal(c.iceAktar(yedek), 1);
  assert.equal(c.al("node/42").asama, "musteri");

  const kotu = JSON.stringify({ kayitlar: [{ id: "javascript:alert(1)", ad: "x" }, { id: "node/5", asama: "uydurma", whatsapp: "abc", lat: "1" }] });
  assert.equal(c.iceAktar(kotu), 1);
  const k5 = c.al("node/5");
  assert.equal(k5.asama, "aday");
  assert.equal(k5.whatsapp, "");
  assert.equal(k5.lat, null);
  assert.throws(() => c.iceAktar("{bozuk"), /geçerli bir JSON/);
  assert.throws(() => c.iceAktar("{}"), /huni yedeği değil/);
});

test("dinleyiciler değişiklikte çağrılır, sil çalışır", () => {
  const h = olustur(sahteDepo(), saat);
  let n = 0;
  h.dinle(() => n++);
  h.guncelle(isletme, {});
  assert.equal(h.sil("node/42"), true);
  assert.equal(h.sil("node/42"), false);
  assert.equal(n, 2);
  assert.equal(h.sayi(), 0);
});
