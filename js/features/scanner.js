/**
 * CardScanner — escaneia uma carta física pela câmera e a adiciona à coleção.
 *
 * Estratégia (grátis, 100% no navegador, sem chave de API):
 *  1. getUserMedia mostra a câmera com um guia no formato da carta.
 *  2. Ao capturar, recorta só a FAIXA DO TÍTULO (onde fica o nome) do quadro,
 *     aplica realce de contraste e roda OCR com Tesseract.js (carregado sob
 *     demanda via CDN — só quando você usa o scanner pela 1ª vez).
 *  3. O texto reconhecido é resolvido na Scryfall por busca fuzzy (tolerante a
 *     erros de OCR). A carta encontrada é confirmada por você antes de entrar.
 *  4. Dá pra escanear várias cartas em sequência.
 *
 * Global: window.CardScanner
 */
(function () {
  'use strict';

  const { el } = UI;
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  // Regiões de interesse, em fração da carta (proporção 63x88mm ≈ 0.716).
  const CARD_ASPECT = 63 / 88;
  const CARD_FRAC = 0.82;                 // altura da carta = 82% da altura do vídeo
  const TITLE = { x: 0.055, y: 0.042, w: 0.74, h: 0.082 };   // nome (topo)
  const BOTTOM = { x: 0.045, y: 0.902, w: 0.54, h: 0.085 };  // nº coletor + edição (rodapé esq.)
  const LANGS = new Set(['EN', 'FR', 'DE', 'IT', 'ES', 'PT', 'JA', 'KO', 'RU', 'ZH', 'PH']);

  /* ---------- Carregamento sob demanda do Tesseract ---------- */
  let tessPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (tessPromise) return tessPromise;
    tessPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = resolve;
      s.onerror = () => { tessPromise = null; reject(new Error('Falha ao baixar o leitor de texto (offline?).')); };
      document.head.appendChild(s);
    });
    return tessPromise;
  }

  let worker = null;
  async function getWorker() {
    await loadTesseract();
    if (worker) return worker;
    worker = await Tesseract.createWorker('eng');
    return worker;
  }

  /* ---------- Recorte + pré-processamento de uma região da carta ---------- */
  // zoom = fator de zoom DIGITAL aplicado (1 quando o zoom é nativo/óptico da
  // câmera, pois nesse caso o quadro já vem ampliado).
  function cropRegion(video, zoom, region, opts = {}) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const cardH = (vh / zoom) * CARD_FRAC;
    const cardW = cardH * CARD_ASPECT;
    const cardX = (vw - cardW) / 2;
    const cardY = (vh - cardH) / 2;

    const sx = cardX + cardW * region.x;
    const sy = cardY + cardH * region.y;
    const sw = cardW * region.w;
    const sh = cardH * region.h;

    const scale = opts.scale || 3;
    const c = document.createElement('canvas');
    c.width = Math.round(sw * scale);
    c.height = Math.round(sh * scale);
    const ctx = c.getContext('2d');
    // O rodapé costuma ser texto claro sobre fundo escuro → inverte.
    ctx.filter = opts.invert
      ? 'grayscale(1) invert(1) contrast(1.8) brightness(1.05)'
      : 'grayscale(1) contrast(1.75) brightness(1.06)';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }

  async function ocr(canvas, mode) {
    const w = await getWorker();
    if (mode === 'bottom') {
      await w.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ',
        tessedit_pageseg_mode: '6' // bloco com poucas linhas
      });
    } else {
      await w.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,.'-",
        tessedit_pageseg_mode: '7' // uma única linha
      });
    }
    const { data } = await w.recognize(canvas);
    return data.text || '';
  }

  /** Extrai o candidato mais provável a nome de carta do texto do OCR. */
  function cleanName(text) {
    const line = (text || '')
      .split('\n').map(s => s.trim()).filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || '';
    return line.replace(/[^A-Za-z ,'\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Extrai número de coletor e código da edição do rodapé (best-effort). */
  function parseBottom(text) {
    const up = (text || '').toUpperCase().replace(/[^A-Z0-9/ \n]/g, ' ');
    let number = '';
    const frac = up.match(/(\d{1,4})\s*\/\s*\d{1,4}/);       // "123/456"
    if (frac) number = String(parseInt(frac[1], 10));
    else { const n = up.match(/\b0*(\d{1,4})\b/); if (n) number = String(parseInt(n[1], 10)); }

    let set = '';
    const tokens = up.match(/\b[A-Z0-9]{3,5}\b/g) || [];
    for (const t of tokens) {
      if (!LANGS.has(t) && !/^\d+$/.test(t)) { set = t.toLowerCase(); break; }
    }
    return { set, number };
  }

  /**
   * Junta todos os sinais (edição+número, nome fuzzy, busca por nome,
   * autocomplete) numa lista de cartas candidatas, sem duplicar, priorizando
   * a impressão exata pela edição+número.
   */
  async function gatherCandidates(nameGuess, parsed) {
    const byOracle = new Map();
    const add = (card, score) => {
      if (!card || !card.id) return;
      const key = card.oracle_id || card.id;
      const prev = byOracle.get(key);
      if (!prev || score > prev.score) byOracle.set(key, { card, score });
    };

    // 1. Impressão exata pela edição + número (sinal mais forte)
    if (parsed.set && parsed.number) {
      try { add(await Scryfall.bySetNumber(parsed.set, parsed.number), 100); } catch { /* ignora */ }
    }

    if (nameGuess && nameGuess.length >= 2) {
      // 2. Melhor correspondência fuzzy do nome
      try { add(await Scryfall.named(nameGuess), 60); } catch { /* ignora */ }
      // 3. Busca por nome → várias candidatas
      try {
        const res = await Scryfall.search(nameGuess, { unique: 'cards', order: 'name' });
        res.cards.slice(0, 8).forEach((c, i) => add(c, 45 - i));
      } catch { /* ignora */ }
      // 4. Autocomplete como rede de segurança (só se ainda temos poucas)
      if (byOracle.size < 3) {
        try {
          const names = await Scryfall.autocomplete(nameGuess);
          for (const n of names.slice(0, 3)) {
            try { add(await Scryfall.named(n), 30); } catch { /* ignora */ }
          }
        } catch { /* ignora */ }
      }
    }

    return [...byOracle.values()].sort((a, b) => b.score - a.score).map(x => x.card).slice(0, 8);
  }

  /* ---------- Modal ---------- */
  const modalEl = () => document.getElementById('scanModal');
  let stream = null;

  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  function close() {
    stopCamera();
    const m = modalEl();
    m.hidden = true; m.innerHTML = '';
    if (document.getElementById('cardModal').hidden) document.body.style.overflow = '';
  }

  async function open() {
    const m = modalEl();
    m.innerHTML = ''; m.hidden = false;
    document.body.style.overflow = 'hidden';

    const video = el('video', { class: 'scan-video', autoplay: '', playsinline: '', muted: '' });
    video.muted = true;

    const guide = el('div', { class: 'scan-guide' }, el('div', { class: 'scan-guide-title' }, 'nome'));
    const stage = el('div', { class: 'scan-stage' }, video, guide);
    const status = el('div', { class: 'scan-status' }, 'Aproxime a carta e use o zoom até o nome preencher a faixa destacada.');
    const resultBox = el('div', { class: 'scan-result', hidden: '' });

    // Controle de zoom (nativo da câmera quando houver; senão, digital)
    const zoomSlider = el('input', {
      type: 'range', class: 'scan-zoom', min: '1', max: '4', step: '0.05', value: '1',
      'aria-label': 'Zoom', disabled: ''
    });
    const zoomVal = el('span', { class: 'scan-zoom-val' }, '1,0×');
    const zoomRow = el('div', { class: 'scan-zoom-row' },
      el('button', { class: 'scan-zoom-btn', 'aria-label': 'Menos zoom', onclick: () => nudgeZoom(-1) }, '−'),
      zoomSlider,
      el('button', { class: 'scan-zoom-btn', 'aria-label': 'Mais zoom', onclick: () => nudgeZoom(1) }, '+'),
      zoomVal
    );

    const captureBtn = el('button', { class: 'btn btn-primary scan-capture', onclick: () => capture() }, '📸 Capturar');
    const manualBtn = el('button', {
      class: 'btn btn-secondary',
      onclick: () => { close(); if (window.CollectionPage) CollectionPage.focusSearch(); }
    }, '🔍 Buscar pelo nome');

    const sheet = el('div', { class: 'scan-sheet' },
      el('div', { class: 'modal-head' },
        el('h2', {}, '📷 Escanear carta'),
        el('button', { class: 'modal-close', onclick: close, 'aria-label': 'Fechar' }, '✕')),
      stage,
      zoomRow,
      status,
      el('div', { class: 'scan-actions' }, captureBtn, manualBtn),
      resultBox
    );
    m.append(sheet);
    m.onclick = (e) => { if (e.target === m) close(); };

    /* ---------- Zoom (nativo ou digital) ---------- */
    let digitalZoom = 1;         // fator aplicado quando NÃO há zoom nativo
    let zoomMin = 1, zoomMax = 4, zoomStep = 0.05, nativeTrack = null;

    function applyZoom(z) {
      z = Math.max(zoomMin, Math.min(zoomMax, z));
      zoomSlider.value = String(z);
      zoomVal.textContent = z.toFixed(1).replace('.', ',') + '×';
      if (nativeTrack) {
        digitalZoom = 1;
        nativeTrack.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {});
      } else {
        digitalZoom = z;
        video.style.transform = `translate(-50%, -50%) scale(${z})`;
      }
    }
    function nudgeZoom(dir) { applyZoom(parseFloat(zoomSlider.value) + dir * (zoomStep * 4)); }
    zoomSlider.addEventListener('input', () => applyZoom(parseFloat(zoomSlider.value)));

    // Pinça de dois dedos (celular)
    let pinchStart = 0, pinchZoom = 1;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) { pinchStart = dist(e.touches); pinchZoom = parseFloat(zoomSlider.value); }
    }, { passive: true });
    stage.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStart) {
        e.preventDefault();
        applyZoom(pinchZoom * (dist(e.touches) / pinchStart));
      }
    }, { passive: false });

    // Ajusta a proporção do palco à do vídeo (o guia em % mapeia direto nos pixels)
    video.addEventListener('loadedmetadata', () => {
      if (video.videoWidth) stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    });

    // Abre a câmera (traseira quando disponível)
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      video.srcObject = stream;
    } catch (err) {
      captureBtn.disabled = true;
      status.classList.add('scan-status-error');
      status.textContent = err && err.name === 'NotAllowedError'
        ? 'Permissão de câmera negada. Libere o acesso à câmera no navegador e tente de novo.'
        : 'Não consegui acessar a câmera. Em file:// a câmera pode ser bloqueada — use https (ex.: GitHub Pages) ou um servidor local.';
      return;
    }

    // Configura o zoom: nativo (óptico/sensor) quando a câmera expõe; senão, digital.
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps && caps.zoom && caps.zoom.max > caps.zoom.min) {
        nativeTrack = track;
        zoomMin = caps.zoom.min; zoomMax = caps.zoom.max;
        zoomStep = caps.zoom.step || (zoomMax - zoomMin) / 40;
        const cur = (track.getSettings && track.getSettings().zoom) || zoomMin;
        Object.assign(zoomSlider, { min: String(zoomMin), max: String(zoomMax), step: String(zoomStep), value: String(cur) });
      } else {
        zoomMin = 1; zoomMax = 4; zoomStep = 0.05;
        Object.assign(zoomSlider, { min: '1', max: '4', step: '0.05', value: '1' });
      }
      zoomSlider.disabled = false;
      applyZoom(parseFloat(zoomSlider.value));
    } catch { /* zoom indisponível: segue sem */ }

    async function capture() {
      if (!video.videoWidth) { status.textContent = 'A câmera ainda está iniciando…'; return; }
      resultBox.hidden = true;
      captureBtn.disabled = true;
      status.classList.remove('scan-status-error');
      status.textContent = window.Tesseract ? 'Reconhecendo a carta…' : 'Preparando o leitor de texto (só na 1ª vez)…';

      try {
        await getWorker();

        // 1. Nome (topo)
        status.textContent = 'Lendo o nome…';
        const nameGuess = cleanName(await ocr(cropRegion(video, digitalZoom, TITLE), 'title'));

        // 2. Edição + número (rodapé) — best-effort, não quebra se falhar
        let parsed = { set: '', number: '' };
        try {
          status.textContent = 'Lendo edição e número…';
          parsed = parseBottom(await ocr(cropRegion(video, digitalZoom, BOTTOM, { invert: true }), 'bottom'));
        } catch { /* segue só com o nome */ }

        // 3. Junta os sinais em candidatas
        status.textContent = 'Buscando possíveis cartas…';
        const candidates = await gatherCandidates(nameGuess, parsed);
        if (!candidates.length) throw new Error('sem correspondência');
        showCandidates(candidates, { nameGuess, parsed });
      } catch (e) {
        status.classList.add('scan-status-error');
        status.textContent = 'Não consegui identificar. Melhore a luz e o zoom (o nome deve preencher a faixa) e tente de novo.';
      } finally {
        captureBtn.disabled = false;
      }
    }

    function addCandidate(card) {
      const added = Store.acquireCard(card);
      UI.toast(added
        ? `💎 ${UI.displayName(card)} adicionada à coleção`
        : `${UI.displayName(card)} já estava na coleção`);
      resultBox.hidden = true;
      status.textContent = '✅ Adicionada! Enquadre a próxima carta e capture.';
    }

    function showCandidates(cards, info) {
      status.textContent = '';
      resultBox.hidden = false;
      resultBox.innerHTML = '';

      const read = [];
      if (info.nameGuess) read.push(`nome “${info.nameGuess}”`);
      if (info.parsed.set) read.push(`edição ${info.parsed.set.toUpperCase()}`);
      if (info.parsed.number) read.push(`nº ${info.parsed.number}`);

      const grid = el('div', { class: 'scan-cand-grid' });
      cards.forEach(card => {
        grid.append(el('button', {
          class: 'scan-cand', title: `Adicionar ${UI.displayName(card)}`,
          onclick: () => addCandidate(card)
        },
          UI.img({ class: 'scan-cand-img', src: UI.cardImage(card, 'small'), alt: '', loading: 'lazy' }),
          el('span', { class: 'scan-cand-name', title: card.name }, UI.displayName(card)),
          el('span', { class: 'scan-cand-set' }, `${card.set.toUpperCase()} · #${card.collector_number}`)
        ));
      });

      resultBox.append(
        el('div', { class: 'scan-cand-head' },
          el('span', { class: 'scan-cand-title' }, cards.length > 1 ? 'Qual é a sua carta?' : 'É esta carta?'),
          read.length ? el('span', { class: 'scan-cand-read' }, 'Li: ' + read.join(' · ')) : null),
        grid,
        el('button', {
          class: 'btn btn-ghost btn-sm scan-cand-none',
          onclick: () => { resultBox.hidden = true; status.textContent = 'Enquadre a carta e capture de novo.'; }
        }, 'Nenhuma dessas — tentar de novo')
      );
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl().hidden) close();
  });

  window.CardScanner = { open, close };
})();
