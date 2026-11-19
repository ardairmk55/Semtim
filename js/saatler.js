/* Semtim — OSM opening_hours ayrıştırıcısı: "şu an açık mı?", ne zaman kapanır/açılır.

   Desteklenen alt küme (OSM'deki kayıtların büyük çoğunluğu):
     24/7 · Mo-Fr 09:00-18:00 · Mo,We,Fr 10:00-12:00,13:00-19:00 · Sa 10:00-14:00; Su off
     Fr-Mo (haftayı saran gün aralığı) · 18:00-02:00 (gece yarısını aşan saat) · 24:00
   Sonraki kural, kapsadığı günler için öncekini ezer (OSM kuralı).
   Ay/hafta/tarih seçicileri, sunrise/sunset, "+" açık uç gibi ifadelerde tahmin yürütmez:
   sonuç "bilinmiyor" olur. Resmî tatil (PH) kuralları atlanır. */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const GUNLER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const GUN_AD = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  const GUN = 1440; // bir gündeki dakika
  const HAFTA = 7 * GUN;
  const GUN_DESEN = "(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?";
  const KURAL = new RegExp(`^(${GUN_DESEN}(?:\\s*,\\s*${GUN_DESEN})*)?\\s*(.*)$`);

  /** "Mo-Fr,Su" → { gunler:[0,1,2,3,4,6], sadeceTatil:false }; geçersizse null. PH/SH atlanır. */
  function gunleriAyir(ifade) {
    const sonuc = new Set();
    let tatilVar = false;
    for (const parca of ifade.split(",")) {
      const p = parca.trim();
      if (p === "PH" || p === "SH") { tatilVar = true; continue; }
      const m = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
      if (!m) return null;
      const a = GUNLER.indexOf(m[1]);
      const b = m[2] ? GUNLER.indexOf(m[2]) : a;
      for (let i = a; ; i = (i + 1) % 7) {
        sonuc.add(i);
        if (i === b) break;
      }
    }
    return { gunler: [...sonuc], sadeceTatil: tatilVar && sonuc.size === 0 };
  }

  function dakikaAyir(s) {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 48 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
  }

  /** "09:00-12:00,13:00-18:00" → [[540,720],[780,1080]]; geçersizse null. */
  function saatleriAyir(ifade) {
    const araliklar = [];
    for (const parca of ifade.split(",")) {
      const m = parca.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!m) return null;
      const a = dakikaAyir(m[1]);
      let b = dakikaAyir(m[2]);
      if (a == null || b == null || a >= GUN) return null;
      if (b <= a) b += GUN; // gece yarısını aşıyor: 18:00-02:00
      araliklar.push([a, b]);
    }
    return araliklar;
  }

  /**
   * opening_hours metnini haftalık tabloya çevirir.
   * Dönüş: 7 elemanlı dizi (Pzt..Paz), her biri [başlangıç, bitiş] dakika aralıkları; desteklenmiyorsa null.
   */
  function ayristir(metin) {
    const s = (metin || "").trim();
    if (!s) return null;
    if (s === "24/7") return Array.from({ length: 7 }, () => [[0, GUN]]);
    if (/\|\||sunrise|sunset|dawn|dusk|week|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\[|"|\+/.test(s)) return null;

    const tablo = Array.from({ length: 7 }, () => []);
    let kuralVar = false;
    for (const hamKural of s.split(";")) {
      const kural = hamKural.trim();
      if (!kural) continue;
      const m = kural.match(KURAL);
      const gunIfade = (m[1] || "").replace(/\s+/g, "");
      const saatIfade = m[2].trim();
      let gunler = [0, 1, 2, 3, 4, 5, 6];
      if (gunIfade) {
        const g = gunleriAyir(gunIfade);
        if (!g) return null;
        if (g.sadeceTatil) continue;
        gunler = g.gunler;
      } else if (!saatIfade) {
        return null;
      }
      let araliklar;
      if (/^(off|closed)$/i.test(saatIfade)) araliklar = [];
      else if (saatIfade === "24/7" || saatIfade === "") araliklar = [[0, GUN]];
      else {
        araliklar = saatleriAyir(saatIfade);
        if (!araliklar) return null;
      }
      for (const g of gunler) tablo[g] = araliklar.map((a) => a.slice());
      kuralVar = true;
    }
    return kuralVar ? tablo : null;
  }

  const pztIndeks = (tarih) => (tarih.getDay() + 6) % 7; // JS'de Pazar=0; burada Pazartesi=0

  function saatYazi(dakika) {
    const m = ((dakika % GUN) + GUN) % GUN;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  /* Türkçe ek: saat sesli okunduğu gibi çekimlenir. 09:00'da, 18:00'de, 21:00'e, 02:00'ye, 15:30'da. */
  const OKUNUS_SAAT = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz", "on", "on bir", "on iki",
    "on üç", "on dört", "on beş", "on altı", "on yedi", "on sekiz", "on dokuz", "yirmi", "yirmi bir", "yirmi iki", "yirmi üç"];
  const OKUNUS_ON = ["", "on", "yirmi", "otuz", "kırk", "elli"];
  const OKUNUS_BIR = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];

  function sonKelime(dakika) {
    const m = ((dakika % GUN) + GUN) % GUN;
    const d = m % 60;
    if (d === 0) return OKUNUS_SAAT[Math.floor(m / 60)];
    return OKUNUS_BIR[d % 10] || OKUNUS_ON[Math.floor(d / 10)];
  }

  function ek(dakika, tur) {
    const k = sonKelime(dakika);
    const unluler = k.match(/[aeıioöuü]/g) || ["e"];
    const kalin = "aıou".includes(unluler[unluler.length - 1]);
    if (tur === "bulunma") return "'" + (/[çfhkpsşt]$/.test(k) ? "t" : "d") + (kalin ? "a" : "e"); // -da/-de/-ta/-te
    return "'" + (/[aeıioöuü]$/.test(k) ? "y" : "") + (kalin ? "a" : "e"); // yönelme: -a/-e/-ya/-ye
  }

  function gunOneki(hedef, simdi) {
    const fark = Math.floor(hedef / GUN) - Math.floor(simdi / GUN);
    if (fark <= 0) return "";
    if (fark === 1) return "Yarın ";
    return GUN_AD[((Math.floor(hedef / GUN) % 7) + 7) % 7] + " ";
  }

  /** Haftalık tabloyu, önceki/sonraki haftaya taşan aralıklarla birlikte birleşik bir zaman çizgisine çevirir. */
  function zamanCizgisi(tablo) {
    const liste = [];
    tablo.forEach((araliklar, g) => {
      for (const [a, b] of araliklar) {
        for (const kayma of [-HAFTA, 0, HAFTA]) liste.push([g * GUN + a + kayma, g * GUN + b + kayma]);
      }
    });
    liste.sort((x, y) => x[0] - y[0]);
    const birlesik = [];
    for (const [a, b] of liste) {
      const son = birlesik[birlesik.length - 1];
      if (son && a <= son[1]) son[1] = Math.max(son[1], b);
      else birlesik.push([a, b]);
    }
    return birlesik;
  }

  /**
   * Şu an açık mı?
   * Dönüş: { durum: "acik" | "kapali" | "bilinmiyor", metin, kalanDk }
   *   metin: "21:00'e kadar açık", "Yarın 09:00'da açılıyor" gibi kısa Türkçe açıklama.
   *   kalanDk: kapanışa ya da açılışa kalan dakika (yoksa null).
   */
  function durum(metin, simdi = new Date()) {
    const tablo = ayristir(metin);
    if (!tablo) return { durum: "bilinmiyor", metin: metin ? "Saat bilgisi okunamadı" : "Saat bilgisi yok", kalanDk: null };
    const cizgi = zamanCizgisi(tablo);
    if (!cizgi.length) return { durum: "kapali", metin: "Her gün kapalı", kalanDk: null };

    const t = pztIndeks(simdi) * GUN + simdi.getHours() * 60 + simdi.getMinutes();
    const acik = cizgi.find(([a, b]) => a <= t && t < b);
    if (acik) {
      if (acik[1] - t >= HAFTA) return { durum: "acik", metin: "7/24 açık", kalanDk: null };
      const bitis = acik[1];
      const yazi = bitis % GUN === 0 ? `${gunOneki(bitis - 1, t)}gece yarısına kadar açık` : `${gunOneki(bitis, t)}${saatYazi(bitis)}${ek(bitis, "yonelme")} kadar açık`;
      return { durum: "acik", metin: yazi.charAt(0).toLocaleUpperCase("tr") + yazi.slice(1), kalanDk: bitis - t };
    }
    const sonraki = cizgi.find(([a]) => a > t);
    if (!sonraki) return { durum: "kapali", metin: "Kapalı", kalanDk: null };
    return { durum: "kapali", metin: `${gunOneki(sonraki[0], t)}${saatYazi(sonraki[0])}${ek(sonraki[0], "bulunma")} açılıyor`, kalanDk: sonraki[0] - t };
  }

  /** Okunur haftalık özet: [{ gun: "Pazartesi", metin: "09:00–18:00" }, …]; desteklenmiyorsa null. */
  function haftalik(metin) {
    const tablo = ayristir(metin);
    if (!tablo) return null;
    return tablo.map((araliklar, g) => ({
      gun: GUN_AD[g],
      metin: araliklar.length
        ? araliklar.map(([a, b]) => (a === 0 && b === GUN ? "24 saat" : `${saatYazi(a)}–${b === GUN ? "24:00" : saatYazi(b)}`)).join(", ")
        : "Kapalı",
    }));
  }

  S.saatler = { ayristir, durum, haftalik, GUN_AD };
})(window.Semtim);
