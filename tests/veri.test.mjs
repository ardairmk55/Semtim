import { test } from "node:test";
import assert from "node:assert/strict";
import { yukle } from "./yukle.mjs";

const S = yukle("turkce.js", "sektor.js", "veri.js", "ikonlar.js");
const j = (x) => JSON.parse(JSON.stringify(x));

test("telefon biçimi ve WhatsApp cep tespiti", () => {
  assert.equal(S.tr.telDuzen("05468414539"), "+90 546 841 45 39");
  assert.equal(S.tr.telDuzen("+90 216 123 45 67;+90 532 000 00 00"), "+90 216 123 45 67");
  assert.equal(S.tr.whatsapp("0532 000 00 00"), "905320000000");
  assert.equal(S.tr.whatsapp("+90 216 123 45 67"), "");
});

test("güvenli URL ve HTML kaçışı", () => {
  assert.equal(S.tr.guvenliUrl("ornek.com.tr"), "https://ornek.com.tr/");
  assert.equal(S.tr.guvenliUrl("javascript:alert(1)"), "");
  assert.equal(S.tr.h(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.equal(S.tr.slug("Moda, Kadıköy / İstanbul"), "moda-kadikoy-istanbul");
});

test("sektör eşleme", () => {
  assert.equal(S.sektor.sektorBul({ shop: "hairdresser", name: "Erkek Kuaför Ali" }), "berber");
  assert.equal(S.sektor.sektorBul({ amenity: "dentist" }), "dis");
  assert.equal(S.sektor.sektorBul({ shop: "greengrocer" }), "market");
});

test("her sektörün ikonu sprite'ta var (emoji yok)", () => {
  for (const [k, s] of Object.entries(S.sektor.SEKTOR)) {
    assert.ok(S.ikonlar.var(s.ikon), `${k}: ${s.ikon} ikonu eksik`);
    assert.equal(s.emoji, undefined);
  }
});

test("OSM öğesini kayda çevirir, fırsat puanı verir", () => {
  const x = S.veri.kayit({ type: "node", id: 1, lat: 41, lon: 29, tags: { name: "Lale Kuaför", shop: "hairdresser", phone: "0532 111 22 33", opening_hours: "Mo-Sa 09:00-20:00", "addr:street": "Bahariye Cd." } });
  assert.equal(x.id, "node/1");
  assert.equal(x.sektor, "kuafor");
  assert.equal(x.dijital, "yok");
  assert.equal(x.whatsapp, "905321112233");
  assert.ok(x.puan > 60, `puan ${x.puan}`);

  const site = S.veri.kayit({ type: "way", id: 2, center: { lat: 41, lon: 29 }, tags: { name: "Zincir Market", shop: "supermarket", brand: "X", website: "x.com" } });
  assert.equal(site.puan, 0);
  assert.equal(site.zincir, true);
  assert.equal(S.veri.kayit({ type: "node", id: 3, lat: 41, lon: 29, tags: { name: "Boş", shop: "vacant" } }), null);
});

test("tekilleştirme aynı ad+telefonu bir kez tutar", () => {
  const a = S.veri.kayit({ type: "node", id: 1, lat: 41, lon: 29, tags: { name: "Simit Evi", shop: "bakery", phone: "0532 111 22 33" } });
  const b = S.veri.kayit({ type: "way", id: 9, center: { lat: 41.0001, lon: 29 }, tags: { name: "SİMİT EVİ", shop: "bakery", phone: "+905321112233" } });
  assert.equal(S.veri.tekillestir([a, b, null]).length, 1);
});

test("büyük alan parçalara bölünür", () => {
  assert.equal(S.veri.bolgeler(41, 29, 2000).length, 1);
  assert.equal(S.veri.bolgeler(41, 29, 6000).length, 4);
  assert.equal(S.veri.bolgeler(41, 29, 10000).length, 9);
  assert.match(S.veri.sorguMetni("(around:100,41,29)"), /^\[out:json\]/);
});

test("ikon yardımcısı bilinmeyen ikonda güvenli yedeğe düşer", () => {
  assert.match(S.ikon("phone"), /#i-phone/);
  assert.match(S.ikon("yok-boyle-ikon"), /#i-circle-alert/);
  assert.ok(j(Object.keys(S.ikonlar.YOL)).length >= 60);
});
