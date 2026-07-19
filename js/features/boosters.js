/**
 * BoostersPage — análise unificada: pesquise uma carta e veja em quais
 * boosters ela aparece, com probabilidade e custo médio por tentativa.
 * Preços de booster são editáveis (clique no valor) e ficam salvos.
 * Global: window.BoostersPage
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const rarityCountCache = new Map();
  const specialPoolCache = new Map();
  let setsByCode = null;
  let lastAnalyzed = null;

  /* ---------- Dados ---------- */
  async function getSetsByCode() {
    if (setsByCode) return setsByCode;
    const sets = await Scryfall.sets();
    setsByCode = Object.fromEntries(sets.map(s => [s.code, s]));
    return setsByCode;
  }

  /** Quais raridades precisam ser contadas para calcular a chance da carta.
   *  (O slot de rara/mítica depende de R e M juntos; comuns/incomuns só de si.) */
  function neededRarities(rarity) {
    if (rarity === 'rare' || rarity === 'mythic') return ['rare', 'mythic'];
    if (rarity === 'common' || rarity === 'uncommon') return [rarity];
    return ['common', 'uncommon', 'rare', 'mythic']; // special/bonus: fallback
  }

  /** Contagem de cartas por raridade num set (só as raridades necessárias). */
  async function rarityCounts(setCode, rarities) {
    const cached = rarityCountCache.get(setCode) || {};
    const counts = { common: 0, uncommon: 0, rare: 0, mythic: 0, ...cached };
    for (const rarity of rarities) {
      if (cached[rarity] != null) continue;
      const res = await Scryfall.search(`set:${setCode} r:${rarity} is:booster`, { unique: 'cards' });
      counts[rarity] = res.total
        || (await Scryfall.search(`set:${setCode} r:${rarity}`, { unique: 'cards' })).total;
      cached[rarity] = counts[rarity];
    }
    rarityCountCache.set(setCode, cached);
    return counts;
  }

  /** Pool de versões especiais raras/míticas do set (para o Collector). */
  async function specialPoolSize(setCode) {
    if (specialPoolCache.has(setCode)) return specialPoolCache.get(setCode);
    const res = await Scryfall.search(
      `set:${setCode} r>=rare (border:borderless or frame:showcase or frame:extendedart or frame:etched)`,
      { unique: 'prints' }
    );
    specialPoolCache.set(setCode, res.total || 0);
    return res.total || 0;
  }

  /* ---------- Análise ---------- */
  async function analyze(name) {
    if (!name) return;
    const results = $('boosterResults');
    const empty = $('boosterEmpty');
    const { el } = UI;
    empty.hidden = true;
    results.innerHTML = '';
    results.append(el('div', { class: 'status-area' },
      el('div', { class: 'loader' }, el('div', { class: 'spinner' }), ' Analisando boosters…')));

    let card = null;
    try {
      card = await Scryfall.named(name);
      if (!card) {
        results.innerHTML = '';
        results.append(el('div', { class: 'empty-state' },
          el('img', { src: 'assets/cogu.png', class: 'empty-mascot', alt: '' }),
          el('h3', {}, 'Carta não encontrada'),
          el('p', {}, 'Confira o nome e tente novamente (português ou inglês).')));
        return;
      }
      lastAnalyzed = card.name;
      const prints = await Scryfall.prints(card.name);
      const sets = await getSetsByCode();

      // Agrupa impressões por set, ignorando sets digitais
      const bySet = new Map();
      for (const p of prints) {
        const set = sets[p.set];
        if (!set || set.digital) continue;
        if (!bySet.has(p.set)) bySet.set(p.set, []);
        bySet.get(p.set).push(p);
      }

      const blocks = [];
      let best = null;

      for (const [code, setPrints] of bySet) {
        const set = sets[code];
        const types = BoosterData.boosterTypesForSet(set);
        if (!types.length) continue;
        const inAnyBooster = setPrints.some(p => p.booster !== false)
          || setPrints.some(p => BoosterData.availableIn(p, types).length);
        if (!inAnyBooster) continue;

        const mainPrint = setPrints.find(p => p.booster !== false) || setPrints[0];
        const counts = await rarityCounts(code, neededRarities(mainPrint.rarity));
        const specialPrints = setPrints.filter(p => UI.treatmentLabel(p));
        const collectorOnly = mainPrint.booster === false;

        const rows = [];
        for (const type of types) {
          if (collectorOnly && type !== 'collector') continue;
          const prob = BoosterData.probability(type, mainPrint.rarity, counts);
          rows.push(makeRow(type, prob, set, mainPrint));
        }

        // Linha extra: versões especiais desta carta no Collector Booster
        if (specialPrints.length && types.includes('collector')) {
          const pool = await specialPoolSize(code);
          const prob = BoosterData.specialProbability(pool) * specialPrints.length;
          if (prob > 0) rows.push(makeRow('collector-special', Math.min(prob, 1), set, specialPrints[0]));
        }

        for (const r of rows) {
          if (r.prob > 0 && (!best || r.costPerHit < best.costPerHit)) best = r;
        }
        if (rows.length) blocks.push({ set, rows });
      }

      renderAnalysis(card, blocks, best);
    } catch (err) {
      console.error(err);
      results.innerHTML = '';
      const isRate = /429/.test(String(err && err.message));
      results.append(el('div', { class: 'empty-state' },
        el('img', { src: 'assets/cogu.png', class: 'empty-mascot', alt: '' }),
        el('h3', {}, isRate ? 'Muitas consultas ao Scryfall' : 'Não foi possível analisar'),
        el('p', {}, isRate
          ? 'O Scryfall limitou as consultas por um momento. Aguarde alguns segundos e tente de novo.'
          : (card ? 'Ocorreu um erro ao calcular as probabilidades. Tente novamente em instantes.'
                  : 'Confira o nome e tente novamente (português ou inglês).')),
        el('button', {
          class: 'btn btn-secondary btn-sm', style: 'margin-top:12px',
          onclick: () => analyze(name)
        }, '↻ Tentar de novo')));
    }
  }

  function makeRow(type, prob, set, print) {
    const price = Store.getBoosterPrice(type);
    return { type, prob, price, costPerHit: prob > 0 ? price / prob : Infinity, set, print };
  }

  /* ---------- Renderização ---------- */

  /** Célula de preço editável: clique → input na moeda ativa → salvo em USD. */
  function priceCell(row, onSaved) {
    const { el } = UI;
    const cell = el('td', {});

    function showButton() {
      cell.innerHTML = '';
      cell.append(el('button', {
        class: 'price-edit',
        title: 'Clique para ajustar o preço deste tipo de booster',
        onclick: showInput
      }, Store.fmtPrice(row.price)));
      if (Store.isCustomBoosterPrice(row.type)) {
        cell.append(el('button', {
          class: 'price-reset', title: 'Restaurar preço padrão',
          onclick: () => { Store.setBoosterPrice(row.type, null); onSaved(); }
        }, 'padrão'));
      }
    }

    function showInput() {
      const rate = Store.usdBrl.rate;
      const isBrl = Store.currency === 'brl';
      const current = isBrl ? row.price * rate : row.price;
      cell.innerHTML = '';
      const input = el('input', {
        class: 'price-edit-input', type: 'number', min: '0', step: '0.5',
        value: current.toFixed(2), 'aria-label': 'Preço do booster'
      });
      const save = () => {
        const v = parseFloat(input.value);
        if (v > 0) Store.setBoosterPrice(row.type, isBrl ? v / rate : v);
        onSaved();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') showButton();
        e.stopPropagation();
      });
      input.addEventListener('blur', save);
      cell.append(input, el('span', { class: 'wl-cell-sub' }, isBrl ? ' R$' : ' US$'));
      input.focus(); input.select();
    }

    showButton();
    return cell;
  }

  function renderAnalysis(card, blocks, best) {
    const { el } = UI;
    const results = $('boosterResults');
    results.innerHTML = '';

    const directPrice = card.prices?.usd || card.prices?.usd_foil;
    const reRender = () => analyze(lastAnalyzed);

    results.append(el('div', { class: 'booster-card-head' },
      el('img', { src: UI.cardImage(card), alt: card.name }),
      el('div', { style: 'flex:1' },
        el('h2', {}, UI.displayName(card)),
        el('p', { class: 'meta' },
          `${UI.rarityLabel(card.rarity)} · aparece em ${blocks.length} expansão(ões) com booster`,
          directPrice ? ` · comprar avulsa: ${Store.fmtPrice(directPrice)}` : ''),
        best
          ? el('div', { class: 'best-pick' },
              el('strong', {}, '🏆 Melhor custo-benefício: '),
              `${BoosterData.LABELS[best.type]} de ${best.set.name} — `,
              `${(best.prob * 100).toFixed(1)}% por booster, custo médio de ${Store.fmtPrice(best.costPerHit)} por cópia obtida.`,
              directPrice && best.costPerHit > parseFloat(directPrice)
                ? el('div', { style: 'margin-top:6px' }, `💡 Comprar a carta avulsa (${Store.fmtPrice(directPrice)}) sai mais barato que caçá-la em boosters.`)
                : null)
          : el('div', { class: 'best-pick' }, 'Esta carta não aparece em boosters — só é possível obtê-la avulsa ou em produtos especiais.'),
        el('button', {
          class: 'btn btn-secondary btn-sm', style: 'margin-top:12px',
          onclick: () => CardModal.open(card)
        }, '⭐ Ver versões / adicionar à wishlist')
      )
    ));

    for (const { set, rows } of blocks) {
      const table = el('table', { class: 'booster-table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Booster'),
          el('th', {}, 'Chance por booster'),
          el('th', {}, 'Preço (clique para editar)'),
          el('th', {}, 'Custo médio por cópia'),
          el('th', {}, '')
        )),
        el('tbody', {}, rows.map(r => el('tr', {},
          el('td', {}, BoosterData.LABELS[r.type]),
          el('td', { class: 'prob' }, `${(r.prob * 100).toFixed(r.prob < 0.01 ? 2 : 1)}%`),
          priceCell(r, reRender),
          el('td', {}, isFinite(r.costPerHit) ? Store.fmtPrice(r.costPerHit) : '—'),
          el('td', {}, best === r ? el('span', { class: 'value-tag' }, '🏆 melhor escolha') : '')
        )))
      );

      results.append(el('div', { class: 'booster-set-block' },
        el('div', { class: 'booster-set-header' },
          set.icon_svg_uri ? el('img', { class: 'set-icon', src: set.icon_svg_uri, alt: '' }) : null,
          el('h3', {}, set.name),
          el('span', { class: 'set-meta' }, `${set.code.toUpperCase()} · ${set.released_at || ''}`)
        ),
        table,
        el('div', { class: 'booster-note' },
          'Probabilidades estimadas a partir da estrutura oficial dos boosters e da quantidade de cartas por raridade da expansão. Ajuste os preços para os valores da sua loja — eles ficam salvos.')
      ));
    }
  }

  /* ---------- Autocomplete ---------- */
  function bind() {
    const input = $('boosterSearch');
    const sug = $('boosterSuggestions');

    const showSuggestions = UI.debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { sug.hidden = true; return; }
      const names = await Scryfall.autocomplete(q);
      sug.innerHTML = '';
      if (!names.length) { sug.hidden = true; return; }
      names.slice(0, 8).forEach(name => {
        const item = UI.el('div', {
          class: 'suggestion-item',
          onclick: () => { input.value = name; sug.hidden = true; analyze(name); }
        }, name);
        sug.append(item);
      });
      sug.hidden = false;
    }, 300);

    input.addEventListener('input', showSuggestions);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { sug.hidden = true; analyze(input.value.trim()); }
      if (e.key === 'Escape') sug.hidden = true;
    });
    $('boosterSearchBtn').addEventListener('click', () => { sug.hidden = true; analyze(input.value.trim()); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#page-boosters .search-panel')) sug.hidden = true;
    });

    // Re-analisa ao trocar moeda (requests ficam em cache, então é rápido)
    Store.subscribe((what) => {
      if (what === 'currency' && lastAnalyzed && App.current === 'boosters') analyze(lastAnalyzed);
    });
  }

  // API pública da página
  window.BoostersPage = {
    init() { bind(); },
    /** Abre a página já analisando uma carta (vindo da Home). */
    analyzeCard(name) {
      $('boosterSearch').value = name;
      analyze(name);
    },
    focusSearch() { $('boosterSearch').focus(); $('boosterSearch').select(); }
  };
})();
