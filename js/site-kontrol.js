/* Semtim — web sitesi sağlık kontrolü sonuçlarını içe aktarır (araclar/semtim_kontrol.py çıktısı).

   Akış: Semtim'den CSV indir → bilgisayarda kontrol aracını çalıştır → çıkan *-kontrol.csv dosyasını
   Semtim'e geri yükle. Her işletme `osm` sütunundaki adresle eşleşir; dijital skor kartlarda,
   detay panelinde ve "Zayıf site" filtresinde görünür. Sonuçlar yalnızca bu tarayıcıda durur.

   Kayıt biçimi (localStorage "semtim:site-kontrol:v1"):
     { "node/123": { skor: 45, durum: "açılıyor", https: true, ssl: true|null, mobil: false,
                     ms: 1800|null, baslik: "", notlar: "", adres: "", tarih: ms } } */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const ANAHTAR = "semtim:site-kontrol:v1";
  const OSM = /openstreetmap\.org\/(node|way|relation)\/(\d+)/;

  /** RFC 4180 benzeri CSV ayrıştırıcı: tırnak, kaçışlı tırnak, satır içi yeni satır, BOM, ; ya da , ayırıcı. */
  function csvAyristir(metin) {
    const s = String(metin || "").replace(/^﻿/, "");
    const ilkSatir = s.slice(0, s.search(/\r?\n|$/));
    const ayrac = (ilkSatir.match(/;/g) || []).length >= (ilkSatir.match(/,/g) || []).length ? ";" : ",";
    const satirlar = [];
    let satir = [], hucre = "", tirnak = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (tirnak) {
        if (c === '"') {
          if (s[i + 1] === '"') { hucre += '"'; i++; } else tirnak = false;
        } else hucre += c;
      } else if (c === '"') tirnak = true;
      else if (c === ayrac) { satir.push(hucre); hucre = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        satir.push(hucre); hucre = "";
        if (satir.some((h) => h !== "")) satirlar.push(satir);
        satir = [];
      } else hucre += c;
    }
    satir.push(hucre);
    if (satir.some((h) => h !== "")) satirlar.push(satir);
    return satirlar;
  }

  // Semtim'in CSV'si formül enjeksiyonuna karşı bazı hücrelerin başına ' koyar; geri al.
  const temiz = (v) => String(v ?? "").replace(/^'(?=[=+\-@])/, "").trim();
  const evetHayir = (v) => (v === "evet" ? true : v === "hayır" ? false : null);

  /**
   * Kontrol aracının CSV metnini okur.
   * Dönüş: { kayitlar: { id: {...} }, satir: toplam veri satırı, eslesen: alınan kayıt }
   */
  function ayristir(metin, tarih = Date.now()) {
    const satirlar = csvAyristir(metin);
    if (satirlar.length < 2) throw new Error("Dosya boş ya da tek satır.");
    const baslik = satirlar[0].map((b) => temiz(b).toLowerCase());
    const sutun = (ad) => baslik.indexOf(ad);
    const iOsm = sutun("osm"), iSkor = sutun("dijital_skor"), iDurum = sutun("site_durumu");
    if (iOsm < 0) throw new Error("Bu dosyada \"osm\" sütunu yok. Semtim'den indirilen CSV'yi kontrol aracından geçir.");
    if (iSkor < 0 || iDurum < 0) throw new Error("Bu dosyada kontrol sonucu yok. Önce araclar/semtim_kontrol.py ile kontrol et.");
    const al = (r, ad) => { const i = sutun(ad); return i < 0 ? "" : temiz(r[i]); };

    const kayitlar = {};
    for (const r of satirlar.slice(1)) {
      const m = temiz(r[iOsm]).match(OSM);
      const durum = temiz(r[iDurum]);
      if (!m || !durum || durum === "site yok") continue;
      const skor = Math.max(0, Math.min(100, parseInt(temiz(r[iSkor]), 10) || 0));
      const ms = parseInt(al(r, "yukleme_ms"), 10);
      kayitlar[`${m[1]}/${m[2]}`] = {
        skor,
        durum: durum.slice(0, 60),
        https: evetHayir(al(r, "https")),
        ssl: evetHayir(al(r, "ssl_gecerli")),
        mobil: evetHayir(al(r, "mobil_uyumlu")),
        ms: Number.isFinite(ms) ? ms : null,
        baslik: al(r, "baslik").slice(0, 120),
        notlar: al(r, "notlar").slice(0, 300),
        adres: al(r, "son_adres").slice(0, 300),
        tarih,
      };
    }
    return { kayitlar, satir: satirlar.length - 1, eslesen: Object.keys(kayitlar).length };
  }

  /** 0-100 skoru üç seviyeye ayırır; arayüzde renk ve metin için. */
  function seviye(skor) {
    if (skor >= 80) return { id: "iyi", ad: "İyi" };
    if (skor >= 60) return { id: "orta", ad: "Orta" };
    return { id: "zayif", ad: "Zayıf" };
  }

  /** depo: localStorage benzeri. */
  function olustur(depo) {
    let veri = {};
    try {
      const ham = JSON.parse(depo.getItem(ANAHTAR) || "{}");
      if (ham && typeof ham === "object") veri = ham;
    } catch (e) { veri = {}; }
    const kaydet = () => { try { depo.setItem(ANAHTAR, JSON.stringify(veri)); } catch (e) { /* kota dolu */ } };
    return {
      al: (id) => veri[id] || null,
      sayi: () => Object.keys(veri).length,
      /** CSV metnini alır, mevcut sonuçlarla birleştirir (aynı işletmede yeni sonuç kazanır). */
      iceAktar(metin) {
        const sonuc = ayristir(metin);
        Object.assign(veri, sonuc.kayitlar);
        kaydet();
        return sonuc;
      },
      temizle() { veri = {}; try { depo.removeItem(ANAHTAR); } catch (e) { /* yoksay */ } },
    };
  }

  S.siteKontrol = { csvAyristir, ayristir, seviye, olustur, ANAHTAR };
})(window.Semtim);
