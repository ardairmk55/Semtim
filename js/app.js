/* Semtim — arayüz: harita, liste, detay paneli, satış hunisi, tema, kısayollar, CSV ve yazdırma. */
(function (S) {
  "use strict";
  const { h, mesafeYazi, sayi } = S.tr;
  const { SEKTOR } = S.sektor;
  const { ASAMALAR, ASAMA, yerelTarih } = S.huni;
  const ikon = S.ikon;
  const $ = (id) => document.getElementById(id);

  const SAYFA = 60;
  const RENK = { site: "#1E88E5", sosyal: "#8E24AA", yok: "#F57C00" };
  const DIJITAL = {
    site: { yazi: "Sitesi var", ikon: "globe" },
    sosyal: { yazi: "Sadece sosyal medya", ikon: "instagram" },
    yok: { yazi: "Dijital izi yok", ikon: "globe" },
  };

  /* ------------------------------------------------------------ depolama (kapalıysa bellekte) */
  function guvenliDepo() {
    try {
      const k = "semtim:deneme";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return localStorage;
    } catch (e) {
      const m = new Map();
      return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    }
  }
  const huni = S.huni.olustur(guvenliDepo());
  const kontrol = S.siteKontrol.olustur(guvenliDepo());
  const siteSkoru = (x) => (x.web ? kontrol.al(x.id)?.skor ?? null : null);

  const D = {
    merkez: null,        // { lat, lng, ad }
    r: 1000,             // metre
    taranan: null,       // son taramanın { lat, lng, r }
    kayitlar: [],
    filtreli: [],
    gosterilen: SAYFA,
    mod: "kesif",        // kesif | firsat | huni
    sektor: "hepsi",
    kontrol: null,
    isaretler: new Map(),
    secili: null,
    detay: null,         // detay panelinde açık kayıt
  };

  /* ------------------------------------------------------------ küçük yardımcılar */
  let bildirimZaman;
  /** Kısa bildirim. geriAl verilirse "Geri al" düğmesi çıkar ve bildirim daha uzun kalır. */
  function bildirim(metin, ikonAdi = "circle-check", { geriAl = null } = {}) {
    const b = $("bildirim");
    b.innerHTML = ikon(ikonAdi) + `<span>${metin}</span>` +
      (geriAl ? `<button type="button" class="bildirim-eylem">${ikon("undo-2", "k")}Geri al</button>` : "");
    b.classList.toggle("eylemli", !!geriAl);
    b.classList.add("gorunur");
    if (geriAl) {
      b.querySelector(".bildirim-eylem").addEventListener("click", () => {
        b.classList.remove("gorunur", "eylemli");
        geriAl();
      }, { once: true });
    }
    clearTimeout(bildirimZaman);
    bildirimZaman = setTimeout(() => b.classList.remove("gorunur", "eylemli"), geriAl ? 6000 : 2800);
  }

  function indir(metin, ad, tur) {
    const url = URL.createObjectURL(new Blob([metin], { type: tur }));
    const a = document.createElement("a");
    a.href = url;
    a.download = ad;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const bugun = () => yerelTarih(new Date());
  const kisaTarih = (t) => new Date(t + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

  /** Huniden gelen anlık görüntü gibi eksik kayıtları tam kayıt biçimine getirir. */
  function tam(x) {
    const m = D.merkez && x.lat != null ? S.tr.mesafe(D.merkez.lat, D.merkez.lng, x.lat, x.lng) : null;
    return {
      web: "", instagram: "", facebook: "", eposta: "", saatler: "", dijital: null, puan: 0, neden: [], zincir: false, marka: "",
      telefon: "", whatsapp: "", adres: "", sektor: "genel",
      ...x,
      mesafe: x.mesafe != null ? x.mesafe : m,
      anlik: !x.dijital,
    };
  }

  /** opening_hours durumunu dakika başına bir kez hesaplar. */
  let saatDakika = -1;
  function saatDurumu(x) {
    const dk = Math.floor(Date.now() / 60000);
    if (dk !== saatDakika) { saatDakika = dk; D.kayitlar.forEach((k) => delete k._saat); }
    if (!x._saat) x._saat = S.saatler.durum(x.saatler);
    return x._saat;
  }

  /* ------------------------------------------------------------ tema */
  const TEMA_SIRA = ["sistem", "acik", "koyu"];
  const TEMA_AD = { sistem: "sistem", acik: "açık", koyu: "koyu" };
  const TEMA_IKON = { sistem: "sun-moon", acik: "sun", koyu: "moon" };
  const sistemKoyu = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  function temaUygula(tercih) {
    const koyu = tercih === "koyu" || (tercih === "sistem" && sistemKoyu && sistemKoyu.matches);
    document.documentElement.dataset.theme = koyu ? "dark" : "light";
    document.documentElement.dataset.temaTercih = tercih;
    const b = $("btnTema");
    b.title = `Tema: ${TEMA_AD[tercih]}`;
    b.innerHTML = ikon(TEMA_IKON[tercih]);
  }
  function temaDegistir() {
    const simdiki = document.documentElement.dataset.temaTercih || "sistem";
    const sonraki = TEMA_SIRA[(TEMA_SIRA.indexOf(simdiki) + 1) % TEMA_SIRA.length];
    try { localStorage.setItem("semtim:tema", sonraki); } catch (e) { /* yoksay */ }
    temaUygula(sonraki);
    bildirim(`Tema: ${TEMA_AD[sonraki]}`, TEMA_IKON[sonraki]);
  }
  sistemKoyu?.addEventListener?.("change", () => {
    if ((document.documentElement.dataset.temaTercih || "sistem") === "sistem") temaUygula("sistem");
  });

  /* ------------------------------------------------------------ harita */
  const harita = L.map("harita", { zoomControl: false }).setView([39.0, 35.2], 6);
  L.control.zoom({ position: "topright", zoomInTitle: "Yakınlaştır", zoomOutTitle: "Uzaklaştır" }).addTo(harita);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap katkıcıları</a>',
  }).addTo(harita);
  harita.attributionControl.setPrefix(false);

  const kume = L.markerClusterGroup({
    chunkedLoading: true,
    showCoverageOnHover: false,
    maxClusterRadius: 48,
    disableClusteringAtZoom: 18,
    iconCreateFunction: (c) => {
      const n = c.getChildCount();
      const sinif = n >= 200 ? "buyuk" : n >= 50 ? "orta" : "";
      const boy = n >= 200 ? 54 : n >= 50 ? 46 : 40;
      return L.divIcon({ html: `<div class="kume ${sinif}">${sayi(n)}</div>`, className: "marker-cluster", iconSize: [boy, boy] });
    },
  });
  harita.addLayer(kume);
  let merkezIsaret = null, daire = null;

  harita.on("click", (e) => merkezSec(e.latlng.lat, e.latlng.lng, "Haritada seçilen nokta", false));

  function merkezSec(lat, lng, ad, otomatikTara) {
    D.merkez = { lat, lng, ad };
    const ll = [lat, lng];
    if (!merkezIsaret) {
      merkezIsaret = L.marker(ll, {
        icon: L.divIcon({ className: "", html: '<div class="merkez-isaret"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
        zIndexOffset: 1000, interactive: false, keyboard: false,
      }).addTo(harita);
      daire = L.circle(ll, { radius: D.r, color: "#1E88E5", weight: 1.5, dashArray: "5 6", fillColor: "#18B4F0", fillOpacity: 0.05, interactive: false }).addTo(harita);
    } else {
      merkezIsaret.setLatLng(ll);
      daire.setLatLng(ll);
    }
    daire.setRadius(D.r);
    harita.fitBounds(daire.getBounds(), haritaDolgusu());
    const mb = $("merkezBilgi");
    mb.classList.add("secildi");
    mb.innerHTML = ikon("map-pin") + `<span title="${h(ad)}">${h(ad)}</span>`;
    $("haritaIpucu").classList.add("gizli");
    // Yeni bir nokta seçildiyse arama alanını aç: yarıçap ve "Tara" görünsün.
    if (D.taranan && !ayniMerkez()) aramaKatla(false);
    hashYaz();
    taraButonu();
    if (otomatikTara) tara();
  }

  /* ------------------------------------------------------------ yerleşim: katlanan arama, panel genişliği, mobil alt sayfa */
  const mobilSorgu = matchMedia("(max-width: 820px)");
  const mobil = () => mobilSorgu.matches;
  const panel = $("panel");

  /** Tarama sonrası arama bloğunu tek satıra katlar; listeye yer açar. */
  function aramaKatla(kompakt) {
    const katli = !!(kompakt && D.taranan);
    $("aramaBlok").classList.toggle("kompakt", katli);
    $("btnAramaAc").setAttribute("aria-expanded", String(!katli));
    $("btnAramaKatla").classList.toggle("gizli", !D.taranan || katli);
    if (mobil()) requestAnimationFrame(() => sheetAyarla());
  }

  function kompaktGuncelle(zaman) {
    $("kompaktAd").textContent = D.merkez?.ad || "Seçilen nokta";
    $("kompaktAlt").textContent = `${(D.r / 1000).toLocaleString("tr-TR")} km · ${sayi(D.kayitlar.length)} işletme` +
      (zaman ? ` · ${S.tr.onceYazi(zaman)}` : "");
  }

  /** Mobilde alt sayfanın ya da açık detayın kapladığı yükseklik (harita odağı için). */
  function ortuYuksekligi() {
    if (!mobil()) return 0;
    const d = $("detay");
    return Math.max(panel.getBoundingClientRect().height, d.classList.contains("acik") ? d.getBoundingClientRect().height : 0);
  }
  function haritaDolgusu() {
    return mobil()
      ? { paddingTopLeft: [16, 16], paddingBottomRight: [16, ortuYuksekligi() + 16] }
      : { paddingTopLeft: [28, 28], paddingBottomRight: [28, 28] };
  }
  /** Noktayı haritanın görünen kısmının ortasına getirir (mobilde alt sayfanın üstü). */
  function haritayaOdaklan(ll) {
    const ofset = ortuYuksekligi() / 2;
    if (!ofset) return harita.panTo(ll, { animate: true });
    harita.panTo(harita.unproject(harita.project(ll).add([0, ofset])), { animate: true });
  }

  // Masaüstü: panel genişliği sürüklenerek ayarlanır, tercih saklanır.
  const PANEL_ANAHTAR = "semtim:panel-genislik";
  function panelGenislik(px, kaydet) {
    const en = Math.round(Math.min(Math.max(px, 340), Math.min(780, window.innerWidth * 0.62)));
    document.documentElement.style.setProperty("--panel-w", en + "px");
    if (kaydet) try { localStorage.setItem(PANEL_ANAHTAR, String(en)); } catch (e) { /* yoksay */ }
    harita.invalidateSize({ pan: false });
  }
  try {
    const kayitli = +localStorage.getItem(PANEL_ANAHTAR);
    if (kayitli) panelGenislik(kayitli, false);
  } catch (e) { /* yoksay */ }
  (function () {
    const tut = $("panelBoyut");
    let aktif = false;
    tut.addEventListener("pointerdown", (e) => {
      if (mobil() || e.button !== 0) return;
      aktif = true;
      try { tut.setPointerCapture(e.pointerId); } catch (err) { /* sentetik olay */ }
      tut.classList.add("aktif");
      document.documentElement.classList.add("boyutlaniyor");
    });
    tut.addEventListener("pointermove", (e) => {
      if (aktif) panelGenislik(e.clientX - panel.getBoundingClientRect().left, false);
    });
    const bitir = () => {
      if (!aktif) return;
      aktif = false;
      tut.classList.remove("aktif");
      document.documentElement.classList.remove("boyutlaniyor");
      panelGenislik(panel.getBoundingClientRect().width, true);
    };
    tut.addEventListener("pointerup", bitir);
    tut.addEventListener("pointercancel", bitir);
    tut.addEventListener("dblclick", () => {
      document.documentElement.style.removeProperty("--panel-w");
      try { localStorage.removeItem(PANEL_ANAHTAR); } catch (e) { /* yoksay */ }
      harita.invalidateSize({ pan: false });
    });
    tut.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      panelGenislik(panel.getBoundingClientRect().width + (e.key === "ArrowRight" ? 32 : -32), true);
    });
  })();

  // Mobil: panel haritanın üstünde, tutamaktan sürüklenen alt sayfa (küçük / orta / büyük).
  let sheetDurum = "orta";
  function sheetYukseklikleri() {
    const H = panel.parentElement.clientHeight;
    const kucuk = Math.min(Math.round(H * 0.42), 26 + $("aramaBlok").offsetHeight + 4);
    return { kucuk, orta: Math.max(kucuk + 60, Math.round(H * 0.5)), buyuk: H - 10 };
  }
  function sheetAyarla(durum, yukseklik) {
    if (!mobil()) {
      panel.style.removeProperty("--sheet-h");
      document.querySelector(".harita-alan").style.removeProperty("--sheet-px");
      return;
    }
    if (durum) sheetDurum = durum;
    const px = Math.round(yukseklik ?? sheetYukseklikleri()[sheetDurum]);
    panel.style.setProperty("--sheet-h", px + "px");
    document.querySelector(".harita-alan").style.setProperty("--sheet-px", px + "px");
    $("sheetTutamak").setAttribute("aria-label", sheetDurum === "buyuk" ? "Paneli küçült" : "Paneli büyüt");
  }
  (function () {
    const tut = $("sheetTutamak");
    let s = null;
    tut.addEventListener("pointerdown", (e) => {
      if (!mobil()) return;
      s = { y0: e.clientY, h0: panel.getBoundingClientRect().height, t0: performance.now(), hareket: false };
      try { tut.setPointerCapture(e.pointerId); } catch (err) { /* sentetik olay */ }
      panel.classList.add("suruklenen");
    });
    tut.addEventListener("pointermove", (e) => {
      if (!s) return;
      const dy = e.clientY - s.y0;
      if (Math.abs(dy) > 4) s.hareket = true;
      const y = sheetYukseklikleri();
      sheetAyarla(null, Math.max(y.kucuk - 40, Math.min(y.buyuk, s.h0 - dy)));
    });
    const birak = () => {
      if (!s) return;
      const { h0, t0, hareket } = s;
      s = null;
      panel.classList.remove("suruklenen");
      if (!hareket) { sheetAyarla(sheetDurum === "buyuk" ? "orta" : "buyuk"); return; } // dokunuş: büyüt/küçült
      const y = sheetYukseklikleri();
      const h = panel.getBoundingClientRect().height;
      const hiz = (h - h0) / Math.max(1, performance.now() - t0); // px/ms; + büyüyor
      let hedef;
      if (Math.abs(hiz) > 0.5) hedef = hiz > 0 ? (h > y.orta ? "buyuk" : "orta") : (h < y.orta ? "kucuk" : "orta");
      else hedef = ["kucuk", "orta", "buyuk"].reduce((a, b) => (Math.abs(y[b] - h) < Math.abs(y[a] - h) ? b : a));
      sheetAyarla(hedef);
    };
    tut.addEventListener("pointerup", birak);
    tut.addEventListener("pointercancel", birak);
    tut.addEventListener("click", (e) => { if (e.detail === 0) sheetAyarla(sheetDurum === "buyuk" ? "orta" : "buyuk"); }); // klavye
  })();
  mobilSorgu.addEventListener("change", () => { sheetAyarla(sheetDurum); setTimeout(() => harita.invalidateSize(), 50); });
  window.addEventListener("resize", () => sheetAyarla(sheetDurum));

  function ayniMerkez() {
    return D.taranan && D.merkez && Math.abs(D.taranan.lat - D.merkez.lat) < 1e-6 && Math.abs(D.taranan.lng - D.merkez.lng) < 1e-6;
  }

  function taraButonu() {
    const b = $("btnTara");
    const yenile = !!D.taranan && ayniMerkez() && D.r <= D.taranan.r;
    b.disabled = !D.merkez || !!D.kontrol;
    b.innerHTML = D.kontrol
      ? ikon("loader-circle", "donen") + "<span>Taranıyor…</span>"
      : yenile ? ikon("rotate-cw") + "<span>Yeniden tara</span>" : ikon("radar") + "<span>Bu çevreyi tara</span>";
    b.dataset.yenile = yenile ? "1" : "";
    b.title = yenile ? "Önbelleği atlayıp güncel veriyi çek (T)" : "Seçili çevreyi tara (T)";
  }

  /* ------------------------------------------------------------ durum */
  const DURUM_IKON = { bilgi: "info", yukleniyor: "loader-circle", hata: "circle-alert", uyari: "triangle-alert", tamam: "circle-check" };
  function durum(tur, metin) {
    const d = $("durum");
    if (!metin) { d.classList.add("gizli"); return; }
    d.className = "durum " + (tur === "yukleniyor" ? "bilgi" : tur);
    d.innerHTML = ikon(DURUM_IKON[tur] || "info", tur === "yukleniyor" ? "donen" : "") + `<div>${metin}</div>`;
  }

  function ilerleme(oran) {
    $("ilerlemeKap").classList.toggle("gizli", oran == null);
    if (oran != null) {
      const yuzde = Math.round(oran * 100);
      $("ilerleme").style.width = yuzde + "%";
      $("ilerlemeKap").setAttribute("aria-valuenow", String(yuzde));
    }
  }

  /* ------------------------------------------------------------ tarama */
  async function tara(yenile = false) {
    if (!D.merkez) return;
    D.kontrol?.abort();
    const k = new AbortController();
    D.kontrol = k;
    taraButonu();
    $("btnIptal").classList.remove("gizli");
    const { lat, lng } = D.merkez;
    const r = D.r;
    ilerleme(0.04);
    if (!D.kayitlar.length) {
      $("bosDurum").classList.add("gizli");
      $("liste").innerHTML = `<li class="iskelet" aria-hidden="true">${"<div></div>".repeat(6)}</li>`;
    }

    // Canlı durum: bölge, geçen süre ve şu an denenen sunucu. Sunucular yoğunken kullanıcı neyin beklendiğini görür.
    const t0 = Date.now();
    const canli = { bolge: "", sunucu: "", not: "" };
    const yaz = () => {
      if (D.kontrol !== k) return;
      const sn = Math.round((Date.now() - t0) / 1000);
      durum("yukleniyor",
        `${(r / 1000).toLocaleString("tr-TR")} km çevre taranıyor${canli.bolge} · <b class="num">${sn} sn</b>` +
        (canli.sunucu || canli.not ? `<small>${canli.not || `Sunucu: ${h(canli.sunucu)}`}</small>` : ""));
    };
    yaz();
    const saat = setInterval(yaz, 1000);

    try {
      const s = await S.veri.tara(lat, lng, r, {
        sinyal: k.signal,
        yenile,
        ilerleme: (i, n) => {
          ilerleme(Math.max(0.04, i / n));
          canli.bolge = n > 1 && i < n ? ` (bölge ${i + 1}/${n})` : "";
          yaz();
        },
        bilgi: (b) => {
          if (b.bekliyor) canli.not = "Sunucular çok yoğun, birkaç saniye içinde yeniden deneniyor…";
          else {
            canli.sunucu = b.sunucu;
            canli.not = b.deneme > 1 ? `Sunucular yoğun; ${b.deneme}/${b.toplam} sunucu aynı anda deneniyor (${h(b.sunucu)})` : "";
          }
          yaz();
        },
      });
      D.kayitlar = s.kayitlar.map((x) => ({ ...x, mesafe: S.tr.mesafe(lat, lng, x.lat, x.lng) }));
      D.taranan = { lat, lng, r };
      D.sektor = "hepsi";
      const ek = s.eskimis
        ? `<small>Sunuculara ulaşılamadı; ${S.tr.onceYazi(s.zaman)} kaydedilen sonuçlar gösteriliyor.</small>`
        : s.onbellekten ? `<small>Önbellekten, ${S.tr.onceYazi(s.zaman)}. Güncel veri için “Yeniden tara”.</small>` : "";
      durum(s.eskimis ? "uyari" : "tamam", `<b class="num">${sayi(D.kayitlar.length)}</b> işletme bulundu.${ek}`);
      $("filtreler").classList.remove("gizli");
      $("bosDurum").classList.add("gizli");
      kompaktGuncelle(s.zaman);
      aramaKatla(true);
      if (mobil() && sheetDurum === "kucuk") sheetAyarla("orta");
      if (D.mod === "huni") modSec("kesif");
      else filtrele();
    } catch (e) {
      if (!D.kayitlar.length) { $("liste").innerHTML = ""; $("bosDurum").classList.remove("gizli"); }
      if (e.name === "AbortError") durum("uyari", "Tarama iptal edildi.");
      else durum("hata", h(e.message));
    } finally {
      clearInterval(saat);
      if (D.kontrol === k) {
        D.kontrol = null;
        ilerleme(null);
        $("btnIptal").classList.add("gizli");
        taraButonu();
      }
    }
  }

  /* ------------------------------------------------------------ filtreleme */
  function filtreDegerleri() {
    return {
      sitesiz: $("fSitesiz").checked,
      telefonlu: $("fTelefonlu").checked,
      acik: $("fAcik").checked,
      zincirGizle: $("fZincir").checked,
      zayif: $("fZayif").checked,
      metin: S.tr.trkKucuk($("fMetin").value.trim()),
      sirala: $("fSirala").value,
    };
  }

  function temelListe() {
    const f = filtreDegerleri();
    return D.kayitlar.filter((x) => {
      if (x.mesafe > D.r) return false; // yarıçap küçültüldüyse yeniden taramadan süz
      if (D.mod === "firsat" && x.puan <= 0) return false;
      if (f.sitesiz && x.web) return false;
      if (f.telefonlu && !x.telefon) return false;
      if (f.zincirGizle && x.zincir) return false;
      if (f.zayif) { const sk = siteSkoru(x); if (sk == null || sk >= 60) return false; }
      if (f.acik && saatDurumu(x).durum !== "acik") return false;
      if (f.metin) {
        const metin = S.tr.trkKucuk(`${x.ad} ${x.adres} ${SEKTOR[x.sektor].ad} ${x.marka}`);
        if (!metin.includes(f.metin)) return false;
      }
      return true;
    });
  }

  function filtrele() {
    const f = filtreDegerleri();
    const temel = temelListe();
    cipleriCiz(temel);
    const secilen = D.sektor === "hepsi" ? temel : temel.filter((x) => x.sektor === D.sektor);
    const sira = {
      mesafe: (a, b) => a.mesafe - b.mesafe,
      puan: (a, b) => b.puan - a.puan || a.mesafe - b.mesafe,
      ad: (a, b) => a.ad.localeCompare(b.ad, "tr"),
      // Kontrol edilmiş ve skoru düşük siteler önce; kontrolsüzler sonda.
      site: (a, b) => (siteSkoru(a) ?? 999) - (siteSkoru(b) ?? 999) || a.mesafe - b.mesafe,
    }[f.sirala];
    D.filtreli = secilen.slice().sort(sira);
    D.gosterilen = SAYFA;
    ozetCiz();
    listeCiz();
    isaretleriCiz();
  }

  function ozetCiz() {
    const ic = D.kayitlar.filter((x) => x.mesafe <= D.r);
    const sitesiz = ic.filter((x) => !x.web).length;
    const firsat = ic.filter((x) => x.puan > 0).length;
    $("ozet").innerHTML =
      `<span><b>${sayi(D.filtreli.length)}</b> gösteriliyor</span>` +
      `<span><b>${sayi(ic.length)}</b> işletme</span>` +
      `<span class="firsat"><b>${sayi(sitesiz)}</b> kayıtlı sitesi yok</span>` +
      `<span><b>${sayi(firsat)}</b> fırsat</span>`;
    const fs = $("firsatSayi");
    fs.textContent = sayi(firsat);
    fs.classList.toggle("gizli", !firsat);
  }

  function cipleriCiz(temel) {
    const say = {};
    for (const x of temel) say[x.sektor] = (say[x.sektor] || 0) + 1;
    if (D.sektor !== "hepsi" && !say[D.sektor]) D.sektor = "hepsi";
    const sirali = Object.entries(say).sort((a, b) => b[1] - a[1]);
    $("cipler").innerHTML =
      `<button class="cip" data-sektor="hepsi" aria-pressed="${D.sektor === "hepsi"}">${ikon("layers")}Tümü <small>${sayi(temel.length)}</small></button>` +
      sirali.map(([k, n]) => {
        const s = SEKTOR[k];
        return `<button class="cip" data-sektor="${k}" aria-pressed="${D.sektor === k}" style="--c:${s.renk}">${ikon(s.ikon)}${h(s.ad)} <small>${sayi(n)}</small></button>`;
      }).join("");
  }

  /* ------------------------------------------------------------ liste */
  function rozetler(x) {
    const r = [];
    const dj = DIJITAL[x.dijital];
    const sk = siteSkoru(x);
    if (sk != null) r.push(`<span class="rozet skor-${S.siteKontrol.seviye(sk).id}" title="Site sağlık skoru">${ikon("globe")}Site ${sk}/100</span>`);
    else if (dj) r.push(`<span class="rozet ${x.dijital}">${ikon(dj.ikon)}${dj.yazi}</span>`);
    const sd = saatDurumu(x);
    if (sd.durum === "acik") r.push(`<span class="rozet acik" title="${h(sd.metin)}">${ikon("clock")}Açık</span>`);
    else if (sd.durum === "kapali") r.push(`<span class="rozet" title="${h(sd.metin)}">${ikon("clock")}Kapalı</span>`);
    if (x.telefon) r.push(`<span class="rozet">${ikon("phone")}Telefon</span>`);
    if (x.zincir) r.push(`<span class="rozet">${ikon("layers")}Zincir</span>`);
    const k = huni.al(x.id);
    if (k) {
      const a = ASAMA[k.asama];
      r.push(`<span class="rozet hunide" style="--c:${a.renk}">${ikon(a.ikon)}${a.ad}</span>`);
    }
    return r.join("");
  }

  function kartHtml(x) {
    const s = SEKTOR[x.sektor];
    const puanGoster = (D.mod === "firsat" || $("fSirala").value === "puan") && x.puan > 0;
    const sag = puanGoster
      ? `<span class="puan ${x.puan >= 75 ? "yuksek" : ""}" title="Fırsat puanı">${x.puan}</span>`
      : `<span class="kart-ok">${ikon("chevron-right")}</span>`;
    return `<li class="kart" role="option" tabindex="0" data-id="${h(x.id)}" aria-selected="${D.secili === x.id}">
      <span class="sektor-kutu" style="--c:${s.renk}">${ikon(s.ikon)}</span>
      <div style="min-width:0">
        <p class="kart-ad">${h(x.ad)}</p>
        <p class="kart-meta">${h(s.ad)} · <span class="num">${mesafeYazi(x.mesafe)}</span>${x.adres ? " · " + h(x.adres) : ""}</p>
        <div class="rozetler">${rozetler(x)}</div>
      </div>${sag}</li>`;
  }

  function listeCiz() {
    const bolum = D.filtreli.slice(0, D.gosterilen);
    $("liste").innerHTML = bolum.length
      ? bolum.map(kartHtml).join("")
      : `<li class="bos"><div class="bos-ikon">${ikon("list-filter")}</div><h2>Eşleşen işletme yok</h2><p>Filtreleri gevşet ya da yarıçapı büyüt.</p></li>`;
    const kalan = D.filtreli.length - D.gosterilen;
    $("btnDahaFazla").classList.toggle("gizli", kalan <= 0);
    $("btnDahaFazla").textContent = `Daha fazla göster (${sayi(Math.max(0, kalan))} kaldı)`;
  }

  function kartGuncelle(id) {
    const x = D.kayitlar.find((k) => k.id === id);
    const kart = document.querySelector(`.kart[data-id="${CSS.escape(id)}"]`);
    if (x && kart) kart.outerHTML = kartHtml(x);
    if (x && D.isaretler.get(id)) D.isaretler.get(id).setIcon(isaretIkonu(x, D.secili === id));
  }

  /* ------------------------------------------------------------ işaretler */
  function isaretIkonu(x, secili) {
    const s = SEKTOR[x.sektor];
    const k = huni.al(x.id);
    return L.divIcon({
      className: "",
      html: `<div class="isaret ${secili ? "secili" : ""} ${k ? "hunide" : ""}" style="--c:${RENK[x.dijital]};--h:${k ? ASAMA[k.asama].renk : "transparent"}">${ikon(s.ikon)}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 42],
    });
  }

  function isaretleriCiz() {
    kume.clearLayers();
    D.isaretler.clear();
    const katmanlar = D.filtreli.map((x) => {
      const m = L.marker([x.lat, x.lng], { icon: isaretIkonu(x, x.id === D.secili), title: x.ad, riseOnHover: true });
      m.on("click", () => sec(x.id, { haritayaGit: mobil() }));
      D.isaretler.set(x.id, m);
      return m;
    });
    kume.addLayers(katmanlar);
  }

  /* ------------------------------------------------------------ seçim ve detay paneli */
  function sec(id, { haritayaGit = true, kayit = null } = {}) {
    const once = D.secili;
    D.secili = id;
    const x = kayit || D.kayitlar.find((k) => k.id === id);
    if (!x) return;
    const eski = D.kayitlar.find((k) => k.id === once);
    if (eski && D.isaretler.get(once)) D.isaretler.get(once).setIcon(isaretIkonu(eski, false));
    const tarali = D.kayitlar.find((k) => k.id === id);
    if (tarali && D.isaretler.get(id)) D.isaretler.get(id).setIcon(isaretIkonu(tarali, true));

    document.querySelectorAll('.kart[aria-selected="true"]').forEach((el) => el.setAttribute("aria-selected", "false"));
    const kart = document.querySelector(`.kart[data-id="${CSS.escape(id)}"]`);
    if (kart) kart.setAttribute("aria-selected", "true");

    if (haritayaGit) {
      const m = D.isaretler.get(id);
      detayAc(x);
      if (m) kume.zoomToShowLayer(m, () => haritayaOdaklan(m.getLatLng()));
      else if (x.lat != null) { harita.setView([x.lat, x.lng], Math.max(harita.getZoom(), 17), { animate: false }); haritayaOdaklan([x.lat, x.lng]); }
      return;
    }
    detayAc(x);
  }

  function detayAc(x) {
    D.detay = tam(x);
    detayCiz();
    $("detayIc").scrollTop = 0;
    const d = $("detay");
    d.classList.add("acik");
    d.setAttribute("aria-hidden", "false");
    const i = D.filtreli.findIndex((k) => k.id === x.id);
    $("detayYol").textContent = i >= 0 ? `${sayi(i + 1)} / ${sayi(D.filtreli.length)}` : "Huni kaydı";
    $("btnDetayOnceki").disabled = i <= 0;
    $("btnDetaySonraki").disabled = i < 0 || i >= D.filtreli.length - 1;
  }

  function detayKapat() {
    const d = $("detay");
    if (!d.classList.contains("acik")) return false;
    d.classList.remove("acik");
    d.setAttribute("aria-hidden", "true");
    D.detay = null;
    const kart = D.secili && document.querySelector(`.kart[data-id="${CSS.escape(D.secili)}"]`);
    if (kart) { kart.scrollIntoView({ block: "nearest" }); kart.focus({ preventScroll: true }); }
    return true;
  }

  function komsuyaGit(yon) {
    if (!D.filtreli.length) return;
    const i = D.filtreli.findIndex((k) => k.id === D.secili);
    const j = i < 0 ? 0 : Math.min(D.filtreli.length - 1, Math.max(0, i + yon));
    if (j >= D.gosterilen) { D.gosterilen = j + SAYFA; listeCiz(); }
    sec(D.filtreli[j].id);
    document.querySelector(`.kart[data-id="${CSS.escape(D.filtreli[j].id)}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function detayCiz() {
    const x = D.detay;
    if (!x) return;
    const s = SEKTOR[x.sektor] || SEKTOR.genel;
    const tel = (x.telefon || "").replace(/[^\d+]/g, "");
    const [tur, no] = x.id.split("/");
    const sd = S.saatler.durum(x.saatler);
    const hafta = S.saatler.haftalik(x.saatler);
    const bugunIndeks = (new Date().getDay() + 6) % 7;
    const k = huni.al(x.id);

    const satir = (ik, etiket, deger) => `<div class="bilgi">${ikon(ik)}<div><dt>${etiket}</dt><dd>${deger}</dd></div></div>`;
    const bilgiler = [];
    if (x.adres) bilgiler.push(satir("map-pin", "Adres", h(x.adres)));
    if (x.telefon) bilgiler.push(satir("phone", "Telefon", `<a href="tel:${h(tel)}">${h(x.telefon)}</a>`));
    if (!x.anlik) {
      bilgiler.push(satir("globe", "Web sitesi", x.web
        ? `<a href="${h(x.web)}" target="_blank" rel="noopener nofollow">${h(x.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`
        : `<span class="yok-yazi">Kayıtlı web sitesi yok</span>`) + siteSaglikHtml(x));
    }
    if (x.instagram) bilgiler.push(satir("instagram", "Instagram", `<a href="https://instagram.com/${h(x.instagram)}" target="_blank" rel="noopener nofollow">@${h(x.instagram)}</a>`));
    if (x.facebook) bilgiler.push(satir("facebook", "Facebook", `<a href="${h(x.facebook)}" target="_blank" rel="noopener nofollow">Sayfayı aç</a>`));
    if (x.eposta) bilgiler.push(satir("mail", "E-posta", `<a href="mailto:${h(x.eposta)}">${h(x.eposta)}</a>`));
    if (x.saatler) {
      bilgiler.push(satir("clock", "Çalışma saatleri", hafta
        ? `<div class="haftalik">${hafta.map((g, i) => `<span class="${i === bugunIndeks ? "bugun" : ""}">${g.gun}</span><span class="${i === bugunIndeks ? "bugun" : ""}">${g.metin}</span>`).join("")}</div>`
        : h(S.tr.saatTr(x.saatler))));
    }

    const firsat = x.puan > 0
      ? `<div class="firsat-kutu"><span class="puan ${x.puan >= 75 ? "yuksek" : ""}">${x.puan}</span><b>Fırsat puanı</b><p>${h(x.neden.join(" · "))}</p></div>
         <p class="uyari-not">${ikon("info")}<span>Puan, OSM'deki kayda dayanır. İşletmenin sitesi olup haritaya girilmemiş olabilir.</span></p>`
      : "";

    const eylem = (href, ik, yazi, sinif = "", hedef = false, aktif = true) =>
      `<a class="eylem ${sinif}" ${aktif ? `href="${h(href)}"` : 'aria-disabled="true"'} ${hedef ? 'target="_blank" rel="noopener"' : ""}>${ikon(ik)}${yazi}</a>`;

    const asamalar = ASAMALAR.map((a) =>
      `<button type="button" class="asama" data-asama="${a.id}" aria-pressed="${k?.asama === a.id}" style="--c:${a.renk}">${ikon(a.ikon)}${a.ad}</button>`).join("");

    $("detayIc").innerHTML = `
      <div class="detay-bas">
        <span class="sektor-kutu" style="--c:${s.renk}">${ikon(s.ikon)}</span>
        <div style="min-width:0">
          <h2>${h(x.ad)}</h2>
          <p class="detay-alt">${h(s.ad)}${x.zincir ? ` · zincir${x.marka ? ": " + h(x.marka) : ""}` : ""}${x.mesafe != null ? ` · <span class="num">${mesafeYazi(x.mesafe)}</span> uzaklıkta` : ""}</p>
        </div>
      </div>
      ${x.anlik ? "" : `<p class="saat-durum ${sd.durum}">${h(sd.metin)}</p>`}
      <div class="eylemler">
        ${eylem("tel:" + tel, "phone", "Ara", "ana", false, !!x.telefon)}
        ${eylem("https://wa.me/" + x.whatsapp, "message-circle", "WhatsApp", "wa", true, !!x.whatsapp)}
        ${eylem(`https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}`, "navigation", "Yol tarifi", "", true, x.lat != null)}
        ${eylem(`https://www.openstreetmap.org/edit?${tur}=${no}`, "square-pen", "OSM'de düzelt", "", true)}
      </div>
      ${firsat}
      ${x.anlik ? `<p class="uyari-not">${ikon("history")}<span>Bu kayıt huniden açıldı. Güncel bilgiler için bu bölgeyi tara.</span></p>` : ""}
      <dl class="bilgiler">${bilgiler.join("")}</dl>
      <div class="takip">
        <div class="takip-bas">${ikon("notebook-pen")}<h3>Satış takibi</h3></div>
        <div class="asamalar" role="group" aria-label="Huni aşaması">${asamalar}</div>
        <div class="takip-alanlar">
          <label>Takip tarihi<input type="date" id="takipTarih" value="${h(k?.takip || "")}"></label>
          <label>Not<textarea id="takipNot" maxlength="2000" placeholder="Kiminle konuşuldu, ne teklif edildi, ne zaman tekrar aranacak">${h(k?.not || "")}</textarea></label>
        </div>
        <div class="takip-alt">
          <span>${k ? `Huniye ${S.tr.onceYazi(k.olusturma)} eklendi` : "Aşama seçince huniye eklenir"}</span>
          <span class="kaydedildi" id="kaydedildi">${ikon("check")}Kaydedildi</span>
          ${k ? `<button type="button" class="dg hayalet kucuk tehlike" id="btnHuniSil">${ikon("trash-2", "k")}Çıkar</button>` : ""}
        </div>
      </div>
      <div class="detay-dip">
        <a href="https://www.openstreetmap.org/${h(x.id)}" target="_blank" rel="noopener">${ikon("external-link", "k")} OSM kaydı</a>
        <span class="num">${x.lat != null ? `${x.lat.toFixed(5)}, ${x.lng.toFixed(5)}` : ""}</span>
      </div>`;
  }

  /** Detay panelinde, yüklenmiş site sağlık kontrolü sonucu. */
  function siteSaglikHtml(x) {
    const k = x.web && kontrol.al(x.id);
    if (!k) return "";
    const sv = S.siteKontrol.seviye(k.skor);
    const rozet = (deger, ik, evet, hayir) => deger == null ? "" :
      `<span class="rozet ${deger ? "skor-iyi" : "skor-zayif"}">${ikon(deger ? "check" : ik)}${deger ? evet : hayir}</span>`;
    return `<div class="site-saglik">
      <div class="site-saglik-ust">
        <span class="site-skor ${sv.id}">${k.skor}</span>
        <span><b>Site sağlığı: ${sv.ad}</b><small>${h(k.durum)} · ${S.tr.onceYazi(k.tarih)} kontrol edildi</small></span>
      </div>
      <div class="site-ozellik">
        ${rozet(k.https, "x", "HTTPS", "HTTPS yok")}
        ${rozet(k.ssl, "x", "SSL geçerli", "SSL geçersiz")}
        ${rozet(k.mobil, "x", "Mobil uyumlu", "Mobil uyumlu değil")}
        ${k.ms != null ? `<span class="rozet ${k.ms < 3000 ? "skor-iyi" : "skor-orta"}">${ikon("clock")}${(k.ms / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn</span>` : ""}
      </div>
      ${k.skor < 60 ? `<p>Yenileme teklifi için iyi bir aday.</p>` : ""}
    </div>`;
  }

  let kaydedildiZaman;
  function kaydedildiGoster() {
    const el = $("kaydedildi");
    if (!el) return;
    el.classList.add("gorunur");
    clearTimeout(kaydedildiZaman);
    kaydedildiZaman = setTimeout(() => el.classList.remove("gorunur"), 1600);
  }

  /** Huni değişince liste kartı, işaret, sayaçlar ve (açıksa) pano güncellenir. */
  function huniDegisti(id) {
    if (id) kartGuncelle(id);
    huniSayaci();
    if (D.mod === "huni") huniCiz();
  }

  function huniSayaci() {
    const n = huni.sayi();
    const gec = huni.gecikenler(bugun()).length;
    const b = $("huniSayi");
    b.textContent = sayi(gec || n);
    b.classList.toggle("gizli", !n);
    b.classList.toggle("uyari", gec > 0);
    b.title = gec ? `${gec} takip gecikti` : `${n} kayıt`;
  }

  function huniyeEkle(x, degisiklik = {}) {
    const yeniMi = !huni.al(x.id);
    huni.guncelle(x, degisiklik);
    huniDegisti(x.id);
    return yeniMi;
  }

  /* ------------------------------------------------------------ huni panosu */
  function huniCiz() {
    const g = huni.gruplar();
    const n = huni.sayi();
    const gun = bugun();
    const gec = huni.gecikenler(gun).length;
    $("huniOzet").innerHTML = n
      ? `<span class="num">${sayi(n)}</span> kayıt · <span class="num">${sayi(g.musteri.length)}</span> müşteri${gec ? ` · <b style="color:var(--danger)">${sayi(gec)} takip gecikti</b>` : ""}` +
        `<span class="huni-ipucu"><span class="fare">Kartı sürükle ya da seçip <kbd>←</kbd> <kbd>→</kbd> ile taşı</span><span class="dokunma">Kartı basılı tut ve sürükle</span></span>`
      : "Adaylarını aşama aşama takip et.";
    if (!n) {
      $("kolonlar").innerHTML = `<div class="huni-bos" style="grid-column:1/-1">
        <div class="bos-ikon">${ikon("kanban")}</div>
        <h3>Huni henüz boş</h3>
        <p>Bir işletmenin ayrıntısında aşama seç ya da seçiliyken <kbd>H</kbd>'ye bas. Kayıtlar yalnızca bu tarayıcıda durur.</p>
        <button class="dg ana" data-mod-git="firsat">${ikon("target")}Fırsatlara git</button></div>`;
      return;
    }
    $("kolonlar").innerHTML = ASAMALAR.map((a) => `
      <section class="kolon" data-asama="${a.id}" style="--c:${a.renk}" aria-label="${a.ad}">
        <div class="kolon-bas">${ikon(a.ikon)}${a.ad}<span class="rozet-sayi">${sayi(g[a.id].length)}</span></div>
        <div class="kolon-ic">${g[a.id].length ? g[a.id].map((k) => huniKartHtml(k, gun)).join("") : `<div class="kolon-bos">Buraya sürükle</div>`}</div>
      </section>`).join("");
  }

  function huniKartHtml(k, gun) {
    const s = SEKTOR[k.sektor] || SEKTOR.genel;
    let tarih = `${ikon("calendar-clock")}Takip yok`, sinif = "";
    if (k.takip) {
      if (k.takip < gun && k.asama !== "musteri" && k.asama !== "kayip") { tarih = `${ikon("calendar-clock")}${kisaTarih(k.takip)} · gecikti`; sinif = "gecikti"; }
      else if (k.takip === gun) { tarih = `${ikon("calendar-clock")}Bugün`; sinif = "bugun"; }
      else tarih = `${ikon("calendar-clock")}${kisaTarih(k.takip)}`;
    }
    const tel = (k.telefon || "").replace(/[^\d+]/g, "");
    return `<article class="hkart" data-id="${h(k.id)}" style="--c:${s.renk}" tabindex="0" aria-label="${h(k.ad)}: ${ASAMA[k.asama].ad}. Enter ayrıntı, sol ve sağ ok aşama değiştirir">
      <div class="hkart-ad">${ikon(s.ikon)}<span>${h(k.ad)}</span><span class="tutamak" aria-hidden="true">${ikon("grip-vertical")}</span></div>
      ${k.not ? `<p class="hkart-not">${h(k.not)}</p>` : ""}
      <div class="hkart-alt">
        <span class="tarih ${sinif}">${tarih}</span>
        ${tel ? `<a class="dg hayalet kucuk ikon" href="tel:${h(tel)}" title="Ara" aria-label="Ara">${ikon("phone", "k")}</a>` : ""}
        ${k.whatsapp ? `<a class="dg hayalet kucuk ikon" href="https://wa.me/${h(k.whatsapp)}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${ikon("message-circle", "k")}</a>` : ""}
        <button class="dg hayalet kucuk ikon" title="Haritada göster" aria-label="Haritada göster">${ikon("map-pin", "k")}</button>
        <button class="dg hayalet kucuk ikon" data-tasi title="Aşamaya taşı" aria-label="Aşamaya taşı" aria-haspopup="menu">${ikon("arrow-right-left", "k")}</button>
      </div>
    </article>`;
  }

  /** Kaydı başka aşamaya taşır; bildirimde "Geri al" sunar. odak: taşınan karta klavye odağını geri ver. */
  function asamaTasi(id, yeni, { odak = false } = {}) {
    const k = huni.al(id);
    if (!k || !ASAMA[yeni] || k.asama === yeni) return;
    const eski = k.asama;
    huni.guncelle(k, { asama: yeni });
    huniDegisti(id);
    if (odak) document.querySelector(`.hkart[data-id="${CSS.escape(id)}"]`)?.focus();
    bildirim(`${h(k.ad)}: ${ASAMA[yeni].ad}`, ASAMA[yeni].ikon, {
      geriAl: () => {
        const simdi = huni.al(id);
        if (!simdi) return;
        huni.guncelle(simdi, { asama: eski });
        huniDegisti(id);
      },
    });
  }

  /* Aşama menüsü: dokunmatikte sürüklemeye alternatif, tek dokunuşla taşıma. */
  let acikMenu = null;
  function tasiMenusuKapat() {
    if (!acikMenu) return;
    acikMenu.menu.remove();
    acikMenu.dugme.setAttribute("aria-expanded", "false");
    acikMenu = null;
  }
  function tasiMenusuAc(dugme) {
    const id = dugme.closest(".hkart").dataset.id;
    const k = huni.al(id);
    if (!k) return;
    const yeniden = acikMenu?.dugme === dugme;
    tasiMenusuKapat();
    if (yeniden) return;
    const menu = document.createElement("div");
    menu.className = "tasi-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Aşamaya taşı");
    menu.innerHTML = `<p>Aşamaya taşı</p>` + ASAMALAR.map((a) => a.id === k.asama
      ? `<button type="button" role="menuitem" disabled style="--c:${a.renk}">${ikon(a.ikon)}${a.ad}${ikon("check", "k sag")}</button>`
      : `<button type="button" role="menuitem" data-asama-sec="${a.id}" style="--c:${a.renk}">${ikon(a.ikon)}${a.ad}</button>`).join("");
    document.body.appendChild(menu);
    const r = dugme.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const asagi = r.bottom + 6 + m.height <= window.innerHeight - 8;
    menu.style.top = (asagi ? r.bottom + 6 : Math.max(8, r.top - 6 - m.height)) + "px";
    menu.style.left = Math.min(window.innerWidth - m.width - 8, Math.max(8, r.right - m.width)) + "px";
    dugme.setAttribute("aria-expanded", "true");
    acikMenu = { menu, dugme, id };
    menu.querySelector("button:not([disabled])")?.focus();
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-asama-sec]");
      if (!b) return;
      const hedef = b.dataset.asamaSec, kayit = acikMenu.id;
      tasiMenusuKapat();
      asamaTasi(kayit, hedef, { odak: true });
    });
    menu.addEventListener("keydown", (e) => {
      const dugmeler = [...menu.querySelectorAll("button:not([disabled])")];
      const i = dugmeler.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); dugmeler[(i + 1) % dugmeler.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); dugmeler[(i - 1 + dugmeler.length) % dugmeler.length].focus(); }
      else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); const d = acikMenu.dugme; tasiMenusuKapat(); d.focus(); }
    });
  }
  document.addEventListener("pointerdown", (e) => {
    if (acikMenu && !acikMenu.menu.contains(e.target) && !acikMenu.dugme.contains(e.target)) tasiMenusuKapat();
  });
  window.addEventListener("resize", tasiMenusuKapat);

  function huniKaydiniAc(id) {
    const k = huni.al(id);
    if (!k) return;
    modSec("kesif");
    const tarali = D.kayitlar.find((x) => x.id === id);
    sec(id, { kayit: tarali || k });
  }

  /* ------------------------------------------------------------ görünüm */
  function modSec(m) {
    D.mod = m;
    document.querySelectorAll(".gorunum").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mod === m)));
    $("huni").classList.toggle("gizli", m !== "huni");
    if (m === "huni") {
      huniCiz();
      return;
    }
    if (D.kayitlar.length) {
      $("fSirala").value = m === "firsat" ? "puan" : "mesafe";
      filtrele();
    } else if (m === "firsat") {
      durum("bilgi", "Fırsatları görmek için önce bir çevre tara.");
    }
    setTimeout(() => harita.invalidateSize(), 0);
  }

  /* ------------------------------------------------------------ CSV ve yazdırma */
  function csvHucre(v) {
    let s = String(v ?? "");
    // Excel formül enjeksiyonuna karşı; telefon numaralarına (+90 ...) dokunma.
    if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s]+$/.test(s))) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  }
  const csvMetni = (satirlar) => "﻿" + satirlar.map((r) => r.map(csvHucre).join(";")).join("\r\n");
  const tarihEki = () => new Date().toISOString().slice(0, 10);

  function csvIndir() {
    const basliklar = ["ad", "sektor", "mesafe_m", "telefon", "whatsapp", "web", "instagram", "facebook", "eposta", "adres", "saatler", "su_an", "dijital", "firsat_puani", "neden", "zincir", "huni_asama", "takip", "not", "site_skoru", "osm", "lat", "lng"];
    const satirlar = D.filtreli.map((x) => {
      const k = huni.al(x.id);
      return [
        x.ad, SEKTOR[x.sektor].ad, Math.round(x.mesafe), x.telefon, x.whatsapp, x.web, x.instagram ? "https://instagram.com/" + x.instagram : "", x.facebook, x.eposta,
        x.adres, x.saatler, saatDurumu(x).metin, DIJITAL[x.dijital].yazi, x.puan || "", x.neden.join(", "), x.zincir ? "evet" : "",
        k ? ASAMA[k.asama].ad : "", k?.takip || "", k?.not || "", siteSkoru(x) ?? "",
        `https://www.openstreetmap.org/${x.id}`, x.lat.toFixed(6), x.lng.toFixed(6),
      ];
    });
    indir(csvMetni([basliklar, ...satirlar]), `semtim-${S.tr.slug(D.merkez?.ad || "tarama")}-${D.mod}-${tarihEki()}.csv`, "text/csv;charset=utf-8");
    bildirim(`${sayi(satirlar.length)} satır CSV olarak indirildi`, "download");
  }

  function huniCsvIndir() {
    const basliklar = ["ad", "sektor", "asama", "takip", "not", "telefon", "whatsapp", "adres", "osm", "eklenme", "guncelleme"];
    const satirlar = huni.liste().map((k) => [
      k.ad, (SEKTOR[k.sektor] || SEKTOR.genel).ad, ASAMA[k.asama].ad, k.takip, k.not, k.telefon, k.whatsapp, k.adres,
      `https://www.openstreetmap.org/${k.id}`, k.olusturma ? new Date(k.olusturma).toLocaleString("tr-TR") : "", k.guncel ? new Date(k.guncel).toLocaleString("tr-TR") : "",
    ]);
    indir(csvMetni([basliklar, ...satirlar]), `semtim-huni-${tarihEki()}.csv`, "text/csv;charset=utf-8");
  }

  function yazdir() {
    if (!D.filtreli.length) { bildirim("Yazdırmak için önce bir çevre tara", "info"); return; }
    const liste = D.filtreli.slice(0, 300);
    const baslik = D.mod === "firsat" ? "Fırsat ziyaret listesi" : "Ziyaret listesi";
    $("yazdir").innerHTML = `
      <h1>${baslik} · ${h(D.merkez?.ad || "")}</h1>
      <p class="alt">${new Date().toLocaleString("tr-TR")} · ${(D.r / 1000).toLocaleString("tr-TR")} km yarıçap · ${sayi(liste.length)} işletme${D.filtreli.length > liste.length ? ` (ilk ${liste.length})` : ""} · Kaynak: © OpenStreetMap katkıcıları</p>
      <table>
        <thead><tr><th>#</th><th>İşletme</th><th>Telefon</th><th>Saat</th><th>Puan</th><th>Gidildi</th><th class="not-alan">Not</th></tr></thead>
        <tbody>${liste.map((x, i) => `<tr>
          <td>${i + 1}</td>
          <td><b>${h(x.ad)}</b><br><small>${h(SEKTOR[x.sektor].ad)} · ${mesafeYazi(x.mesafe)}${x.adres ? " · " + h(x.adres) : ""}</small></td>
          <td>${h(x.telefon || "")}</td>
          <td><small>${h(saatDurumu(x).durum === "bilinmiyor" ? "" : saatDurumu(x).metin)}</small></td>
          <td>${x.puan || ""}</td>
          <td><span class="kutu"></span></td>
          <td class="not-alan"></td></tr>`).join("")}</tbody>
      </table>`;
    window.print();
  }

  /* ------------------------------------------------------------ adres arama ve konum */
  async function adresAra(e) {
    e.preventDefault();
    const q = $("aramaKutusu").value.trim();
    const ul = $("aramaSonuclari");
    ul.classList.add("gizli");
    if (!q) { $("aramaKutusu").focus(); return; }
    durum("yukleniyor", "Adres aranıyor…");
    try {
      const sonuc = await S.veri.konumAra(q);
      if (!sonuc.length) {
        durum("hata", `“${h(q)}” bulunamadı.<small>İl ile birlikte yazmayı dene: Moda, Kadıköy, İstanbul</small>`);
        return;
      }
      durum(null);
      if (sonuc.length === 1) return merkezSec(sonuc[0].lat, sonuc[0].lng, sonuc[0].ad, true);
      ul.innerHTML = sonuc.map((s, i) => `<li><button type="button" data-i="${i}">${ikon("map-pin", "k")}<span>${h(s.ad)}</span></button></li>`).join("");
      ul.classList.remove("gizli");
      ul.querySelector("button")?.focus();
      ul.onclick = (ev) => {
        const b = ev.target.closest("button[data-i]");
        if (!b) return;
        const s = sonuc[+b.dataset.i];
        ul.classList.add("gizli");
        merkezSec(s.lat, s.lng, s.ad, true);
      };
    } catch (err) {
      durum("hata", h(err.message || "Adres aranamadı."));
    }
  }

  function konumumuKullan() {
    if (!navigator.geolocation) return durum("hata", "Tarayıcın konum özelliğini desteklemiyor.");
    durum("yukleniyor", "Konumun alınıyor…");
    navigator.geolocation.getCurrentPosition(
      (p) => { durum(null); merkezSec(p.coords.latitude, p.coords.longitude, "Bulunduğun konum", true); },
      (err) => durum("hata", err.code === 1
        ? "Konum izni verilmedi.<small>Tarayıcı ayarlarından izin verebilir ya da semt adıyla arayabilirsin.</small>"
        : "Konum alınamadı.<small>Semt adıyla aramayı dene.</small>"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  /* ------------------------------------------------------------ paylaşılabilir adres (#enlem,boylam,km) */
  function hashYaz() {
    if (!D.merkez) return;
    history.replaceState(null, "", `#${D.merkez.lat.toFixed(5)},${D.merkez.lng.toFixed(5)},${D.r / 1000}`);
  }

  function hashOku() {
    const m = location.hash.match(/^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?/);
    if (!m) return;
    const km = Math.min(5, Math.max(0.5, +(m[3] || 1)));
    $("yaricap").value = km;
    yaricapGuncelle();
    merkezSec(+m[1], +m[2], "Paylaşılan konum", true);
  }

  function yaricapGuncelle() {
    const g = $("yaricap");
    const km = +g.value;
    D.r = Math.round(km * 1000);
    $("yaricapYazi").innerHTML = `${km.toLocaleString("tr-TR")}<small>km</small>`;
    g.style.setProperty("--dolu", ((km - +g.min) / (+g.max - +g.min)) * 100 + "%");
    if (daire) daire.setRadius(D.r);
  }

  /* ------------------------------------------------------------ olaylar */
  $("aramaForm").addEventListener("submit", adresAra);
  $("btnKonum").addEventListener("click", konumumuKullan);
  $("btnTara").addEventListener("click", () => tara($("btnTara").dataset.yenile === "1"));
  $("btnIptal").addEventListener("click", () => D.kontrol?.abort());
  $("yaricap").addEventListener("input", () => {
    yaricapGuncelle();
    taraButonu();
    if (D.kayitlar.length && ayniMerkez() && D.r <= D.taranan.r) filtrele();
  });
  $("yaricap").addEventListener("change", () => {
    hashYaz();
    if (daire) harita.fitBounds(daire.getBounds(), haritaDolgusu());
  });

  ["fSitesiz", "fTelefonlu", "fAcik", "fZayif", "fZincir", "fSirala"].forEach((id) => $(id).addEventListener("change", filtrele));
  let metinZaman;
  $("fMetin").addEventListener("input", () => { clearTimeout(metinZaman); metinZaman = setTimeout(filtrele, 180); });

  $("cipler").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sektor]");
    if (!b) return;
    D.sektor = b.dataset.sektor;
    filtrele();
  });

  document.querySelectorAll(".gorunum").forEach((b) => b.addEventListener("click", () => modSec(b.dataset.mod)));

  $("liste").addEventListener("click", (e) => {
    const k = e.target.closest(".kart[data-id]");
    if (k) sec(k.dataset.id);
  });
  $("liste").addEventListener("keydown", (e) => {
    const k = e.target.closest(".kart[data-id]");
    if (!k) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sec(k.dataset.id); }
    else if (e.key === "ArrowDown") { e.preventDefault(); k.nextElementSibling?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); k.previousElementSibling?.focus(); }
  });
  $("btnDahaFazla").addEventListener("click", () => { D.gosterilen += SAYFA; listeCiz(); });
  $("btnCsv").addEventListener("click", csvIndir);
  $("btnYazdir").addEventListener("click", yazdir);

  $("btnDetayKapat").addEventListener("click", detayKapat);
  $("btnDetayOnceki").addEventListener("click", () => komsuyaGit(-1));
  $("btnDetaySonraki").addEventListener("click", () => komsuyaGit(1));

  // Detay panelindeki satış takibi
  $("detayIc").addEventListener("click", (e) => {
    const x = D.detay;
    if (!x) return;
    const a = e.target.closest("[data-asama]");
    if (a) {
      const yeni = huniyeEkle(x, { asama: a.dataset.asama });
      const ust = $("detayIc").scrollTop;
      detayCiz();
      $("detayIc").scrollTop = ust;
      kaydedildiGoster();
      if (yeni) bildirim(`Huniye eklendi: ${h(x.ad)}`, "kanban");
      return;
    }
    if (e.target.closest("#btnHuniSil")) {
      huni.sil(x.id);
      huniDegisti(x.id);
      detayCiz();
      bildirim("Huniden çıkarıldı", "trash-2");
    }
  });
  let notZaman;
  $("detayIc").addEventListener("input", (e) => {
    if (e.target.id !== "takipNot" || !D.detay) return;
    const x = D.detay, deger = e.target.value;
    clearTimeout(notZaman);
    notZaman = setTimeout(() => { huniyeEkle(x, { not: deger }); kaydedildiGoster(); }, 450);
  });
  $("detayIc").addEventListener("change", (e) => {
    if (e.target.id !== "takipTarih" || !D.detay) return;
    try {
      huniyeEkle(D.detay, { takip: e.target.value });
      kaydedildiGoster();
    } catch (err) { bildirim(h(err.message), "circle-alert"); }
  });

  // Huni panosu: tıkla, sürükle-bırak, klavye
  $("kolonlar").addEventListener("click", (e) => {
    const git = e.target.closest("[data-mod-git]");
    if (git) return modSec(git.dataset.modGit);
    if (e.target.closest("a")) return; // ara / WhatsApp bağlantısı
    const tasi = e.target.closest("[data-tasi]");
    if (tasi) return tasiMenusuAc(tasi);
    const kart = e.target.closest(".hkart");
    if (kart) huniKaydiniAc(kart.dataset.id);
  });
  $("kolonlar").addEventListener("keydown", (e) => {
    const kart = e.target.closest(".hkart");
    if (!kart || e.target !== kart) return;
    const id = kart.dataset.id;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); huniKaydiniAc(id); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const i = ASAMALAR.findIndex((a) => a.id === huni.al(id)?.asama);
      const j = i + (e.key === "ArrowRight" ? 1 : -1);
      if (i >= 0 && j >= 0 && j < ASAMALAR.length) asamaTasi(id, ASAMALAR[j].id, { odak: true });
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      (e.key === "ArrowDown" ? kart.nextElementSibling : kart.previousElementSibling)?.focus();
    }
  });
  $("kolonlar").addEventListener("scroll", tasiMenusuKapat, { passive: true });

  // Sürükle-bırak: fare ve dokunmatik (js/surukle.js)
  S.surukle.baglan($("kolonlar"), {
    kart: ".hkart",
    hedef: ".kolon",
    ic: ".kolon-ic",
    birak: (id, kolon) => asamaTasi(id, kolon.dataset.asama),
  });

  $("btnHuniDisa").addEventListener("click", () => {
    if (!huni.sayi()) return bildirim("Huni boş; yedeklenecek kayıt yok", "info");
    indir(huni.disaAktar(), `semtim-huni-${tarihEki()}.json`, "application/json");
    bildirim(`${sayi(huni.sayi())} kayıt yedeklendi`, "download");
  });
  $("btnHuniCsv").addEventListener("click", () => {
    if (!huni.sayi()) return bildirim("Huni boş", "info");
    huniCsvIndir();
  });
  $("huniDosya").addEventListener("change", async (e) => {
    const dosya = e.target.files[0];
    e.target.value = "";
    if (!dosya) return;
    if (dosya.size > 5e6) return bildirim("Dosya çok büyük (en fazla 5 MB)", "circle-alert");
    try {
      const n = huni.iceAktar(await dosya.text());
      huniDegisti();
      if (D.kayitlar.length) { listeCiz(); isaretleriCiz(); }
      bildirim(`${sayi(n)} kayıt geri yüklendi`, "upload");
    } catch (err) {
      bildirim(h(err.message), "circle-alert");
    }
  });

  // Diyaloglar
  async function hakkindaAc() {
    const n = huni.sayi();
    const gec = huni.gecikenler(bugun()).length;
    let tarama = 0;
    try { tarama = await S.veri.onbellekSayisi(); } catch (e) { /* yoksay */ }
    $("hkIstatistik").innerHTML = [
      ["Hunideki kayıt", n, ""],
      ["Müşteri", huni.gruplar().musteri.length, ""],
      ["Geciken takip", gec, gec ? "uyari" : ""],
      ["Önbellekteki tarama", tarama, ""],
    ].map(([etiket, deger, sinif]) => `<div><dt>${etiket}</dt><dd class="${sinif}">${sayi(deger)}</dd></div>`).join("");
    $("hakkinda").showModal();
  }
  $("btnHakkinda").addEventListener("click", hakkindaAc);
  $("btnKvkk").addEventListener("click", () => { $("hakkinda").close(); $("gizlilik").showModal(); });

  $("kontrolDosya").addEventListener("change", async (e) => {
    const dosya = e.target.files[0];
    e.target.value = "";
    if (!dosya) return;
    if (dosya.size > 20e6) return bildirim("Dosya çok büyük (en fazla 20 MB)", "circle-alert");
    try {
      const sonuc = kontrol.iceAktar(await dosya.text());
      $("fZayifKap").classList.toggle("gizli", !kontrol.sayi());
      if (!sonuc.eslesen) return bildirim("Dosyada sitesi kontrol edilmiş işletme bulunamadı", "info");
      if (D.kayitlar.length) filtrele();
      if (D.detay) detayCiz();
      bildirim(`${sayi(sonuc.eslesen)} işletmenin site sonucu yüklendi`, "upload");
    } catch (err) {
      bildirim(h(err.message), "circle-alert");
    }
  });

  $("btnTumVeriSil").addEventListener("click", async () => {
    const n = huni.sayi();
    const onay = window.confirm(
      `Bu cihazdaki tüm Semtim verileri silinecek:\n\n` +
      `- Huni (${n} kayıt), notlar ve takip tarihleri\n- Site kontrol sonuçları\n- Tarama ve harita önbelleği\n- Tema ve panel tercihleri\n\n` +
      `Bu işlem geri alınamaz. Devam edilsin mi?`);
    if (!onay) return;
    try { await S.veri.onbellekTemizle(); } catch (err) { /* yoksay */ }
    huni.hepsiniSil();
    kontrol.temizle();
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("semtim:") || k.startsWith("konum:")).forEach((k) => localStorage.removeItem(k));
    } catch (err) { /* yoksay */ }
    try {
      if (window.caches) for (const ad of await caches.keys()) if (ad.startsWith("semtim-")) await caches.delete(ad);
    } catch (err) { /* yoksay */ }
    $("gizlilik").close();
    bildirim("Bu cihazdaki tüm Semtim verileri silindi", "trash-2");
    setTimeout(() => location.replace(location.pathname), 1200);
  });
  $("btnHkYedek").addEventListener("click", () => $("btnHuniDisa").click());
  $("btnHkKisayol").addEventListener("click", () => { $("hakkinda").close(); $("kisayollar").showModal(); });
  $("btnAramaAc").addEventListener("click", () => {
    aramaKatla(false);
    if (mobil()) sheetAyarla(sheetDurum === "kucuk" ? "orta" : sheetDurum);
    else $("aramaKutusu").focus();
  });
  $("btnAramaKatla").addEventListener("click", () => aramaKatla(true));
  $("btnKompaktTara").addEventListener("click", () => tara(true));
  $("btnKisayol").addEventListener("click", () => $("kisayollar").showModal());
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-kapat]")) d.close();
    });
  });
  $("btnTema").addEventListener("click", temaDegistir);
  $("btnOnbellek").addEventListener("click", async () => {
    await S.veri.onbellekTemizle();
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("konum:")).forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* yoksay */ }
    $("hakkinda").close();
    bildirim("Tarama ve adres önbelleği temizlendi. Huni korunuyor.", "trash-2");
  });

  // Klavye kısayolları
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const yazim = e.target.closest?.("input, textarea, select, [contenteditable]");
    if (e.key === "Escape") {
      if (document.querySelector("dialog[open]")) return; // diyalog kendi kapanır
      if (yazim) { e.target.blur(); return; }
      if (!$("aramaSonuclari").classList.contains("gizli")) { $("aramaSonuclari").classList.add("gizli"); return; }
      if (detayKapat()) e.preventDefault();
      return;
    }
    if (yazim || document.querySelector("dialog[open]")) return;
    const tus = e.key.toLocaleLowerCase("tr");
    if (e.key === "/") { e.preventDefault(); $("aramaKutusu").focus(); $("aramaKutusu").select(); }
    else if (tus === "t" && !$("btnTara").disabled) { e.preventDefault(); tara($("btnTara").dataset.yenile === "1"); }
    else if (e.key === "1") modSec("kesif");
    else if (e.key === "2") modSec("firsat");
    else if (e.key === "3") modSec("huni");
    else if (tus === "j" && D.mod !== "huni") { e.preventDefault(); komsuyaGit(1); }
    else if (tus === "k" && D.mod !== "huni") { e.preventDefault(); komsuyaGit(-1); }
    else if (tus === "h" && D.detay) {
      const yeni = huniyeEkle(D.detay, {});
      detayCiz();
      bildirim(yeni ? `Huniye eklendi: ${h(D.detay.ad)}` : "Zaten hunide", "kanban");
    } else if (tus === "p") { e.preventDefault(); yazdir(); }
    else if (e.key === "?") $("kisayollar").showModal();
  });

  window.addEventListener("offline", () => bildirim("Çevrimdışısın. Önbellekteki taramalar yine açılır.", "wifi-off"));
  window.addEventListener("online", () => bildirim("Bağlantı geri geldi", "circle-check"));

  // Huni başka bir sekmede değişirse sayacı ve görünümü tazele
  window.addEventListener("storage", (e) => {
    if (e.key === S.huni.ANAHTAR) location.reload();
  });

  /* ------------------------------------------------------------ PWA: service worker
     Sadece http/https'te. Yerel geliştirmede (localhost) kapalı: eski dosyalar önbellekten gelmesin.
     Yerelde denemek için adrese ?sw=1 ekle. */
  const yerel = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !yerel) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { /* PWA isteğe bağlı */ }));
  }

  /* ------------------------------------------------------------ başlangıç */
  temaUygula(document.documentElement.dataset.temaTercih || "sistem");
  yaricapGuncelle();
  huniSayaci();
  sheetAyarla("orta");
  $("fZayifKap").classList.toggle("gizli", !kontrol.sayi());
  hashOku();
})(window.Semtim);
