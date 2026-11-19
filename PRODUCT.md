# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Derlemesiz statik site (HTML + CSS + klasik `<script>` dosyaları). Kullanıcının şartı: "yayınlayacağım zaman nereye koysam çalışsın". Bu yüzden build adımı, CDN bağımlılığı ve sunucu yok; tüm üçüncü taraf dosyalar `vendor/` altında, tüm yollar göreli. GitHub Pages, Netlify, Cloudflare Pages, herhangi bir alt klasör ya da `python -m http.server` ile aynı şekilde çalışır.

## Users

Birincil kullanıcı: dijital ajans, web tasarımcısı, freelancer ya da sahada çalışan satışçı. Belirli bir semtte web sitesi olmayan bağımsız işletmeleri müşteri adayı olarak bulur, arar/ziyaret eder ve sonucu takip eder. Masaüstünde planlar, telefonda sahada kullanır.

## Product Purpose

Seçilen noktanın 10 km çevresindeki işletmeleri OpenStreetMap'ten anlık çekip haritada gösterir; kayıtlı web sitesi olmayanları fırsat puanıyla sıralar ve kullanıcının bu adayları bir satış hunisinde takip etmesini sağlar. Başarı: kullanıcı bir semtte dakikalar içinde öncelikli bir arama/ziyaret listesi çıkarır ve sonuçlarını kaybetmeden takip eder.

## Positioning

Ücretsiz, anahtarsız, sunucusuz: veri OSM'den, kullanıcı verisi yalnızca tarayıcıda. Türkçe ve Türkiye'ye özgü (telefon, WhatsApp cep tespiti, Türkçe sektör eşlemesi).

## Operating Context

- Akış: semt ara / konum / haritaya tıkla, yarıçap seç, tara, Fırsatlar listesinden aday seç, ara/WhatsApp/yol tarifi, huniye işle, takip tarihi koy.
- CSV dışa aktarma Excel'de açılır; `araclar/semtim_kontrol.py` CSV'deki siteleri yerelde kontrol eder.
- Sahada telefon kullanımı: tek elle dokunma, güneş altında okunabilirlik.

## Capabilities and Constraints

- Overpass (yedek sunuculu), Nominatim (saniyede 1 istek, otomatik tamamlama yok), OSM karoları; atıf görünür kalmalı.
- Önbellek IndexedDB'de 7 gün; notlar/huni localStorage'da.
- Yeni: "şu an açık mı" (opening_hours), satış hunisi (aşama, not, takip tarihi, JSON yedek), PWA + açık/koyu tema.
- "Kayıtlı sitesi yok" OSM verisine dayanır; gerçeği garanti etmez. Bu dürüstlük korunmalı.

## Brand Commitments

- Ad: Semtim. Slogan: "Yakınındaki işletmeleri keşfet."
- Logo ve ikon: `img/semtim-logo.png`, `img/semtim-ikon.png` (lacivert konum iğnesi + mavi tenteli dükkân). Korunacak.
- Renk kimliği: lacivert `#0B1F3A`, mavi `#1E88E5`, açık mavi `#18B4F0`, krem `#FBF7EF`, fırsat turuncusu `#F57C00`. Kullanıcı "mevcut kimliği atma" dedi.
- Emoji yok; çizilmiş, tutarlı bir ikon sistemi kullanılır.

## Evidence on Hand

Gerçek müşteri, referans ya da istatistik yok; uydurulmamalı.

## Product Principles

1. Sahada hız: aday → aksiyon (ara, WhatsApp, yol) en fazla iki dokunuş.
2. Dürüst veri: OSM'nin bilmediğini bilmiyor gibi göster.
3. Gizlilik varsayılan: hiçbir kullanıcı verisi sunucuya gitmez.
4. Her yerde çalışır: build yok, CDN yok, göreli yollar.

## Accessibility & Inclusion

Klavye ile tam kullanım, görünür odak, WCAG AA kontrast, `prefers-reduced-motion` ve `prefers-color-scheme` desteği.
