/* Testler için: tarayıcıdaki klasik <script> dosyalarını Node'da sahte bir window ile yükler.
   Uygulama derlemesiz çalıştığı için modüller window.Semtim'e takılır; burada da aynısı olur. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");

export function yukle(...dosyalar) {
  const window = {};
  const baglam = vm.createContext({ window, URL, Date, Math, JSON, Intl, console, DOMException: globalThis.DOMException });
  for (const d of dosyalar) {
    vm.runInContext(readFileSync(join(kok, "js", d), "utf8"), baglam, { filename: d });
  }
  return window.Semtim;
}

/** localStorage benzeri bellek içi depo. */
export function sahteDepo(baslangic = {}) {
  const m = new Map(Object.entries(baslangic));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    ham: m,
  };
}
