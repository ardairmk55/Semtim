/* Semtim — satış hunisi: aday işletmeleri aşama, not ve takip tarihiyle izler.

   Veri yalnızca bu tarayıcının localStorage'ında durur (anahtar: semtim:huni:v2).
   Her kayıt işletmenin küçük bir anlık görüntüsünü de saklar; böylece huni,
   o bölge yeniden taranmadan da listelenebilir, haritada gösterilebilir.

   Kayıt biçimi:
     { id: "node/123", asama: "aday", not: "", takip: "2026-11-25" | "", olusturma: ms, guncel: ms,
       ad, sektor, telefon, whatsapp, adres, lat, lng } */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const ANAHTAR = "semtim:huni:v2";
  const ESKI_ANAHTAR = "semtim:notlar";

  const ASAMALAR = [
    { id: "aday",     ad: "Aday",             ikon: "target",         renk: "#1E88E5" },
    { id: "iletisim", ad: "İletişime geçildi", ikon: "phone",         renk: "#7E57C2" },
    { id: "teklif",   ad: "Teklif verildi",   ikon: "notebook-pen",   renk: "#F57C00" },
    { id: "musteri",  ad: "Müşteri",          ikon: "circle-check",   renk: "#2E7D32" },
    { id: "kayip",    ad: "İlgilenmedi",      ikon: "x",              renk: "#78909C" },
  ];
  const ASAMA = Object.fromEntries(ASAMALAR.map((a) => [a.id, a]));
  const ESKI_ESLEME = { gittim: "iletisim", ilgilendi: "teklif", ilgilenmedi: "kayip", musteri: "musteri" };
  const GORUNTU_ALANLARI = ["ad", "sektor", "telefon", "whatsapp", "adres", "lat", "lng"];
  const TARIH = /^\d{4}-\d{2}-\d{2}$/;

  /** depo: localStorage benzeri { getItem, setItem, removeItem }. Testlerde sahte depo verilebilir. */
  function olustur(depo, saat = () => Date.now()) {
    let kayitlar = {};
    const dinleyiciler = new Set();

    function oku() {
      try {
        const ham = JSON.parse(depo.getItem(ANAHTAR) || "null");
        if (ham && typeof ham === "object") kayitlar = temizle(ham);
      } catch (e) { kayitlar = {}; }
      // v1 notlarını (Gittim / İlgilendi / …) bir kereliğine taşı.
      try {
        const eski = JSON.parse(depo.getItem(ESKI_ANAHTAR) || "null");
        if (eski && typeof eski === "object") {
          for (const [id, deger] of Object.entries(eski)) {
            if (!kayitlar[id] && ESKI_ESLEME[deger]) {
              kayitlar[id] = yeniKayit(id, { asama: ESKI_ESLEME[deger], ad: "OSM kaydı " + id });
            }
          }
          depo.removeItem(ESKI_ANAHTAR);
          kaydet();
        }
      } catch (e) { /* yoksay */ }
    }

    function kaydet() {
      try { depo.setItem(ANAHTAR, JSON.stringify(kayitlar)); } catch (e) { /* kota dolu ya da depolama kapalı */ }
      dinleyiciler.forEach((f) => f());
    }

    function yeniKayit(id, alanlar) {
      const t = saat();
      return { id, asama: "aday", not: "", takip: "", olusturma: t, guncel: t, ...alanlar };
    }

    /** İşletmeyi huniye ekler ya da kaydını günceller. isletme: tarama kaydı (anlık görüntü için). */
    function guncelle(isletme, degisiklik = {}) {
      const id = isletme.id;
      const onceki = kayitlar[id] || yeniKayit(id, {});
      const goruntu = {};
      for (const a of GORUNTU_ALANLARI) if (isletme[a] !== undefined) goruntu[a] = isletme[a];
      const yeni = { ...onceki, ...goruntu, ...dogrula(degisiklik), guncel: saat() };
      kayitlar[id] = yeni;
      kaydet();
      return yeni;
    }

    function sil(id) {
      if (!kayitlar[id]) return false;
      delete kayitlar[id];
      kaydet();
      return true;
    }

    function hepsiniSil() {
      kayitlar = {};
      kaydet();
    }

    const al = (id) => kayitlar[id] || null;
    const liste = () => Object.values(kayitlar);

    /** Aşamalara göre gruplanmış liste; her grupta takip tarihi yakın olan önce. */
    function gruplar() {
      const g = Object.fromEntries(ASAMALAR.map((a) => [a.id, []]));
      for (const k of liste()) (g[k.asama] || g.aday).push(k);
      for (const dizi of Object.values(g)) {
        dizi.sort((a, b) => (a.takip || "9999").localeCompare(b.takip || "9999") || b.guncel - a.guncel);
      }
      return g;
    }

    /** Takip tarihi bugün ya da geçmiş, hâlâ açık (müşteri/kayıp değil) kayıtlar. */
    function gecikenler(bugun = yerelTarih(new Date(saat()))) {
      return liste().filter((k) => k.takip && k.takip <= bugun && k.asama !== "musteri" && k.asama !== "kayip");
    }

    function disaAktar() {
      return JSON.stringify({ uygulama: "semtim", surum: 2, tarih: new Date(saat()).toISOString(), kayitlar: liste() }, null, 2);
    }

    /** JSON yedeğini içe alır. birlestir=true: mevcutla birleştir (daha yeni olan kazanır). Dönüş: alınan kayıt sayısı. */
    function iceAktar(metin, birlestir = true) {
      let veri;
      try { veri = JSON.parse(metin); } catch (e) { throw new Error("Dosya geçerli bir JSON değil."); }
      const dizi = Array.isArray(veri) ? veri : veri && Array.isArray(veri.kayitlar) ? veri.kayitlar : null;
      if (!dizi) throw new Error("Bu dosya bir Semtim huni yedeği değil.");
      const gelen = temizle(Object.fromEntries(dizi.filter((k) => k && typeof k.id === "string").map((k) => [k.id, k])));
      if (!birlestir) kayitlar = {};
      let sayac = 0;
      for (const [id, k] of Object.entries(gelen)) {
        if (!kayitlar[id] || (k.guncel || 0) >= (kayitlar[id].guncel || 0)) {
          kayitlar[id] = k;
          sayac++;
        }
      }
      kaydet();
      return sayac;
    }

    oku();
    return {
      al, liste, gruplar, guncelle, sil, hepsiniSil, gecikenler, disaAktar, iceAktar,
      dinle: (f) => { dinleyiciler.add(f); return () => dinleyiciler.delete(f); },
      sayi: () => Object.keys(kayitlar).length,
    };
  }

  /** Dışarıdan gelen değişiklikleri süzer: bilinmeyen aşama, bozuk tarih, aşırı uzun not reddedilir. */
  function dogrula(d) {
    const c = {};
    if (d.asama !== undefined) {
      if (!ASAMA[d.asama]) throw new Error(`Bilinmeyen aşama: ${d.asama}`);
      c.asama = d.asama;
    }
    if (d.not !== undefined) c.not = String(d.not).slice(0, 2000);
    if (d.takip !== undefined) {
      if (d.takip && !TARIH.test(d.takip)) throw new Error("Takip tarihi YYYY-AA-GG biçiminde olmalı.");
      c.takip = d.takip || "";
    }
    return c;
  }

  function temizle(nesne) {
    const c = {};
    for (const [id, k] of Object.entries(nesne)) {
      if (!k || typeof k !== "object" || !/^(node|way|relation)\/\d+$/.test(id)) continue;
      c[id] = {
        id,
        asama: ASAMA[k.asama] ? k.asama : "aday",
        not: typeof k.not === "string" ? k.not.slice(0, 2000) : "",
        takip: typeof k.takip === "string" && TARIH.test(k.takip) ? k.takip : "",
        olusturma: Number.isFinite(k.olusturma) ? k.olusturma : 0,
        guncel: Number.isFinite(k.guncel) ? k.guncel : 0,
        ad: typeof k.ad === "string" ? k.ad.slice(0, 200) : id,
        sektor: typeof k.sektor === "string" ? k.sektor : "genel",
        telefon: typeof k.telefon === "string" ? k.telefon : "",
        whatsapp: typeof k.whatsapp === "string" && /^\d{12}$/.test(k.whatsapp) ? k.whatsapp : "",
        adres: typeof k.adres === "string" ? k.adres : "",
        lat: Number.isFinite(k.lat) ? k.lat : null,
        lng: Number.isFinite(k.lng) ? k.lng : null,
      };
    }
    return c;
  }

  /** Date → "YYYY-AA-GG" (yerel saat diliminde). */
  function yerelTarih(t) {
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }

  S.huni = { olustur, ASAMALAR, ASAMA, yerelTarih, ANAHTAR };
})(window.Semtim);
