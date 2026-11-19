/* Semtim — Türkçe yardımcılar: harf dönüşümü, telefon, saat, mesafe, güvenli HTML. */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const trkKucuk = (s) => (s || "").replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();

  function slug(s) {
    let t = trkKucuk(s);
    const harf = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
    t = t.replace(/[çğıöşüâîû]/g, (c) => harf[c]);
    return t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "isletme";
  }

  const rakam = (s) => (s || "").replace(/\D/g, "");

  /** +905468414539 → +90 546 841 45 39 */
  function telDuzen(tel) {
    const ham = (tel || "").split(";")[0].trim();
    let r = rakam(ham);
    if (r.startsWith("0")) r = "90" + r.slice(1);
    if (r.length === 10) r = "90" + r;
    if (r.length === 12 && r.startsWith("90")) {
      return `+90 ${r.slice(2, 5)} ${r.slice(5, 8)} ${r.slice(8, 10)} ${r.slice(10, 12)}`;
    }
    return ham;
  }

  /** Cep numarasıysa WhatsApp için 905xxxxxxxxx döndürür, değilse "". */
  function whatsapp(tel) {
    let r = rakam(tel);
    if (r.startsWith("0")) r = "90" + r.slice(1);
    if (r.length === 10 && r.startsWith("5")) r = "90" + r;
    return r.length === 12 && r.startsWith("905") ? r : "";
  }

  const GUN = { Mo: "Pzt", Tu: "Sal", We: "Çar", Th: "Per", Fr: "Cum", Sa: "Cmt", Su: "Paz", PH: "Resmî tatil", off: "kapalı" };

  /** OSM opening_hours → okunur Türkçe (kaba çeviri). */
  function saatTr(s) {
    if (!s) return "";
    if (s.trim() === "24/7") return "7 gün 24 saat açık";
    for (const [a, b] of Object.entries(GUN)) s = s.replace(new RegExp(`\\b${a}\\b`, "g"), b);
    return s.replace(/;\s*/g, " · ");
  }

  /** İki nokta arası metre (haversine). */
  function mesafe(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = Math.PI / 180;
    const dp = (lat2 - lat1) * rad, dl = (lng2 - lng1) * rad;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function mesafeYazi(m) {
    if (m < 1000) return `${Math.round(m / 10) * 10} m`;
    return `${(m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km`;
  }

  /** HTML'e basılan her OSM metni bundan geçer. */
  function h(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /** Sadece http(s) bağlantılarına izin verir; şemasız adrese https ekler. */
  function guvenliUrl(u) {
    let s = (u || "").split(";")[0].trim();
    if (!s) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s.replace(/^\/+/, "");
    try {
      const url = new URL(s);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (e) {
      return "";
    }
  }

  /** Instagram alanından kullanıcı adını çıkarır (@ad, url ya da düz ad). */
  function instagramAdi(s) {
    const t = (s || "").trim().replace(/\/+$/, "").split(/[/?#]/).filter(Boolean);
    const ad = (t.length ? t[t.length - 1] : "").replace(/^@/, "");
    return /^[A-Za-z0-9._]{1,30}$/.test(ad) ? ad : "";
  }

  const sayi = (n) => n.toLocaleString("tr-TR");

  function onceYazi(ms) {
    const dk = Math.round((Date.now() - ms) / 60000);
    if (dk < 1) return "az önce";
    if (dk < 60) return `${dk} dk önce`;
    const sa = Math.round(dk / 60);
    if (sa < 24) return `${sa} saat önce`;
    return `${Math.round(sa / 24)} gün önce`;
  }

  S.tr = { trkKucuk, slug, telDuzen, whatsapp, saatTr, mesafe, mesafeYazi, h, guvenliUrl, instagramAdi, sayi, onceYazi };
})(window.Semtim);
