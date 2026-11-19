# Semtim

**Yakınındaki işletmeleri keşfet.**

Semtim, seçilen noktanın en fazla 10 km çevresindeki restoran, kafe, market, mağaza ve diğer işletmeleri harita üzerinde gösterir. Kayıtlı web sitesi olmayan bağımsız işletmeleri **Fırsatlar** sekmesinde puanlayarak öne çıkarır, **Huni** sekmesinde bu adayları aşama, not ve takip tarihiyle izlemeni sağlar.

- Tamamen ücretsiz: API anahtarı, veritabanı ya da sunucu gerekmez.
- **Derleme (build) yok, CDN yok.** Klasörü hangi sunucuya ya da alt klasöre koyarsan orada çalışır.
- Türkiye genelinde çalışır. Veriler OpenStreetMap'ten anlık çekilir.
- Kullanıcı verisi sunucuya gitmez. Önbellek, huni ve notlar tarayıcıda (IndexedDB / localStorage) durur.
- Kurulabilir uygulama (PWA): telefona eklenir, açılışta çevrimdışı da açılır.

## Klasör yapısı

```
semtim/
├── index.html              # arayüz
├── manifest.webmanifest    # PWA tanımı
├── sw.js                   # service worker: kabuk ve harita karosu önbelleği
├── css/semtim.css          # tasarım sistemi (açık/koyu tema tokenları, tüm bileşenler)
├── fonts/                  # Plus Jakarta Sans (OFL), yerelden yüklenir
├── vendor/                 # Leaflet 1.9.4, Leaflet.markercluster 1.5.3 (yerel kopya)
├── js/
│   ├── tema-erken.js       # temayı ilk boyamadan önce uygular
│   ├── ikonlar.js          # Lucide ikon sprite'ı (OTOMATİK ÜRETİLİR)
│   ├── turkce.js           # telefon, saat, mesafe, güvenli HTML yardımcıları
│   ├── sektor.js           # OSM etiketi → Türkçe sektör + ikon, Overpass filtreleri
│   ├── saatler.js          # opening_hours ayrıştırıcı: "şu an açık mı?"
│   ├── huni.js             # satış hunisi: aşama, not, takip tarihi, JSON yedek
│   ├── surukle.js          # fare + dokunmatik sürükle-bırak (huni panosu)
│   ├── site-kontrol.js     # site sağlık kontrolü CSV'sini içe aktarır
│   ├── veri.js             # Nominatim, Overpass, önbellek, fırsat puanı
│   └── app.js              # harita, liste, detay paneli, huni panosu, kısayollar
├── img/                    # logo, ikon, favicon, PWA ikonları
├── tests/                  # node:test birim testleri (bağımlılık yok)
├── araclar/
│   ├── semtim_kontrol.py   # web sitesi sağlık kontrolü (Python, isteğe bağlı)
│   ├── yayin-kontrol.mjs   # yayın öncesi kontrol (npm run kontrol)
│   └── ikonlari-uret.mjs   # ikon sprite'ını yeniden üretir
├── vercel.json             # Vercel: güvenlik başlıkları, önbellek süreleri
├── .vercelignore           # Vercel'e gitmeyen geliştirme dosyaları
├── .github/workflows/ci.yml # her push'ta test + yayın kontrolü
└── PRODUCT.md              # ürün kaydı (tasarım kararlarının dayanağı)
```

## Bilgisayarında çalıştırma

Küçük bir yerel sunucu yeterli; kurulum gerekmez:

```bash
python -m http.server 8000
```

Sonra tarayıcıda **http://localhost:8000** adresini aç. (Konum izni ve service worker `file://` adresinde çalışmaz; bu yüzden çift tıklamak yerine sunucu kullan.)

Yerelde service worker kapalıdır, böylece düzenlediğin dosyalar önbellekten gelmez. PWA'yı yerelde denemek için adrese `?sw=1` ekle.

## Nasıl kullanılır?

1. Bir semt ara (örn. *Moda, Kadıköy, İstanbul*), konum butonuna bas ya da haritada bir noktaya tıkla.
2. Yarıçapı seç (0,5–10 km) ve **Bu çevreyi tara**'ya bas.
3. **Keşfet**'te sektör çiplerini ve “Kayıtlı sitesi yok”, “Telefonu var”, “Şu an açık”, “Zincirleri gizle” filtrelerini kullan.
4. **Fırsatlar**, sitesi olmayan bağımsız işletmeleri fırsat puanına göre sıralar.
5. Bir işletmeye tıkla: detay panelinde ara, WhatsApp, yol tarifi, çalışma saatleri ve **Satış takibi** var. Bir aşama seçince işletme huniye eklenir; not ve takip tarihi otomatik kaydedilir.
6. **Huni** sekmesi adayları Aday → İletişime geçildi → Teklif verildi → Müşteri / İlgilenmedi kolonlarında gösterir. Kartları sürükleyip bırakarak aşama değiştirebilirsin. Takip tarihi geçenler kırmızı işaretlenir ve üst bardaki rozet sayısını gösterir.
7. **Yedekle / Geri yükle** huniyi JSON dosyasına alır ve başka tarayıcıya taşır. **CSV** Excel uyumlu liste indirir. Yazıcı butonu, filtrelenmiş listeden işaretlenebilir bir **ziyaret listesi** basar.
8. **Site sağlık kontrolü:** CSV'yi `araclar/semtim_kontrol.py` ile kontrol et, çıkan `*-kontrol.csv` dosyasını filtre satırındaki yükleme butonuyla geri yükle. Sitesi olan işletmelerde 0–100 site skoru, HTTPS / mobil / hız bilgisi görünür; “Zayıf site” filtresi ve “Zayıf site önce” sıralaması yenileme teklifi adaylarını öne çıkarır.
9. **Hakkında → Gizlilik ve KVKK**, hangi verinin nerede tutulduğunu açıklar ve bu cihazdaki tüm Semtim verilerini tek düğmeyle siler.

Adres çubuğundaki `#40.99000,29.03000,2` kısmı paylaşılabilir: linki açan kişi aynı noktayı ve yarıçapı görür.

### Klavye kısayolları

| Tuş | İş |
|---|---|
| `/` | Adres aramaya odaklan |
| `T` | Bu çevreyi tara |
| `1` `2` `3` | Keşfet · Fırsatlar · Huni |
| `J` `K` | Sonraki / önceki işletme |
| `H` | Seçili işletmeyi huniye ekle |
| `P` | Ziyaret listesini yazdır |
| `Esc` | Ayrıntıyı kapat |
| `?` | Kısayol listesi |

## Altyapı nasıl çalışıyor?

| Konu | Çözüm |
|---|---|
| Bağımlılıklar | Leaflet, markercluster ve yazı tipi `vendor/` ve `fonts/` altında. Sayfa hiçbir CDN'e bağlı değil. |
| Güvenlik | Content-Security-Policy yalnızca kendi dosyalarına ve OSM servislerine izin verir. OSM'den gelen her metin HTML'e kaçışlı basılır, sadece http(s) bağlantılarına izin verilir, CSV formül enjeksiyonuna karşı korunur, içe aktarılan huni yedeği alan alan doğrulanır. |
| İşletme verisi | Overpass API (OpenStreetMap). Sunucu yoğunsa sıradaki yedek sunucuya geçer, sonra bir tur daha dener. |
| Büyük alanlar | 4 km'den büyük taramalar 4 ya da 9 parçaya bölünür; zaman aşımını önler ve ilerleme gösterir. |
| Önbellek | Sonuçlar 7 gün IndexedDB'de tutulur. Aynı noktadaki büyük bir tarama küçük yarıçaplar için yeniden kullanılır. Sunucular çökükse süresi geçmiş önbellek uyarıyla gösterilir. |
| Çevrimdışı | Service worker uygulama kabuğunu ve son 600 harita karosunu saklar. |
| Adres arama | Nominatim. Saniyede en fazla 1 istek, otomatik tamamlama yok, sonuçlar 30 gün önbellekte. |
| “Şu an açık mı?” | `js/saatler.js`, OSM `opening_hours` biçiminin yaygın alt kümesini (gün aralıkları, öğle arası, gece yarısını aşan saatler, `24/7`, `off`) okur. Emin olamadığı ifadede tahmin yürütmez, “Saat bilgisi okunamadı” der. |
| Tema | Açık / koyu / sistem. Koyu temada harita karoları CSS filtresiyle karartılır. |
| İkonlar | Lucide (ISC lisansı). Kullanılan ikonlar tek bir SVG sprite'ta; emoji kullanılmaz. |

### “Kayıtlı sitesi yok” ne demek?

İşletmenin OpenStreetMap kaydında web sitesi bilgisi yok demek. Gerçekte sitesi olabilir. Eksik bilgiyi her işletmenin **OSM'de düzelt** bağlantısından herkes ekleyebilir. Bu düzeltmeler Semtim'e de yansır.

### Fırsat puanı

Puan 0 ile 100 arasındadır ve sadece sitesi olmayan, zincir olmayan işletmelere verilir. Hesaba katılanlar: sektörün site alma eğilimi (diş kliniği, güzellik, kuaför yüksek; market ve eczane düşük), telefon, WhatsApp'a uygun cep numarası, sosyal medya hesabı, çalışma saatleri ve adres. Puan kesin bir tahmin değildir, sadece bir öncelik sırası verir.

## Testler ve yayın kontrolü

Node 20+ yeterli, `npm install` gerekmez:

```bash
npm test
```

```bash
npm run kontrol
```

`npm test` saat ayrıştırıcıyı, huniyi (taşıma, doğrulama, yedek birleştirme), site kontrol CSV içe aktarmayı, veri dönüştürmeyi ve ikon eşlemesini test eder. `npm run kontrol` index.html ve sw.js'in istediği her dosyanın var olduğunu, mutlak yol ya da CDN kullanılmadığını ve arayüzde emoji olmadığını doğrular.

## Yayınlama

### GitHub + Vercel (önerilen)

1. GitHub'da boş bir depo aç (README ekleme seçeneğini işaretleme).
2. Bu klasörü depoya gönder:

   ```bash
   git remote add origin https://github.com/<kullanici>/<depo>.git
   ```

   ```bash
   git push -u origin main
   ```

3. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → depoyu seç.
4. **Framework Preset: Other**. Build Command ve Output Directory boş kalsın. **Deploy**.

Bundan sonra `main`'e her push Vercel'de otomatik yayınlanır; GitHub Actions da her push'ta testleri ve yayın kontrolünü çalıştırır. `vercel.json` güvenlik başlıklarını (HSTS, X-Frame-Options, Permissions-Policy…) ekler; `.vercelignore` testleri, araçları ve geliştirme dosyalarını yayından çıkarır.

### Başka bir yer

Klasörün içeriğini herhangi bir statik sunucuya kopyalaman yeterli: Netlify, Cloudflare Pages, GitHub Pages, kendi sunucun ya da bir alt klasör (`ornek.com/semtim/`). Tüm yollar görelidir. Konum izni ve PWA için HTTPS gerekir.

**Yeni sürüm yayınlarken** `sw.js` içindeki `SURUM` değerini artır; kullanıcıların tarayıcısındaki eski kabuk önbelleği böylece yenilenir.

## İkonları yeniden üretme

İkon eklemek için `araclar/ikonlari-uret.mjs` içindeki `IKONLAR` listesine Lucide adını ekle, sonra:

```bash
npm i --no-save lucide-static@0.460.0
```

```bash
node araclar/ikonlari-uret.mjs node_modules/lucide-static/icons
```

## Web sitesi sağlık kontrolü (Python)

Tarayıcı, güvenlik nedeniyle başka sitelerin içeriğini okuyamaz. Bu yüzden “site açılıyor mu, SSL var mı, mobil uyumlu mu?” kontrolü bilgisayarında çalışan küçük bir araçla yapılır. Kurulum gerektirmez (Python 3.9+).

```bash
python3 araclar/semtim_kontrol.py semtim-kadikoy-kesif-2026-11-19.csv
```

```bash
python3 araclar/semtim_kontrol.py --url kahveduragi.com --url ornek.com.tr
```

Çıktı, aynı CSV'nin sonuna şu sütunları ekler: `site_durumu`, `https`, `ssl_gecerli`, `mobil_uyumlu`, `yukleme_ms`, `baslik`, `dijital_skor` (0–100) ve `notlar`.

| Dijital skor | Puan |
|---|---|
| Site açılıyor | 40 |
| HTTPS + geçerli SSL | 20 |
| Mobil uyumlu (viewport) | 20 |
| 3 saniyenin altında yükleniyor | 10 |
| Sayfa başlığı var | 10 |

Skoru 60'ın altında kalan siteler yenileme teklifi için iyi adaylardır.

## Kurallar ve atıf

- Harita ve veri: © [OpenStreetMap katkıcıları](https://www.openstreetmap.org/copyright), ODbL lisansı. Atıf haritada görünür halde kalmalı.
- Nominatim ve Overpass ücretsiz, gönüllü servislerdir. Önbelleği kapatma, otomatik tamamlama ekleme, toplu/otomatik sorgu atma.
- Harita karoları `tile.openstreetmap.org`'dan gelir. Trafik çok artarsa ücretsiz alternatif karo kaynaklarına geçilmeli.
- İşletmelere toplu SMS veya e-posta gönderecek olursan ticari ileti mevzuatına (İYS) ve KVKK'ya dikkat et.
- Üçüncü taraf lisansları: Leaflet (BSD-2), Leaflet.markercluster (MIT), Lucide (ISC), Plus Jakarta Sans (OFL). Lisans metinleri `vendor/` ve `fonts/` altında.

## Geliştirici

Semtim, [Arda Irmak](https://ardaportfoy.vercel.app/) tarafından tasarlanıp geliştirildi.

## Sonraki adımlar

- Huniyi birden fazla cihaz arasında eşitleme (şu an JSON yedek ile elle)
