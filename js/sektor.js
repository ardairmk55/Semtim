/* Semtim — OSM etiketlerini Türkçe sektörlere çevirir. */
window.Semtim = window.Semtim || {};

(function (S) {
  "use strict";

  // ikon: js/ikonlar.js içindeki Lucide ikon adı.
  // agirlik: bu sektörün web sitesi alma ihtimali (0-30). Fırsat puanında kullanılır.
  const SEKTOR = {
    kafe:      { ad: "Kafe",            ikon: "coffee", renk: "#8D6E63", agirlik: 18 },
    restoran:  { ad: "Restoran",        ikon: "utensils-crossed", renk: "#E53935", agirlik: 20 },
    firin:     { ad: "Fırın & Pastane", ikon: "croissant", renk: "#F9A825", agirlik: 14 },
    market:    { ad: "Market & Gıda",   ikon: "shopping-cart", renk: "#43A047", agirlik: 4 },
    berber:    { ad: "Berber",          ikon: "scissors", renk: "#3949AB", agirlik: 22 },
    kuafor:    { ad: "Kuaför",          ikon: "spray-can", renk: "#D81B60", agirlik: 26 },
    guzellik:  { ad: "Güzellik",        ikon: "sparkles", renk: "#EC407A", agirlik: 28 },
    dis:       { ad: "Diş Kliniği",     ikon: "smile", renk: "#00897B", agirlik: 30 },
    saglik:    { ad: "Sağlık",          ikon: "stethoscope", renk: "#00ACC1", agirlik: 26 },
    eczane:    { ad: "Eczane",          ikon: "pill", renk: "#2E7D32", agirlik: 3 },
    veteriner: { ad: "Veteriner & Pet", ikon: "paw-print", renk: "#6D4C41", agirlik: 24 },
    oto:       { ad: "Oto Servis",      ikon: "wrench", renk: "#546E7A", agirlik: 18 },
    butik:     { ad: "Giyim & Butik",   ikon: "shirt", renk: "#8E24AA", agirlik: 16 },
    emlak:     { ad: "Emlak",           ikon: "house", renk: "#1E88E5", agirlik: 24 },
    cicekci:   { ad: "Çiçekçi",         ikon: "flower-2", renk: "#7CB342", agirlik: 20 },
    optik:     { ad: "Optik",           ikon: "glasses", renk: "#5E35B1", agirlik: 16 },
    terzi:     { ad: "Terzi & Kuru Temizleme", ikon: "ruler", renk: "#795548", agirlik: 12 },
    konaklama: { ad: "Konaklama",       ikon: "bed-double", renk: "#0277BD", agirlik: 26 },
    spor:      { ad: "Spor Salonu",     ikon: "dumbbell", renk: "#F4511E", agirlik: 24 },
    egitim:    { ad: "Kurs & Eğitim",   ikon: "graduation-cap", renk: "#3F51B5", agirlik: 22 },
    usta:      { ad: "Usta & Zanaat",   ikon: "hammer", renk: "#6D4C41", agirlik: 16 },
    ofis:      { ad: "Ofis & Hizmet",   ikon: "briefcase", renk: "#455A64", agirlik: 18 },
    genel:     { ad: "Diğer Mağaza",    ikon: "shopping-bag", renk: "#78909C", agirlik: 10 },
  };

  // Overpass'te çekilecek işletmeler (hepsinin adı olmalı).
  const FILTRE = [
    'nwr["shop"]["name"]',
    'nwr["amenity"~"^(cafe|restaurant|fast_food|ice_cream|pub|bar|biergarten|food_court|dentist|clinic|doctors|pharmacy|veterinary|car_wash|car_rental|beauty|laundry|driving_school|language_school|music_school|training|kindergarten|childcare)$"]["name"]',
    'nwr["craft"]["name"]',
    'nwr["office"~"^(estate_agent|lawyer|accountant|insurance|travel_agent|architect|notary|tax_advisor|it|consulting|employment_agency)$"]["name"]',
    'nwr["healthcare"]["name"]',
    'nwr["tourism"~"^(hotel|guest_house|hostel|motel|apartment)$"]["name"]',
    'nwr["leisure"~"^(fitness_centre|sports_centre)$"]["name"]',
  ];

  // Haritada gösterilir ama "fırsat" listesine girmez (site almaları çok düşük ihtimal).
  const FIRSAT_DISI_SHOP = new Set(["vacant", "kiosk", "supermarket", "mall", "department_store", "lottery", "e-cigarette", "tobacco", "newsagent"]);
  // Hiç gösterilmez.
  const GIZLI_SHOP = new Set(["vacant"]);

  function sektorBul(t) {
    const shop = t.shop || "", amenity = t.amenity || "", craft = t.craft || "", office = t.office || "",
      health = t.healthcare || "", tourism = t.tourism || "", leisure = t.leisure || "";
    const ad = S.tr.trkKucuk(t.name || "");

    if (shop === "hairdresser") {
      if (t.male === "yes" || ["berber", "barber", "erkek kuaför"].some((k) => ad.includes(k))) return "berber";
      return "kuafor";
    }
    if (["beauty", "cosmetics", "massage", "perfumery"].includes(shop) || amenity === "beauty") return "guzellik";
    if (amenity === "cafe" || shop === "coffee" || shop === "tea") return "kafe";
    if (["restaurant", "fast_food", "ice_cream", "pub", "bar", "biergarten", "food_court"].includes(amenity)) return "restoran";
    if (["bakery", "pastry", "confectionery", "chocolate"].includes(shop)) return "firin";
    if (amenity === "dentist" || health === "dentist") return "dis";
    if (amenity === "pharmacy" || shop === "chemist" || health === "pharmacy") return "eczane";
    if (amenity === "veterinary" || ["pet", "pet_grooming"].includes(shop)) return "veteriner";
    if (["clinic", "doctors"].includes(amenity) || health) return "saglik";
    if (["car_repair", "car_parts", "tyres", "car", "motorcycle"].includes(shop) || ["car_wash", "car_rental"].includes(amenity) || craft === "car_repair") return "oto";
    if (["clothes", "shoes", "boutique", "fashion_accessories", "jewelry", "bag", "watches", "fabric"].includes(shop)) return "butik";
    if (office === "estate_agent" || shop === "estate_agent") return "emlak";
    if (["florist", "garden_centre"].includes(shop)) return "cicekci";
    if (shop === "optician") return "optik";
    if (["tailor", "dry_cleaning", "laundry"].includes(shop) || craft === "tailor" || amenity === "laundry") return "terzi";
    if (tourism) return "konaklama";
    if (leisure) return "spor";
    if (["driving_school", "language_school", "music_school", "training", "kindergarten", "childcare"].includes(amenity)) return "egitim";
    if (["supermarket", "convenience", "greengrocer", "butcher", "deli", "dairy", "seafood", "spices", "nuts", "beverages", "alcohol", "wine", "frozen_food", "farm", "health_food"].includes(shop)) return "market";
    if (craft) return "usta";
    if (office) return "ofis";
    return "genel";
  }

  S.sektor = { SEKTOR, FILTRE, FIRSAT_DISI_SHOP, GIZLI_SHOP, sektorBul };
})(window.Semtim);
