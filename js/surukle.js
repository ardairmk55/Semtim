/* Semtim — fare ve dokunmatikte çalışan sürükle-bırak (Pointer Events).

   HTML5 draggable dokunmatik ekranlarda çalışmaz; bu modül ikisini tek yoldan çözer:
     Fare:      kartı tut ve 6 px oynat → sürükleme başlar. Kısa tık normal tıklamadır.
     Dokunmatik: kartı ~0,3 sn basılı tut → titreşim + sürükleme başlar. Hemen kaydırırsan
                 sürükleme başlamaz, liste/kolonlar normal kayar.
   Sürüklerken kap ve hedefin içi kenarlara yaklaşınca otomatik kayar (mobilde yan kolonlara geçiş).
   Esc ya da hedef dışında bırakmak iptal eder; kart yerine süzülerek döner. */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  const UZUN_BASMA_MS = 300;
  const ESIK_FARE = 6;      // px: bu kadar oynayınca fare sürüklemesi başlar
  const ESIK_DOKUNMA = 10;  // px: uzun basma dolmadan bu kadar oynarsa kaydırmadır, iptal
  const KENAR = 64;         // px: otomatik kaydırmanın başladığı kenar bölgesi
  const EN_HIZ = 22;        // px/kare

  /**
   * kap: olayların dinleneceği kapsayıcı (yatay kayan).
   * secenek.kart:   sürüklenebilir öğe seçicisi (data-id taşır)
   * secenek.hedef:  bırakılabilir alan seçicisi
   * secenek.ic:     hedefin içindeki dikey kayan alan seçicisi (isteğe bağlı)
   * secenek.birak(id, hedefEl): geçerli bir hedefe bırakılınca çağrılır
   */
  function baglan(kap, { kart, hedef, ic, birak }) {
    let aday = null;      // basıldı ama sürükleme henüz başlamadı
    let s = null;         // aktif sürükleme
    let tiklamayiYut = false;

    function adayTemizle() {
      if (aday?.zaman) clearTimeout(aday.zaman);
      aday = null;
      kap.querySelector(".basili")?.classList.remove("basili");
    }

    kap.addEventListener("pointerdown", (e) => {
      if (s || (e.pointerType === "mouse" && e.button !== 0)) return;
      const el = e.target.closest(kart);
      if (!el || !kap.contains(el) || e.target.closest("a, button, input, select, textarea, [data-surukleme-yok]")) return;
      aday = { el, id: el.dataset.id, pid: e.pointerId, tip: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      if (e.pointerType !== "mouse") {
        el.classList.add("basili");
        aday.zaman = setTimeout(() => aday && basla(aday.x, aday.y), UZUN_BASMA_MS);
      }
    });

    document.addEventListener("pointermove", (e) => {
      if (s) {
        if (e.pointerId !== s.pid) return;
        e.preventDefault();
        s.x = e.clientX;
        s.y = e.clientY;
        konumla();
        return;
      }
      if (!aday || e.pointerId !== aday.pid) return;
      aday.x = e.clientX;
      aday.y = e.clientY;
      const mesafe = Math.hypot(e.clientX - aday.x0, e.clientY - aday.y0);
      if (aday.tip === "mouse") { if (mesafe > ESIK_FARE) basla(e.clientX, e.clientY); }
      else if (mesafe > ESIK_DOKUNMA) adayTemizle(); // parmak kaydırıyor
    }, { passive: false });

    document.addEventListener("pointerup", (e) => {
      if (s && e.pointerId === s.pid) bitir(true);
      else if (aday && e.pointerId === aday.pid) adayTemizle();
    });
    document.addEventListener("pointercancel", (e) => {
      if (s && e.pointerId === s.pid) bitir(false);
      else if (aday && e.pointerId === aday.pid) adayTemizle();
    });

    // Sürükleme başladıktan sonra dokunmatik kaydırmayı durdur (passive:false şart).
    document.addEventListener("touchmove", (e) => { if (s) e.preventDefault(); }, { passive: false });
    // Uzun basmada açılan sistem menüsünü engelle.
    kap.addEventListener("contextmenu", (e) => { if (s || aday) e.preventDefault(); });
    // Sürükleme bittikten hemen sonra gelen tıklama kartı açmasın.
    kap.addEventListener("click", (e) => {
      if (!tiklamayiYut) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (s && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); bitir(false); }
    }, true);

    function basla(x, y) {
      const el = aday.el;
      const r = el.getBoundingClientRect();
      const hayalet = el.cloneNode(true);
      hayalet.classList.remove("basili");
      hayalet.classList.add("kopya");
      hayalet.removeAttribute("tabindex");
      hayalet.setAttribute("aria-hidden", "true");
      Object.assign(hayalet.style, { width: r.width + "px", height: r.height + "px", left: "0px", top: "0px" });
      document.body.appendChild(hayalet);

      s = {
        el, id: aday.id, pid: aday.pid, hayalet, dokunma: aday.tip !== "mouse",
        dx: x - r.left, dy: y - r.top, x, y,
        kaynak: el.closest(hedef), hedefEl: null, raf: 0,
      };
      if (aday.zaman) clearTimeout(aday.zaman);
      aday = null;
      el.classList.remove("basili");
      el.classList.add("surukleniyor");
      kap.classList.add("surukleme-modu");
      document.documentElement.classList.add("surukleme-aktif");
      try { el.setPointerCapture?.(s.pid); } catch (err) { /* bazı tarayıcılar izin vermez */ }
      if (s.dokunma && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) {
        try { navigator.vibrate(12); } catch (err) { /* yoksay */ }
      }
      konumla();
      s.raf = requestAnimationFrame(otomatikKaydir);
    }

    function konumla() {
      s.hayalet.style.transform = `translate3d(${s.x - s.dx}px, ${s.y - s.dy}px, 0) rotate(1.5deg)`;
      hedefiBul();
    }

    function hedefiBul() {
      const altindaki = document.elementFromPoint(s.x, s.y);
      const h = altindaki && altindaki.closest(hedef);
      const yeni = h && kap.contains(h) ? h : null;
      if (yeni === s.hedefEl) return;
      s.hedefEl?.classList.remove("uzerinde");
      s.hedefEl = yeni;
      if (yeni && yeni !== s.kaynak) yeni.classList.add("uzerinde");
    }

    /** Kenara yaklaşıldıkça hızlanan kaydırma: hem yatay kap, hem hedefin dikey içi. */
    function otomatikKaydir() {
      if (!s) return;
      const hiz = (uzaklik) => Math.ceil(EN_HIZ * Math.min(1, (KENAR - uzaklik) / KENAR));
      let kaydi = false;
      const r = kap.getBoundingClientRect();
      if (s.x < r.left + KENAR && kap.scrollLeft > 0) { kap.scrollLeft -= hiz(s.x - r.left); kaydi = true; }
      else if (s.x > r.right - KENAR && kap.scrollLeft < kap.scrollWidth - kap.clientWidth) { kap.scrollLeft += hiz(r.right - s.x); kaydi = true; }
      const icEl = ic && s.hedefEl?.querySelector(ic);
      if (icEl) {
        const ir = icEl.getBoundingClientRect();
        if (s.y < ir.top + KENAR && icEl.scrollTop > 0) { icEl.scrollTop -= hiz(s.y - ir.top); kaydi = true; }
        else if (s.y > ir.bottom - KENAR && icEl.scrollTop < icEl.scrollHeight - icEl.clientHeight) { icEl.scrollTop += hiz(ir.bottom - s.y); kaydi = true; }
      }
      if (kaydi) hedefiBul();
      s.raf = requestAnimationFrame(otomatikKaydir);
    }

    function bitir(birakildi) {
      const { el, id, hayalet, hedefEl, kaynak } = s;
      cancelAnimationFrame(s.raf);
      s = null;
      kap.classList.remove("surukleme-modu");
      document.documentElement.classList.remove("surukleme-aktif");
      hedefEl?.classList.remove("uzerinde");
      tiklamayiYut = true;
      setTimeout(() => { tiklamayiYut = false; }, 0);

      if (birakildi && hedefEl && hedefEl !== kaynak) {
        hayalet.remove();
        el.classList.remove("surukleniyor");
        birak(id, hedefEl);
        return;
      }
      // İptal: hayalet kartın yerine süzülerek döner.
      const r = el.getBoundingClientRect();
      hayalet.classList.add("donuyor");
      hayalet.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
      const kaldir = () => { hayalet.remove(); el.classList.remove("surukleniyor"); };
      hayalet.addEventListener("transitionend", kaldir, { once: true });
      setTimeout(kaldir, 320);
    }

    return { aktif: () => !!s };
  }

  S.surukle = { baglan };
})(window.Semtim);
