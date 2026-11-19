/* Semtim — veri katmanı: önbellek (IndexedDB), Nominatim, Overpass, puanlama.
   Sunucu ya da veritabanı yoktur; her şey kullanıcının tarayıcısında çalışır. */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const SURUM = "v1";
  const ONBELLEK_GUN = 7;
  const EN_FAZLA_YARICAP = 5000; // 5 km: genel Overpass sunucularını yormadan makul sürede yanıt alınan üst sınır
  // Ücretsiz, gönüllü Overpass sunucuları. Yoğunlukta biri dolarken diğeri boş olabilir; hepsi yarıştırılır.
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
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

  /* Overpass sunucu yarışı.
     Sunucular sırayla değil kademeli başlatılır (0 sn, 4 sn, 9 sn, 14 sn): ilk başarılı yanıt kazanır,
     diğer istekler iptal edilir. Hata veren sunucu beklemeden bir sonrakine yer açar.
     Hangi sunucunun ne kadar hızlı yanıt verdiği ve hangisinin çöktüğü cihazda hatırlanır;
     son 5 dakikada hata veren sunucu sona alınır. Böylece telefonda ikinci tarama daha da hızlanır. */
  const AYAR = { kademe: [0, 4000, 9000, 14000], sunucuSuresi: 45000, ceza: 5 * 60000 };
  const SAGLIK_ANAHTAR = "semtim:overpass-saglik";
  let saglik = {};
  try { saglik = JSON.parse(localStorage.getItem(SAGLIK_ANAHTAR) || "{}") || {}; } catch (e) { saglik = {}; }

  function saglikYaz(host, alanlar) {
    saglik[host] = { ...(saglik[host] || {}), ...alanlar };
    try { localStorage.setItem(SAGLIK_ANAHTAR, JSON.stringify(saglik)); } catch (e) { /* depolama kapalı */ }
  }

  /** Hızlı ve sağlıklı sunucu önce; yakın zamanda çöken sona. */
  function sunucuSirasi(simdi = Date.now()) {
    const puan = (u, i) => {
      const s = saglik[new URL(u).host] || {};
      const cezali = s.hata && simdi - s.hata < AYAR.ceza && !(s.basari > s.hata);
      return (cezali ? 1e7 : 0) + (s.basari ? s.sure : 30000) + i;
    };
    return OVERPASS.map((u, i) => [u, puan(u, i)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }

  function yaris(sira, sorgu, sinyal, bildir) {
    return new Promise((coz, red) => {
      const kontroller = [], zamanlar = [];
      let bitti = false, baslayan = 0, biten = 0, sonHata = null;
      const iptal = () => bitir(new DOMException("İptal", "AbortError"));
      function bitir(hata, veri) {
        if (bitti) return;
        bitti = true;
        zamanlar.forEach(clearTimeout);
        kontroller.forEach((k) => k.abort());
        sinyal?.removeEventListener("abort", iptal);
        if (hata) red(hata); else coz(veri);
      }
      function sonraki() {
        if (bitti || baslayan >= sira.length) return;
        const u = sira[baslayan++], host = new URL(u).host, k = new AbortController(), t0 = Date.now();
        kontroller.push(k);
        zamanlar.push(setTimeout(() => k.abort(), AYAR.sunucuSuresi));
        bildir?.({ sunucu: host, deneme: baslayan, toplam: sira.length });
        fetch(u, {
          method: "POST",
          body: "data=" + encodeURIComponent(sorgu),
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          signal: k.signal,
        })
          .then(async (y) => {
            if (!y.ok) throw new Error(`${host} ${y.status === 429 || y.status >= 500 ? "yoğun" : y.status}`);
            const veri = await y.json();
            // 200 dönüp sorguyu yarıda kesen sunucu eksik veri verir; onu da hata say.
            if (veri && /runtime error|timed out|out of memory/i.test(veri.remark || "")) throw new Error(`${host} sorguyu tamamlayamadı`);
            saglikYaz(host, { basari: Date.now(), sure: Date.now() - t0 });
            bitir(null, veri);
          })
          .catch((e) => {
            if (bitti) return;
            sonHata = e.name === "AbortError" ? new Error(`${host} yanıt vermedi`) : e;
            saglikYaz(host, { hata: Date.now() });
            biten++;
            if (baslayan < sira.length) sonraki(); // beklemeden sıradakini başlat
            else if (biten === sira.length) bitir(sonHata);
          });
      }
      if (sinyal?.aborted) return iptal();
      sinyal?.addEventListener("abort", iptal, { once: true });
      sonraki();
      AYAR.kademe.slice(1).forEach((ms) => zamanlar.push(setTimeout(sonraki, ms)));
    });
  }

  /** Overpass'e sorar. bildir({ sunucu, deneme, toplam } | { bekliyor }) ilerlemeyi arayüze aktarır. */
  async function overpass(sorgu, sinyal, bildir) {
    let sonHata;
    for (let tur = 0; tur < 2; tur++) {
      try {
        return await yaris(sunucuSirasi(), sorgu, sinyal, bildir);
      } catch (e) {
        if (e.name === "AbortError" || sinyal?.aborted) throw new DOMException("İptal", "AbortError");
        sonHata = e;
      }
      if (tur === 0) {
        bildir?.({ bekliyor: true });
        await bekle(2500, sinyal);
      }
    }
    throw new Error(`Harita veri sunucuları şu an çok yoğun (${sonHata?.message || "yanıt yok"}). Birkaç dakika sonra tekrar deneyin ya da yarıçapı küçültün.`);
  }

  /* Sorgu: alan kutu (bbox) olarak verilir; "around" çemberinden çok daha ucuzdur, mesafe süzmesi tarayıcıda yapılır.
     Bildirilen düşük süre ve bellek, yoğun sunucuların sorguyu kuyruğa daha önce almasını sağlar. */
  function sorguMetni(kapsam) {
    return "[out:json][timeout:30][maxsize:67108864];(" + S.sektor.FILTRE.map((f) => f + kapsam + ";").join("") + ");out center tags qt;";
  }

  const kutu = (s, w, n, e) => `(${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)})`;

  /** Büyük alanları parçalara böler: Overpass'te zaman aşımını önler ve ilerleme gösterir. */
  function bolgeler(lat, lng, r) {
    if (r <= 4000) {
      const dLat = r / 111320, dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
      return [kutu(lat - dLat, lng - dLng, lat + dLat, lng + dLng)];
    }
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
  async function tara(lat, lng, r, { ilerleme, sinyal, yenile = false, bilgi } = {}) {
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
        const d = await overpass(sorguMetni(parcalar[i]), sinyal, bilgi);
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

  S.veri = { tara, overpass, sunucuSirasi, AYAR, konumAra, onbellekTemizle, onbellekSayisi, firsatPuani, dijitalDurum, kayit, tekillestir, bolgeler, sorguMetni, EN_FAZLA_YARICAP };
})(window.Semtim);
