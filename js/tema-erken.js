/* Semtim — tema, ilk boyamadan önce uygulanır (yanıp sönmeyi önler). <head> içinde senkron yüklenir.
   Tercih: "sistem" (varsayılan) | "acik" | "koyu"; localStorage "semtim:tema". */
(function () {
  "use strict";
  var tercih = "sistem";
  try { tercih = localStorage.getItem("semtim:tema") || "sistem"; } catch (e) { /* depolama kapalı */ }
  var koyu = tercih === "koyu" || (tercih === "sistem" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = koyu ? "dark" : "light";
  document.documentElement.dataset.temaTercih = tercih;
})();
