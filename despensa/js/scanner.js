// Escáner de códigos de barras: usa BarcodeDetector nativo (Android/Chrome) o ZXing como alternativa (iPhone, etc.)
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

export function openScanner(onCode) {
  const el = document.createElement('div');
  el.className = 'scanner';
  el.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="scan-top">
      <button class="icon-btn glass" data-close aria-label="Cerrar escáner">✕</button>
      <span class="scan-status">Apunta al código de barras</span>
    </div>
    <div class="scan-frame"><i></i></div>
    <form class="scan-manual">
      <input inputmode="numeric" placeholder="…o escribe el código" aria-label="Código de barras">
      <button class="btn primary">OK</button>
    </form>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));

  const video = el.querySelector('video');
  const statusEl = el.querySelector('.scan-status');
  let done = false;
  let stop = () => {};

  const close = () => {
    if (done) return;
    done = true;
    stop();
    el.classList.remove('open');
    setTimeout(() => el.remove(), 250);
  };
  const finish = code => {
    if (done) return;
    navigator.vibrate?.(60);
    close();
    onCode(code);
  };

  el.querySelector('[data-close]').onclick = close;
  el.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim();
    if (v) finish(v);
  };

  (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Sin cámara');
      if ('BarcodeDetector' in window) {
        const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
        const supported = await BarcodeDetector.getSupportedFormats();
        const detector = new BarcodeDetector({ formats: wanted.filter(f => supported.includes(f)) });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        stop = () => stream.getTracks().forEach(t => t.stop());
        if (done) return stop();
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (done) return;
          try {
            const [hit] = await detector.detect(video);
            if (hit) return finish(hit.rawValue);
          } catch { /* frame no listo */ }
          setTimeout(tick, 180);
        };
        tick();
      } else {
        const { BrowserMultiFormatReader } = await import(ZXING_URL);
        if (done) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } }, video,
          res => { if (res) finish(res.getText()); }
        );
        stop = () => controls.stop();
        if (done) stop();
      }
    } catch (err) {
      console.warn(err);
      statusEl.textContent = 'No se pudo abrir la cámara. Escribe el código abajo 👇';
      el.classList.add('no-cam');
    }
  })();
}

/** Busca el producto en Open Food Facts (base de datos abierta y gratuita). */
export async function lookupBarcode(code) {
  const fields = 'product_name,product_name_es,generic_name_es,brands,quantity,categories_tags';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const name = (p.product_name_es || p.product_name || p.generic_name_es || '').trim();
  if (!name) return null;
  return { name, brand: (p.brands || '').split(',')[0].trim(), quantity: p.quantity || '', cats: p.categories_tags || [] };
}
