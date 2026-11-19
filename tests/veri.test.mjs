import { test } from "node:test";
import assert from "node:assert/strict";
import { yukle, yukleOrtamla } from "./yukle.mjs";

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
  assert.equal(S.veri.bolgeler(41, 29, 10000).length, 9); // fonksiyon genel; uygulama 5 km ile sınırlar
  assert.equal(S.veri.EN_FAZLA_YARICAP, 5000);
  assert.match(S.veri.sorguMetni("(around:100,41,29)"), /^\[out:json\]/);
});

test("ikon yardımcısı bilinmeyen ikonda güvenli yedeğe düşer", () => {
  assert.match(S.ikon("phone"), /#i-phone/);
  assert.match(S.ikon("yok-boyle-ikon"), /#i-circle-alert/);
  assert.ok(j(Object.keys(S.ikonlar.YOL)).length >= 60);
});

test("Overpass: hata veren sunucudan yedeğe geçer, çalışanı sonra ilk dener", async () => {
  const istekler = [];
  const fetch = async (url) => {
    istekler.push(new URL(url).host);
    if (url.includes("overpass-api.de")) return { ok: false, status: 502 };
    return { ok: true, status: 200, json: async () => ({ elements: [{ id: 1 }] }) };
  };
  const V = yukleOrtamla({ fetch }, "turkce.js", "sektor.js", "veri.js");
  const d = await V.veri.overpass("[out:json];");
  assert.equal(d.elements.length, 1);
  assert.deepEqual(j(istekler), ["overpass-api.de", "overpass.kumi.systems"]);
  istekler.length = 0;
  await V.veri.overpass("[out:json];");
  assert.deepEqual(j(istekler), ["overpass.kumi.systems"], "son çalışan sunucu önce denenir");
});

test("Overpass: kullanıcı iptali AbortError olarak yükselir", async () => {
  const fetch = (url, { signal }) => new Promise((_, red) => signal.addEventListener("abort", () => red(new DOMException("x", "AbortError"))));
  const V = yukleOrtamla({ fetch }, "turkce.js", "sektor.js", "veri.js");
  const k = new AbortController();
  const p = V.veri.overpass("[out:json];", k.signal);
  setTimeout(() => k.abort(), 20);
  await assert.rejects(p, (e) => e.name === "AbortError");
});

test("Overpass: yanıt vermeyen sunucu beklenmeden ikinciyle yarıştırılır, hızlı olan kazanır", async () => {
  const istekler = [];
  const fetch = (url, { signal }) => {
    istekler.push(new URL(url).host);
    if (url.includes("overpass-api.de")) {
      return new Promise((_, red) => signal.addEventListener("abort", () => red(new DOMException("x", "AbortError"))));
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [{ id: 2 }] }) });
  };
  const V = yukleOrtamla({ fetch }, "turkce.js", "sektor.js", "veri.js");
  V.veri.AYAR.kademe = [0, 30, 60, 90];
  const t0 = Date.now();
  const d = await V.veri.overpass("[out:json];");
  assert.equal(d.elements[0].id, 2);
  assert.ok(Date.now() - t0 < 1000, "ilk sunucunun 45 sn'lik süresini beklemedi");
  assert.deepEqual(j(istekler), ["overpass-api.de", "overpass.kumi.systems"]);
});

test("Overpass: 200 dönüp sorguyu yarıda kesen sunucu hata sayılır", async () => {
  const fetch = async (url) => url.includes("overpass-api.de")
    ? { ok: true, status: 200, json: async () => ({ remark: "runtime error: Query timed out in \"query\"", elements: [] }) }
    : { ok: true, status: 200, json: async () => ({ elements: [{ id: 3 }] }) };
  const V = yukleOrtamla({ fetch }, "turkce.js", "sektor.js", "veri.js");
  const d = await V.veri.overpass("[out:json];");
  assert.equal(d.elements[0].id, 3);
});

test("Overpass sorgusu kutu (bbox), düşük süre ve qt kullanır", () => {
  const [kapsam] = S.veri.bolgeler(41, 29, 1000);
  assert.match(kapsam, /^\(40\.99\d+,28\.98\d+,41\.00\d+,29\.01\d+\)$/);
  const q = S.veri.sorguMetni(kapsam);
  assert.match(q, /\[timeout:30\]\[maxsize:67108864\]/);
  assert.match(q, /out center tags qt;$/);
  assert.doesNotMatch(q, /around/);
});
