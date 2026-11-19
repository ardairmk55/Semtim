#!/usr/bin/env python3
"""Semtim — web sitesi sağlık kontrolü.

Semtim'den indirdiğin CSV'deki web sitelerini tek tek kontrol eder:
site açılıyor mu, HTTPS ve geçerli SSL var mı, mobil uyumlu mu, ne kadar hızlı,
alan adı park edilmiş mi? Her siteye 0-100 arası bir dijital skor verir.

  python3 semtim_kontrol.py semtim-kadikoy-kesif-2026-11-19.csv
  python3 semtim_kontrol.py liste.csv --cikti sonuc.csv --paralel 8
  python3 semtim_kontrol.py --url kahveduragi.com --url ornek.com.tr

Tarayıcı güvenlik nedeniyle başka sitelerin içeriğini okuyamaz; bu yüzden bu
kontrol kendi bilgisayarında çalışan bu araçla yapılır. Sunucu gerekmez.
Sadece Python 3.9+ standart kütüphanesi kullanılır, kurulum yok.
"""
import argparse
import concurrent.futures as cf
import csv
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

UA = "Mozilla/5.0 (compatible; SemtimKontrol/1.0)"
EN_FAZLA_BAYT = 400_000
ZAMAN_ASIMI = 12

PARK_IFADELERI = (
    "domain is for sale", "this domain is for sale", "buy this domain", "domain parking", "parked free",
    "bu alan adı satılık", "alan adı satılıktır", "satılık domain", "bu domain satılık",
    "sedoparking", "parkingcrew", "hugedomains", "dan.com", "godaddy.com/forsale",
)
YAPIM_IFADELERI = ("yapım aşamasında", "under construction", "coming soon", "çok yakında", "bakım çalışması", "index of /")


def adres_duzelt(u):
    u = (u or "").split(";")[0].strip()
    if not u:
        return ""
    if not re.match(r"^[a-z][a-z0-9+.-]*://", u, re.I):
        u = "https://" + u.lstrip("/")
    p = urlparse(u)
    return u if p.scheme in ("http", "https") and p.hostname else ""


def getir(url, dogrula=True):
    """(son_url, durum_kodu, html, sure_ms) döndürür; hata olursa istisna fırlatır."""
    baglam = ssl.create_default_context()
    if not dogrula:
        baglam.check_hostname = False
        baglam.verify_mode = ssl.CERT_NONE
    istek = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "tr,en;q=0.7"})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(istek, timeout=ZAMAN_ASIMI, context=baglam) as y:
            govde = y.read(EN_FAZLA_BAYT)
            sure = int((time.perf_counter() - t0) * 1000)
            karakter = y.headers.get_content_charset() or "utf-8"
            return y.geturl(), y.status, govde.decode(karakter, "replace"), sure
    except urllib.error.HTTPError as e:
        sure = int((time.perf_counter() - t0) * 1000)
        govde = e.read(EN_FAZLA_BAYT).decode("utf-8", "replace") if e.fp else ""
        return e.geturl() or url, e.code, govde, sure


def ssl_hatasi_mi(e):
    neden = getattr(e, "reason", e)
    return isinstance(neden, ssl.SSLError) or isinstance(e, ssl.SSLError) or "CERTIFICATE" in str(e).upper()


def kontrol_et(ham_url):
    s = {"site_durumu": "", "http_kodu": "", "son_adres": "", "https": "", "ssl_gecerli": "", "mobil_uyumlu": "",
         "yukleme_ms": "", "baslik": "", "dijital_skor": 0, "notlar": ""}
    url = adres_duzelt(ham_url)
    if not url:
        s["site_durumu"] = "site yok"
        return s

    notlar = []
    ssl_gecerli = None
    adaylar = [url]
    if url.startswith("https://"):
        adaylar.append("http://" + url[len("https://"):])  # https hiç yoksa http'yi dene

    sonuc, son_hata = None, None
    for aday in adaylar:
        try:
            sonuc = getir(aday)
            if aday.startswith("https://"):
                ssl_gecerli = True
            break
        except Exception as e:  # noqa: BLE001 — her türlü ağ hatası kaydedilir
            son_hata = e
            if aday.startswith("https://") and ssl_hatasi_mi(e):
                ssl_gecerli = False
                notlar.append("SSL sertifikası geçersiz")
                try:
                    sonuc = getir(aday, dogrula=False)
                    break
                except Exception as e2:  # noqa: BLE001
                    son_hata = e2

    if not sonuc:
        neden = getattr(son_hata, "reason", son_hata)
        if isinstance(neden, socket.gaierror):
            s["site_durumu"] = "alan adı çözülmüyor"
        elif isinstance(neden, (socket.timeout, TimeoutError)) or "timed out" in str(son_hata):
            s["site_durumu"] = "zaman aşımı"
        else:
            s["site_durumu"] = "açılmıyor"
        s["notlar"] = "; ".join(notlar + [str(neden)[:120]])
        return s

    son_url, kod, govde, sure = sonuc
    kucuk = govde.lower()
    https = son_url.startswith("https://")
    if https and ssl_gecerli is None:
        ssl_gecerli = True  # http'den https'e yönlendirdi ve doğrulama geçti
    mobil = bool(re.search(r"<meta[^>]+name\s*=\s*[\"']?viewport", kucuk))
    m = re.search(r"<title[^>]*>(.*?)</title>", govde, re.I | re.S)
    baslik = re.sub(r"\s+", " ", m.group(1)).strip()[:120] if m else ""

    park = any(p in kucuk for p in PARK_IFADELERI)
    yapim = any(p in kucuk for p in YAPIM_IFADELERI) or len(re.sub(r"<[^>]+>", "", kucuk).split()) < 15

    if kod >= 400:
        durum = f"hata veriyor ({kod})"
    elif park:
        durum = "park edilmiş alan adı"
    elif yapim:
        durum = "boş / yapım aşamasında"
    else:
        durum = "açılıyor"

    skor = 0
    if durum == "açılıyor":
        skor += 40
        if https and ssl_gecerli:
            skor += 20
        if mobil:
            skor += 20
        if sure < 3000:
            skor += 10
        if baslik:
            skor += 10
    elif durum == "boş / yapım aşamasında":
        skor = 15
    elif durum == "park edilmiş alan adı":
        skor = 5

    if not https:
        notlar.append("HTTPS yok")
    if not mobil and durum == "açılıyor":
        notlar.append("mobil uyumlu değil")
    if sure >= 3000:
        notlar.append("yavaş")
    if urlparse(son_url).hostname != urlparse(url).hostname:
        notlar.append("başka adrese yönlendiriyor")

    s.update({"site_durumu": durum, "http_kodu": kod, "son_adres": son_url, "https": "evet" if https else "hayır",
              "ssl_gecerli": "" if ssl_gecerli is None else ("evet" if ssl_gecerli else "hayır"),
              "mobil_uyumlu": "evet" if mobil else "hayır", "yukleme_ms": sure, "baslik": baslik,
              "dijital_skor": skor, "notlar": "; ".join(notlar)})
    return s


def csv_oku(yol):
    with open(yol, encoding="utf-8-sig", newline="") as f:
        ornek = f.read(4096)
        f.seek(0)
        ayrac = ";" if ornek.count(";") >= ornek.count(",") else ","
        satirlar = list(csv.DictReader(f, delimiter=ayrac))
    return satirlar, ayrac


def main():
    ap = argparse.ArgumentParser(description="Semtim CSV'sindeki web sitelerini kontrol eder ve dijital skor verir.")
    ap.add_argument("csv", nargs="?", help="Semtim'den indirilen CSV dosyası")
    ap.add_argument("--url", action="append", help="tek bir adresi kontrol et (birden çok kez verilebilir)")
    ap.add_argument("--cikti", help="sonuç dosyası (varsayılan: <girdi>-kontrol.csv)")
    ap.add_argument("--sutun", default="web", help="web adresinin bulunduğu sütun (varsayılan: web)")
    ap.add_argument("--paralel", type=int, default=6, help="aynı anda kontrol edilecek site sayısı (varsayılan: 6)")
    a = ap.parse_args()

    if a.url:
        for u in a.url:
            s = kontrol_et(u)
            print(f"\n{u}\n  durum: {s['site_durumu']}  skor: {s['dijital_skor']}")
            for k in ("http_kodu", "son_adres", "https", "ssl_gecerli", "mobil_uyumlu", "yukleme_ms", "baslik", "notlar"):
                if s[k] != "":
                    print(f"  {k}: {s[k]}")
        return

    if not a.csv:
        ap.error("bir CSV dosyası ya da --url ver")
    if not os.path.exists(a.csv):
        sys.exit(f"Dosya bulunamadı: {a.csv}")

    satirlar, ayrac = csv_oku(a.csv)
    if not satirlar:
        sys.exit("CSV boş.")
    if a.sutun not in satirlar[0]:
        sys.exit(f"'{a.sutun}' sütunu yok. Sütunlar: {', '.join(satirlar[0].keys())}")

    adresler = sorted({adres_duzelt(r[a.sutun]) for r in satirlar} - {""})
    print(f"• {len(satirlar)} satır, kontrol edilecek {len(adresler)} farklı site. Paralel: {a.paralel}")
    sonuclar = {}
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=max(1, min(a.paralel, 16))) as havuz:
        isler = {havuz.submit(kontrol_et, u): u for u in adresler}
        for i, is_ in enumerate(cf.as_completed(isler), 1):
            u = isler[is_]
            try:
                sonuclar[u] = is_.result()
            except Exception as e:  # noqa: BLE001
                sonuclar[u] = {**kontrol_et(""), "site_durumu": "kontrol hatası", "notlar": str(e)[:120]}
            print(f"  {i}/{len(adresler)}  {sonuclar[u]['dijital_skor']:>3}  {sonuclar[u]['site_durumu']:<24} {u}", flush=True)

    ek = list(kontrol_et("").keys())
    cikti = a.cikti or os.path.splitext(a.csv)[0] + "-kontrol.csv"
    with open(cikti, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(satirlar[0].keys()) + [k for k in ek if k not in satirlar[0]], delimiter=ayrac)
        w.writeheader()
        for r in satirlar:
            u = adres_duzelt(r[a.sutun])
            w.writerow({**r, **(sonuclar.get(u) or kontrol_et(""))})

    durumlar = {}
    for s in sonuclar.values():
        durumlar[s["site_durumu"]] = durumlar.get(s["site_durumu"], 0) + 1
    print(f"\n✓ {time.time() - t0:.0f} sn. Sonuç: {cikti}")
    for d, n in sorted(durumlar.items(), key=lambda x: -x[1]):
        print(f"  {n:>4}  {d}")
    zayif = sum(1 for s in sonuclar.values() if s["dijital_skor"] < 60)
    print(f"\n  Dijital skoru 60'ın altında olan {zayif} site, yenileme için iyi aday olabilir.")


if __name__ == "__main__":
    main()
