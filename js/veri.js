/* Semtim — veri katmanı: önbellek (IndexedDB), Nominatim, Overpass, puanlama.
   Sunucu ya da veritabanı yoktur; her şey kullanıcının tarayıcısında çalışır. */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const SURUM = "v1";
  const ONBELLEK_GUN = 7;
  const EN_FAZLA_YARICAP = 10000;
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";

  /* ------------------------------------------------------------ önbellek
     Büyük tarama sonuçları localStorage'a sığmaz, IndexedDB kullanılır.
     IndexedDB açılamazsa (gizli sekme vb.) sadece bellekte tutulur. */
  const bellek = new Map();
  let dbSoz = null;

  function db() {
    if (dbSoz) return dbSoz;
    dbSoz = new Promise((coz) => {
      try {
        const r = indexedDB.open("semtim", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("onbellek");
        r.onsuccess = () => coz(r.result);
        r.onerror = () => coz(null);
        r.onblocked = () => coz(null);
      } catch (e) {
        coz(null);
      }
    });
    return dbSoz;
  }

  async function onbellekAl(anahtar) {
    if (bellek.has(anahtar)) return bellek.get(anahtar);
    const d = await db();
    if (!d) return null;
    return new Promise((coz) => {
      try {
        const r = d.transaction("onbellek").objectStore("onbellek").get(anahtar);
        r.onsuccess = () => coz(r.result || null);
        r.onerror = () => coz(null);
      } catch (e) {
        coz(null);
      }
    });
  }

  async function onbellekYaz(anahtar, deger) {
    bellek.set(anahtar, deger);
    const d = await db();
    if (!d) return;
    try {
      d.transaction("onbellek", "readwrite").objectStore("onbellek").put(deger, anahtar);
    } catch (e) {
      /* kota dolmuş olabilir; bellekte durması yeterli */
    }
  }

  async function onbellekTemizle() {
    bellek.clear();
    const d = await db();
    if (!d) return;
    await new Promise((coz) => {
      const t = d.transaction("onbellek", "readwrite");
      t.objectStore("onbellek").clear();
      t.oncomplete = t.onerror = () => coz();
    });
  }

  /** Önbellekteki kayıtlı tarama sayısı (Hakkında penceresi için). IndexedDB yoksa bellektekiler. */
  async function onbellekSayisi() {
    const d = await db();
    if (!d) return bellek.size;
    return new Promise((coz) => {
      try {
        const r = d.transaction("onbellek").objectStore("onbellek").count();
        r.onsuccess = () => coz(r.result);
        r.onerror = () => coz(bellek.size);
      } catch (e) {
        coz(bellek.size);
      }
    });
  }

  /* ------------------------------------------------------------ ağ */
  const bekle = (ms, sinyal) =>
    new Promise((coz, red) => {
      const z = setTimeout(coz, ms);
      sinyal?.addEventListener("abort", () => { clearTimeout(z); red(new DOMException("İptal", "AbortError")); }, { once: true });
    });

  // Nominatim kuralı: saniyede en fazla 1 istek, yazarken otomatik tamamlama yok.
  let sonNominatim = 0;

  async function konumAra(q) {
    const sorgu = q.trim();
    if (!sorgu) return [];
    const anahtar = "konum:" + S.tr.trkKucuk(sorgu);
    try {
      const k = JSON.parse(localStorage.getItem(anahtar) || "null");
      if (k && Date.now() - k.t < 30 * 864e5) return k.sonuc;
    } catch (e) { /* localStorage kapalı olabilir */ }

    const gecen = Date.now() - sonNominatim;
    if (gecen < 1100) await bekle(1100 - gecen);
    sonNominatim = Date.now();

    const p = new URLSearchParams({ q: sorgu, format: "jsonv2", limit: "6", countrycodes: "tr", "accept-language": "tr", addressdetails: "0" });
    const y = await fetch(`${NOMINATIM}?${p}`, { headers: { Accept: "application/json" } });
    if (!y.ok) throw new Error(`Adres arama servisi yanıt vermedi (${y.status}).`);
    const ham = await y.json();
    const sonuc = ham.map((x) => ({ ad: x.display_name, lat: +x.lat, lng: +x.lon, tur: x.type }));
    try { localStorage.setItem(anahtar, JSON.stringify({ t: Date.now(), sonuc })); } catch (e) { /* yoksay */ }
    return sonuc;
  }

  // Son başarılı yanıt veren sunucu bir sonraki sorguda ilk denenir.
  let iyiSunucu = 0;
  // Bir sunucuya tanınan süre: ilk turda kısa (hızla yedeğe geç), ikinci turda uzun (yoğunlukta sabret).
  const SURE_SINIRI = [40000, 90000];

  /** Overpass'e sorar; hata, yoğunluk ya da süre aşımında sıradaki sunucuya geçer, sonra bir tur daha dener. */
  async function overpass(sorgu, sinyal) {
    let son;
    const sira = OVERPASS.map((_, i) => (i + iyiSunucu) % OVERPASS.length);
    for (let tur = 0; tur < 2; tur++) {
      for (const i of sira) {
        const u = OVERPASS[i];
        const kontrol = new AbortController();
        const iptal = () => kontrol.abort();
        sinyal?.addEventListener("abort", iptal, { once: true });
        const zaman = setTimeout(() => kontrol.abort(), SURE_SINIRI[tur]);
        try {
          const y = await fetch(u, {
            method: "POST",
            body: "data=" + encodeURIComponent(sorgu),
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
            signal: kontrol.signal,
          });
          if (y.ok) {
            const veri = await y.json();
            iyiSunucu = i;
            return veri;
          }
          son = new Error(`${new URL(u).host} ${y.status}`);
        } catch (e) {
          if (sinyal?.aborted) throw new DOMException("İptal", "AbortError"); // kullanıcı iptal etti
          son = e.name === "AbortError" ? new Error(`${new URL(u).host} yanıt vermedi`) : e;
        } finally {
          clearTimeout(zaman);
          sinyal?.removeEventListener("abort", iptal);
        }
      }
      await bekle(3000 * (tur + 1), sinyal);
    }
    throw new Error(`Harita veri sunucularına ulaşılamadı (${son?.message || "bilinmeyen hata"}). Biraz sonra tekrar deneyin ya da yarıçapı küçültün.`);
  }

  function sorguMetni(kapsam) {
    return "[out:json][timeout:90];(" + S.sektor.FILTRE.map((f) => f + kapsam + ";").join("") + ");out center tags;";
  }

  /** Büyük alanları parçalara böler: Overpass'te zaman aşımını önler ve ilerleme gösterir. */
  function bolgeler(lat, lng, r) {
    if (r <= 4000) return [`(around:${r},${lat.toFixed(6)},${lng.toFixed(6)})`];
    const n = r <= 7000 ? 2 : 3;
    const dLat = r / 111320, dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
    const g = 6;
    const parcalar = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const s = lat - dLat + (2 * dLat * i) / n, kz = lat - dLat + (2 * dLat * (i + 1)) / n;
        const w = lng - dLng + (2 * dLng * j) / n, d = lng - dLng + (2 * dLng * (j + 1)) / n;
        parcalar.push(`(${s.toFixed(g)},${w.toFixed(g)},${kz.toFixed(g)},${d.toFixed(g)})`);
      }
    }
    return parcalar;
  }

  /* ------------------------------------------------------------ dönüştürme */
  function kayit(e) {
    const t = e.tags || {};
    const el = e.center || { lat: e.lat, lon: e.lon };
    if (el.lat == null || el.lon == null) return null;
    if (S.sektor.GIZLI_SHOP.has(t.shop)) return null;
    const ad = (t.name || "").trim();
    if (ad.length < 2) return null;

    const telHam = t.phone || t["contact:phone"] || t["contact:mobile"] || t.mobile || "";
    const telefon = S.tr.telDuzen(telHam);
    const sokak = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
    const adres = [sokak, t["addr:neighbourhood"] || t["addr:suburb"], t["addr:district"], t["addr:city"] || t["addr:province"]]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
    const web = S.tr.guvenliUrl(t.website || t["contact:website"] || t.url || "");
    const zincir = !!(t.brand || t["brand:wikidata"] || t["operator:wikidata"]);
    const sektor = S.sektor.sektorBul(t);

    const x = {
      id: `${e.type}/${e.id}`,
      ad,
      sektor,
      telefon,
      whatsapp: S.tr.whatsapp(telHam),
      web,
      instagram: S.tr.instagramAdi(t["contact:instagram"] || t.instagram || ""),
      facebook: S.tr.guvenliUrl(t["contact:facebook"] || t.facebook || ""),
      eposta: (t.email || t["contact:email"] || "").split(";")[0].trim(),
      adres,
      saatler: t.opening_hours || "",
      lat: +el.lat,
      lng: +el.lon,
      zincir,
      marka: t.brand || "",
      firsatDisi: zincir || S.sektor.FIRSAT_DISI_SHOP.has(t.shop),
    };
    x.dijital = dijitalDurum(x);
    const [p, neden] = firsatPuani(x);
    x.puan = p;
    x.neden = neden;
    return x;
  }

  function dijitalDurum(x) {
    if (x.web) return "site";
    if (x.instagram || x.facebook) return "sosyal";
    return "yok";
  }

  /** 0-100 fırsat puanı: dijital hizmet için ne kadar uygun bir aday? Kesin tahmin değil, öncelik sırası. */
  function firsatPuani(x) {
    if (x.web || x.firsatDisi) return [0, []];
    const s = S.sektor.SEKTOR[x.sektor];
    let p = 10;
    const n = [s.ad.toLocaleLowerCase("tr")];
    p += s.agirlik;
    if (x.telefon) { p += 25; n.push("telefonu var"); }
    if (x.whatsapp) { p += 7; n.push("WhatsApp'a uygun cep"); }
    if (x.instagram || x.facebook) { p += 12; n.push("sosyal medyası var, sitesi yok"); }
    if (x.saatler) { p += 8; n.push("çalışma saatleri girilmiş"); }
    if (x.adres) { p += 5; n.push("adresi kayıtlı"); }
    if (x.eposta) p += 3;
    return [Math.min(100, p), n];
  }

  function tekillestir(liste) {
    const gorulen = new Set();
    const cikti = [];
    for (const x of liste) {
      if (!x) continue;
      const tel = x.telefon.replace(/\D/g, "").slice(-10);
      const anahtar = tel
        ? `${S.tr.trkKucuk(x.ad)}|${tel}`
        : `${S.tr.trkKucuk(x.ad)}|${x.lat.toFixed(3)}|${x.lng.toFixed(3)}`;
      if (gorulen.has(x.id) || gorulen.has(anahtar)) continue; // aynı dükkân hem nokta hem bina olarak girilmiş olabilir
      gorulen.add(x.id);
      gorulen.add(anahtar);
      cikti.push(x);
    }
    return cikti;
  }

  /* ------------------------------------------------------------ tarama */
  /**
   * lat/lng çevresinde r metrelik alandaki işletmeleri getirir.
   * ilerleme(i, n): parça parça taramada çağrılır.
   * Dönüş: { kayitlar, zaman, onbellekten }
   */
  async function tara(lat, lng, r, { ilerleme, sinyal, yenile = false } = {}) {
    r = Math.max(200, Math.min(EN_FAZLA_YARICAP, Math.round(r)));
    const anahtarYap = (yr) => `${SURUM}:${lat.toFixed(3)},${lng.toFixed(3)},${yr}`;
    const anahtar = anahtarYap(r);
    const eski = await onbellekAl(anahtar);
    const taze = (k) => k && Date.now() - k.zaman < ONBELLEK_GUN * 864e5;
    if (!yenile) {
      if (taze(eski)) return { ...eski, onbellekten: true };
      // Aynı noktada daha büyük bir tarama varsa onu süzerek kullan (yeni istek atma).
      for (let yr = Math.ceil(r / 500) * 500 + 500; yr <= EN_FAZLA_YARICAP; yr += 500) {
        const buyuk = await onbellekAl(anahtarYap(yr));
        if (taze(buyuk)) {
          const kayitlar = buyuk.kayitlar.filter((x) => S.tr.mesafe(lat, lng, x.lat, x.lng) <= r);
          return { kayitlar, zaman: buyuk.zaman, onbellekten: true };
        }
      }
    }

    const parcalar = bolgeler(lat, lng, r);
    let ham = [];
    try {
      for (let i = 0; i < parcalar.length; i++) {
        ilerleme?.(i, parcalar.length);
        const d = await overpass(sorguMetni(parcalar[i]), sinyal);
        ham = ham.concat((d.elements || []).map(kayit));
        if (i < parcalar.length - 1) await bekle(400, sinyal); // sunucuya nefes aldır
      }
    } catch (e) {
      // Sunucular çökükse eski (süresi geçmiş) önbelleği göster.
      if (e.name !== "AbortError" && eski) return { ...eski, onbellekten: true, eskimis: true };
      throw e;
    }
    ilerleme?.(parcalar.length, parcalar.length);

    const kayitlar = tekillestir(ham).filter((x) => S.tr.mesafe(lat, lng, x.lat, x.lng) <= r);
    const sonuc = { kayitlar, zaman: Date.now() };
    await onbellekYaz(anahtar, sonuc);
    return { ...sonuc, onbellekten: false };
  }

  S.veri = { tara, overpass, konumAra, onbellekTemizle, onbellekSayisi, firsatPuani, dijitalDurum, kayit, tekillestir, bolgeler, sorguMetni, EN_FAZLA_YARICAP };
})(window.Semtim);
