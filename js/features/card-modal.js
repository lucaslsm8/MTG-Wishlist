/**
 * CardModal — modal central de detalhes da carta (estilo "Premium").
 * Três colunas: herói (imagem + setas de impressão), identidade (regras,
 * metadados, legalidades) e comércio (preços, lojas e histórico).
 * Global: window.CardModal
 *
 * PREÇOS: preço real do Scryfall (USD) convertido para BRL pela cotação de
 * Store.usdBrl (atualizada por ensureRate). O "Histórico de preços" é montado
 * a partir de amostras diárias reais salvas no navegador (localStorage).
 */
(function () {
  'use strict';

  const modal = () => document.getElementById('cardModal');

  const FINISH_LABEL = { nonfoil: 'Normal', foil: 'Foil ✨', etched: 'Etched Foil' };
  const FINISH_KEY = { nonfoil: 'usd', foil: 'usd_foil', etched: 'usd_etched' };

  const LEGAL_FORMATS = [
    ['standard', 'Standard'], ['pioneer', 'Pioneer'], ['modern', 'Modern'],
    ['legacy', 'Legacy'], ['vintage', 'Vintage'], ['commander', 'Commander'],
    ['brawl', 'Brawl'], ['pauper', 'Pauper'], ['penny', 'Penny']
  ];
  const LEGAL_LABEL = { legal: 'Legal', not_legal: 'Não legal', banned: 'Banida', restricted: 'Restrita' };

  const RANGES = [
    { key: '7D', days: 7 },
    { key: '30D', days: 30 },
    { key: '90D', days: 90 },
    { key: '1A', days: 365 }
  ];

  // Histórico de preços real, coletado ao longo do tempo no navegador.
  const HISTORY_KEY = 'mtg.priceHistory.v1';
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* quota */ }
  }
  /** Registra o preço atual (BRL) da carta na data de hoje — um ponto real por dia. */
  function recordPrice(card) {
    const value = +brl(basePriceUsd(card)).toFixed(2);
    if (!value) return;
    const h = loadHistory();
    const arr = h[card.id] || [];
    const today = new Date().toISOString().slice(0, 10);
    const last = arr[arr.length - 1];
    if (last && last.d === today) last.v = value;      // atualiza a amostra do dia
    else arr.push({ d: today, v: value });
    h[card.id] = arr.slice(-400);                       // limita o histórico
    saveHistory(h);
  }
  /** Pontos reais dentro da janela do range selecionado. */
  function historyFor(card, range) {
    const arr = (loadHistory()[card.id] || []);
    const cutoff = Date.now() - range.days * 86400000;
    return arr.filter(p => new Date(p.d + 'T00:00:00').getTime() >= cutoff);
  }

  /* ---------- Helpers ---------- */
  function close() {
    const m = modal();
    m.hidden = true;
    m.innerHTML = '';
    m.className = 'modal';
    document.body.style.overflow = '';
  }

  function priceUsd(card, finish) {
    return parseFloat(card.prices?.[FINISH_KEY[finish]]) || 0;
  }
  function basePriceUsd(card) {
    return priceUsd(card, 'nonfoil') || priceUsd(card, 'foil') || priceUsd(card, 'etched') || 0;
  }
  function brl(usd) { return usd * (Store.usdBrl?.rate || 5.4); }
  function fmtBrl(v) { return v ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'; }

  function colorsHtml(card) {
    const cols = card.colors || card.card_faces?.[0]?.colors || [];
    if (!cols.length) return { html: '{C}' };
    return { html: cols.map(c => `{${c}}`).join('') };
  }

  /* ---------- Colunas ---------- */

  function heroColumn(state) {
    const { el } = UI;
    const card = state.prints[state.idx] || state.card;
    const multi = state.prints.length > 1;

    const acquired = Store.isAcquired(card);

    const checkBtn = el('button', {
      class: 'tile-btn tile-btn-check' + (acquired ? ' is-on' : ''),
      title: acquired ? 'Marcada como adquirida' : 'Marcar como adquirida',
      'aria-pressed': String(acquired),
      onclick: (e) => {
        e.stopPropagation();
        const on = Store.toggleAcquired(card);
        checkBtn.classList.toggle('is-on', on);
        checkBtn.setAttribute('aria-pressed', String(on));
        hero.classList.toggle('is-acquired', on);
        UI.toast(on ? `${UI.displayName(card)} marcada como adquirida.` : `${UI.displayName(card)} desmarcada.`);
      }
    }, el('span', {}, '✓'));

    const hero = el('div', { class: 'cm-hero' + (acquired ? ' is-acquired' : '') },
      multi ? el('button', {
        class: 'cm-arrow cm-arrow-prev', 'aria-label': 'Impressão anterior',
        onclick: () => { state.idx = (state.idx - 1 + state.prints.length) % state.prints.length; (state.switch || state.render)(); }
      }, '‹') : null,
      el('div', { class: 'cm-hero-img' },
        UI.img({ src: UI.cardImage(card, 'large'), alt: card.name }),
        el('div', { class: 'card-tile-actions' },
          el('button', {
            class: 'tile-btn tile-btn-wish', title: 'Adicionar à wishlist',
            onclick: (e) => { e.stopPropagation(); WishlistPage.addCard(card); }
          }, el('span', {}, '+')),
          checkBtn
        )
      ),
      multi ? el('button', {
        class: 'cm-arrow cm-arrow-next', 'aria-label': 'Próxima impressão',
        onclick: () => { state.idx = (state.idx + 1) % state.prints.length; (state.switch || state.render)(); }
      }, '›') : null
    );

    // Faixa de miniaturas das impressões
    let strip = null;
    if (multi) {
      strip = el('div', { class: 'cm-thumbs' },
        state.prints.map((p, i) => el('button', {
          class: 'cm-thumb' + (i === state.idx ? ' current' : ''),
          title: `${p.set_name} · #${p.collector_number}`,
          onclick: () => { if (i === state.idx) return; state.idx = i; (state.switch || state.render)(); }
        }, UI.img({ src: UI.cardImage(p, 'small'), alt: p.set_name, loading: 'lazy' })))
      );
    }

    return el('div', { class: 'cm-col cm-col-hero' },
      hero,
      strip,
      el('div', { class: 'cm-print-count' },
        multi ? `${state.prints.length} impressões desta carta` : '1 impressão')
    );
  }

  function metaRow(label, valueNode) {
    const { el } = UI;
    return [el('dt', {}, label), el('dd', {}, valueNode)];
  }

  function identityColumn(state, setIconUri) {
    const { el } = UI;
    const card = state.prints[state.idx] || state.card;
    const faces = card.card_faces?.length ? card.card_faces : [card];
    const front = faces[0];

    // Nome + custo + tipo + regras + flavor (por face)
    const rulesNodes = [];
    faces.forEach((face, i) => {
      if (i > 0) rulesNodes.push(el('hr', { class: 'cm-face-divider' }));
      rulesNodes.push(el('div', { class: 'cm-rules-title' },
        el('span', {}, face.printed_name || face.name),
        face.mana_cost ? el('span', { class: 'mana-cost', html: UI.manaHtml(face.mana_cost) }) : null));
      if (face.type_line) rulesNodes.push(el('div', { class: 'cm-rules-type' }, face.printed_type_line || face.type_line));
      if (face.oracle_text) {
        const box = el('div', { class: 'cm-rules-oracle' });
        (face.printed_text || face.oracle_text).split('\n').forEach(line => {
          if (line.trim()) box.append(el('p', { class: 'cm-oracle-p', html: UI.manaHtml(line) }));
        });
        rulesNodes.push(box);
      }
      if (face.flavor_text) rulesNodes.push(el('div', { class: 'cm-rules-flavor' }, face.flavor_text));
    });

    // Metadados
    const meta = el('dl', { class: 'cm-meta' });
    meta.append(...metaRow('Raridade',
      el('span', { class: `cm-rarity rarity-${card.rarity}` }, UI.rarityLabel(card.rarity))));
    meta.append(...metaRow('Número', `#${card.collector_number}`));
    meta.append(...metaRow('Coleção',
      el('span', { class: 'cm-set' },
        setIconUri ? el('img', { class: 'set-inline-icon', src: setIconUri, alt: '' }) : null,
        ` ${card.set_name} (${card.set.toUpperCase()})`)));
    if (card.artist) meta.append(...metaRow('Artista', card.artist));
    meta.append(...metaRow('Idioma', (card.lang || 'en').toUpperCase()));
    if (front.type_line) meta.append(...metaRow('Tipo', front.printed_type_line || front.type_line));
    if (front.power != null && front.toughness != null)
      meta.append(...metaRow('Poder / Resistência', `${front.power} / ${front.toughness}`));
    else if (front.loyalty != null)
      meta.append(...metaRow('Lealdade', String(front.loyalty)));
    meta.append(...metaRow('Cores', el('span', { class: 'mana-cost cm-colors', html: UI.manaHtml(colorsHtml(card).html) })));

    // Legalidades
    const legal = card.legalities || {};
    const legalGrid = el('div', { class: 'cm-legal-grid' },
      LEGAL_FORMATS.map(([key, label]) => {
        const status = legal[key] || 'not_legal';
        return el('div', { class: `cm-legal cm-legal-${status}` },
          el('span', { class: 'cm-legal-fmt' }, label),
          el('span', { class: 'cm-legal-tag' }, LEGAL_LABEL[status] || status));
      })
    );

    return el('div', { class: 'cm-col cm-col-id' },
      el('div', { class: 'cm-rules' }, ...rulesNodes),
      meta,
      el('h4', { class: 'cm-section-title' }, 'Legalidades'),
      legalGrid
    );
  }

  function commerceColumn(state) {
    const { el } = UI;
    const card = state.prints[state.idx] || state.card;
    const finishes = card.finishes || ['nonfoil'];

    // Registra o preço de hoje (histórico real cresce a cada visita).
    recordPrice(card);

    // PREÇOS por acabamento
    const priceCards = finishes.map((finish, i) => {
      const usd = priceUsd(card, finish);
      return el('button', {
        class: 'cm-price-card' + (i === 0 ? ' primary' : ''),
        title: `Adicionar ${FINISH_LABEL[finish] || finish} à wishlist`,
        onclick: () => WishlistPage.addCard(card, { finish })
      },
        el('span', { class: 'cm-price-label' },
          i === 0 ? el('span', { class: 'cm-price-star' }, '★') : null,
          FINISH_LABEL[finish] || finish),
        el('span', { class: 'cm-price-value' + (i === 2 ? ' etched' : '') }, fmtBrl(brl(usd)))
      );
    });

    // COMPRAR — preço de referência real (Scryfall→BRL) + busca na LigaMagic
    const baseUsd = basePriceUsd(card);
    const base = brl(baseUsd) || 0;
    const ligaUrl = `https://www.ligamagic.com.br/?view=cards/card&card=${encodeURIComponent(card.name)}`;
    const buyBlock = el('div', { class: 'cm-buy' },
      el('div', { class: 'cm-buy-ref' },
        el('span', { class: 'cm-buy-ref-label' }, 'Preço de referência'),
        el('span', { class: 'cm-buy-ref-value' }, fmtBrl(base)),
        baseUsd
          ? el('span', { class: 'cm-buy-ref-sub' }, `≈ US$ ${baseUsd.toFixed(2).replace('.', ',')} · fonte Scryfall`)
          : null
      ),
      el('a', {
        class: 'cm-buy-liga', href: ligaUrl, target: '_blank', rel: 'noopener',
        title: `Buscar ${card.name} na LigaMagic`
      },
        el('span', {}, 'Buscar na LigaMagic'),
        el('span', { class: 'cm-buy-liga-go', 'aria-hidden': 'true' }, '›'))
    );

    // HISTÓRICO — gráfico com dados reais (amostras diárias) e abas de período
    let activeRange = RANGES[1]; // 30D
    const chartHost = el('div', { class: 'cm-chart-host' });
    const statAvg = el('span', { class: 'cm-chart-stat-val' }, '—');
    const statVar = el('span', { class: 'cm-chart-stat-val' }, '—');

    function drawChart() {
      const points = historyFor(card, activeRange);
      const series = points.map(p => p.v);

      // Sem dados suficientes ainda: estado de coleta.
      if (series.length < 2) {
        const now = brl(basePriceUsd(card));
        chartHost.innerHTML =
          `<div class="cm-chart-empty">
             <span class="cm-chart-empty-price">${fmtBrl(now)}</span>
             <span class="cm-chart-empty-hint">Coletando histórico — o gráfico se preenche conforme você acompanha esta carta.</span>
           </div>`;
        statAvg.textContent = fmtBrl(now);
        statVar.textContent = '—';
        statVar.className = 'cm-chart-stat-val';
        return;
      }

      const W = 280, H = 96, pad = 8;
      const min = Math.min(...series), max = Math.max(...series);
      const span = (max - min) || 1;
      const n = series.length;
      const x = (i) => pad + (n === 1 ? (W - pad * 2) / 2 : (i / (n - 1)) * (W - pad * 2));
      const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
      const line = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const area = `${x(0)},${H - pad} ${line} ${x(n - 1)},${H - pad}`;

      const iMax = series.indexOf(max), iMin = series.indexOf(min);
      const marker = (i, v, cls) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" class="cm-dot ${cls}"/>`;
      const dots = min !== max ? marker(iMax, max, 'hi') + marker(iMin, min, 'lo') : '';

      chartHost.innerHTML =
        `<svg viewBox="0 0 ${W} ${H}" class="cm-chart" preserveAspectRatio="none" role="img" aria-label="Histórico de preços">
           <defs><linearGradient id="cmGrad" x1="0" x2="0" y1="0" y2="1">
             <stop offset="0" stop-color="var(--accent-2)" stop-opacity=".35"/>
             <stop offset="1" stop-color="var(--accent-2)" stop-opacity="0"/>
           </linearGradient></defs>
           <polygon points="${area}" fill="url(#cmGrad)"/>
           <polyline points="${line}" fill="none" stroke="var(--accent-2)" stroke-width="2"
             stroke-linejoin="round" stroke-linecap="round"/>
           ${dots}
         </svg>
         <div class="cm-chart-extremes">
           <span class="cm-ext lo">Menor ${fmtBrl(min)}</span>
           <span class="cm-ext hi">Maior ${fmtBrl(max)}</span>
         </div>`;

      const avg = series.reduce((a, b) => a + b, 0) / n;
      const pct = ((series[n - 1] - series[0]) / (series[0] || 1)) * 100;
      statAvg.textContent = fmtBrl(avg);
      statVar.textContent = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`;
      statVar.className = 'cm-chart-stat-val ' + (pct >= 0 ? 'up' : 'down');
    }

    const tabs = el('div', { class: 'cm-chart-tabs' },
      RANGES.map(r => {
        const b = el('button', {
          class: 'cm-chart-tab' + (r.key === activeRange.key ? ' active' : ''),
          onclick: () => {
            activeRange = r;
            tabs.querySelectorAll('.cm-chart-tab').forEach(t => t.classList.remove('active'));
            b.classList.add('active');
            drawChart();
          }
        }, r.key);
        return b;
      })
    );

    const col = el('div', { class: 'cm-col cm-col-buy' },
      el('div', { class: 'cm-block' },
        el('h4', { class: 'cm-section-title' }, 'Preços ', el('span', { class: 'cm-updown' }, '↗')),
        el('div', { class: 'cm-price-cards' }, priceCards)),

      el('div', { class: 'cm-block' },
        el('h4', { class: 'cm-section-title' }, 'Comprar'),
        buyBlock),

      el('div', { class: 'cm-block' },
        el('h4', { class: 'cm-section-title' }, 'Histórico de preços'),
        tabs,
        chartHost,
        el('div', { class: 'cm-chart-stats' },
          el('div', { class: 'cm-chart-stat' },
            el('span', { class: 'cm-chart-stat-label' }, 'Preço médio'), statAvg),
          el('div', { class: 'cm-chart-stat' },
            el('span', { class: 'cm-chart-stat-label' }, 'Variação'), statVar)))
    );

    // desenha após montar
    setTimeout(drawChart, 0);
    return col;
  }

  /* ---------- API ---------- */
  const CardModal = {
    async open(card) {
      const m = modal();
      const { el } = UI;
      m.innerHTML = '';
      m.className = 'modal cm-overlay';
      m.hidden = false;
      document.body.style.overflow = 'hidden';

      const content = el('div', { class: 'cm-content' });
      const panel = el('div', { class: 'cm-panel' },
        el('button', { class: 'cm-close', onclick: close, 'aria-label': 'Fechar' }, '✕'),
        content
      );
      m.append(panel);
      m.onclick = (e) => { if (e.target === m) close(); };

      // Estado do modal (impressão atual + render)
      const state = { card, prints: [card], idx: 0, render: null };

      let setIconUri = null;
      const setIcons = {};

      // Monta o conteúdo atual dentro de um wrapper (permite crossfade).
      function paint() {
        const current = state.prints[state.idx] || state.card;
        const icon = setIcons[current.set] || null;
        content.innerHTML = '';
        content.append(
          heroColumn(state),
          identityColumn(state, icon),
          commerceColumn(state)
        );
      }

      // render: repinta sem animação (carga inicial / dados progressivos).
      state.render = paint;

      // switch: troca de impressão com um crossfade suave.
      let switching = false;
      state.switch = () => {
        if (switching) return;
        switching = true;
        content.classList.add('cm-switching');
        setTimeout(() => {
          paint();
          requestAnimationFrame(() => content.classList.remove('cm-switching'));
          switching = false;
        }, 150);
      };

      // Primeira renderização (com a carta recebida)
      paint();

      // Ícones das expansões + todas as impressões (progressivo)
      try {
        const sets = await Scryfall.sets();
        sets.forEach(s => { setIcons[s.code] = s.icon_svg_uri; });
        setIconUri = setIcons[card.set] || null;
      } catch { /* opcional */ }

      try {
        const prints = await Scryfall.prints(card.name);
        if (prints.length) {
          const idx = Math.max(0, prints.findIndex(p => p.id === card.id));
          state.prints = prints;
          state.idx = idx === -1 ? 0 : idx;
        }
      } catch { /* mantém a carta única */ }

      state.render();
    },

    close
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal().hidden) close();
  });

  window.CardModal = CardModal;
})();
