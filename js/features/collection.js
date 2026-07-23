/**
 * CollectionPage — "Minha Coleção": as cartas que você já tem.
 * - Visão combinada (união por impressão) do store de adquiridas com os itens
 *   de qualquer wishlist marcados como adquiridos.
 * - Presença apenas (tenho / não tenho), distinguindo a impressão exata.
 * - Cabeçalho compacto com valor total + contagem.
 * - Dois modos: Grade (grid por coleção) e Compacta (lista densa para muitas cartas).
 * - Filtro multi-seleção de coleções e ordenação (nome / preço / raridade).
 * - Busca própria para adicionar qualquer carta (escolhendo a versão no modal).
 * Global: window.CollectionPage
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const sort = { key: 'name' };
  const state = { setFilters: new Set(), view: 'grid' };
  try { state.view = localStorage.getItem('col-view') === 'compact' ? 'compact' : 'grid'; } catch { /* ok */ }

  // Ícones das expansões (code -> icon_svg_uri), carregados sob demanda.
  let setIcons = null;
  async function ensureSetIcons() {
    if (setIcons) return setIcons;
    try {
      const sets = await Scryfall.sets();
      setIcons = Object.fromEntries(sets.map(s => [s.code, s.icon_svg_uri]));
    } catch { setIcons = {}; }
    return setIcons;
  }

  /* ---------- Ordenação ---------- */
  const RARITY_RANK = { mythic: 0, rare: 1, special: 1, bonus: 1, uncommon: 2, common: 3 };
  function sortVal() {
    return {
      name: c => c.displayName.toLowerCase(),
      price: c => -Store.snapshotPriceUsd(c),          // preço ↓ (maior primeiro)
      rarity: c => RARITY_RANK[c.rarity] ?? 4
    }[sort.key] || (c => c.displayName.toLowerCase());
  }
  function sortCards(cards) {
    const val = sortVal();
    return cards.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x < y) return -1;
      if (x > y) return 1;
      return a.displayName.localeCompare(b.displayName, 'pt-BR');
    });
  }

  /* ---------- Filtro ---------- */
  function passesFilter(c) {
    return state.setFilters.size === 0 || state.setFilters.has(c.set);
  }

  /* ---------- Abrir todas as versões (troca/detalhe) ---------- */
  async function openVersions(entry) {
    const card = await Scryfall.byId(entry.id);
    if (card) CardModal.open(card);
  }

  function removeBtn(c, cls) {
    return UI.el('button', {
      class: cls, title: 'Remover da coleção',
      onclick: (e) => {
        e.stopPropagation();
        Store.unacquireCard(c.id);
        UI.toast(`↩️ ${c.displayName} removida da coleção.`);
      }
    }, UI.el('span', {}, '✕'));
  }

  /* ---------- Tile (modo grade) ---------- */
  function tile(c) {
    const { el } = UI;
    const price = Store.snapshotPriceUsd(c);
    const treatment = UI.treatmentLabel(c);

    return el('div', { class: `card-tile col-tile rar-${c.rarity}` },
      el('div', { class: 'card-tile-img' },
        UI.img({
          src: c.image, alt: c.displayName, loading: 'lazy',
          style: 'cursor:pointer', title: 'Ver todas as versões',
          onclick: () => openVersions(c)
        }),
        el('div', { class: 'col-tile-corner' }, removeBtn(c, 'tile-btn col-remove'))
      ),
      el('div', { class: 'card-tile-info col-tile-info' },
        el('span', { class: 'card-tile-name', title: c.name }, c.displayName),
        treatment
          ? el('span', { class: 'card-tile-treatment' }, treatment)
          : el('span', { class: 'col-tile-num' }, `#${c.collectorNumber}`),
        el('div', { class: 'card-tile-meta' },
          el('span', { class: `card-tile-rarity rarity-${c.rarity}` }, UI.rarityLabel(c.rarity)),
          el('span', { class: 'card-tile-price' }, price ? Store.fmtPrice(price) : '')))
    );
  }

  /* ---------- Linha (modo compacto) ---------- */
  function compactRow(c) {
    const { el } = UI;
    const price = Store.snapshotPriceUsd(c);
    return el('div', {
      class: `col-crow rar-${c.rarity}`, title: 'Ver todas as versões',
      onclick: () => openVersions(c)
    },
      UI.img({ class: 'col-crow-thumb', src: c.image, alt: '', loading: 'lazy' }),
      el('span', { class: `col-crow-dot rarity-${c.rarity}`, 'aria-hidden': 'true' }),
      el('span', { class: 'col-crow-name', title: c.name }, c.displayName),
      el('span', { class: 'col-crow-set', title: c.setName },
        (setIcons && setIcons[c.set])
          ? el('img', { class: 'col-crow-seticon', src: setIcons[c.set], alt: '', loading: 'lazy' })
          : null,
        `${c.setName} · #${c.collectorNumber}`),
      el('span', { class: 'col-crow-rarity' }, UI.rarityLabel(c.rarity)),
      el('span', { class: 'col-crow-price' }, price ? Store.fmtPrice(price) : '—'),
      removeBtn(c, 'col-crow-remove')
    );
  }

  /* ---------- Filtro de coleções (multi-seleção, reaproveita #wlDialog) ---------- */
  function collectionSets() {
    const map = new Map();
    for (const c of Store.collectionCards()) {
      const e = map.get(c.set) || { code: c.set, name: c.setName, count: 0 };
      e.count += 1;
      map.set(c.set, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  function closeSetPicker() {
    const m = $('wlDialog');
    m.hidden = true; m.innerHTML = '';
    if ($('cardModal').hidden && $('setPicker').hidden) document.body.style.overflow = '';
  }

  async function openSetPicker() {
    const { el } = UI;
    await ensureSetIcons();
    const sets = collectionSets();
    const total = Store.collectionCards().length;

    const chips = el('div', { class: 'col-chips' });
    const countLabel = el('span', { class: 'col-filter-count' });
    const clearBtn = el('button', {
      class: 'col-filter-clear',
      onclick: () => { state.setFilters.clear(); refresh(); }
    }, 'Limpar seleção');

    const input = el('input', {
      class: 'col-filter-search', type: 'search',
      placeholder: '🔍 Buscar coleção…', 'aria-label': 'Buscar coleção'
    });

    function chip({ name, count, icon, emoji, on, onClick }) {
      return el('button', { class: 'col-chip' + (on ? ' on' : ''), onclick: onClick },
        on
          ? el('span', { class: 'col-chip-mark' }, '✓')
          : (icon
              ? el('img', { class: 'col-chip-icon', src: icon, alt: '', loading: 'lazy' })
              : el('span', { class: 'col-chip-icon col-chip-emoji' }, emoji || '')),
        el('span', { class: 'col-chip-name' }, name),
        el('span', { class: 'col-chip-count' }, String(count))
      );
    }

    function syncCount() {
      const n = state.setFilters.size;
      countLabel.textContent = n === 0
        ? `Mostrando todas · ${total} carta(s)`
        : `${n} de ${sets.length} coleções`;
      clearBtn.hidden = n === 0;
    }

    function renderChips(filter = '') {
      const f = filter.trim().toLowerCase();
      chips.innerHTML = '';

      if (!f) {
        chips.append(chip({
          name: 'Todas', count: total, emoji: '🗺️',
          on: state.setFilters.size === 0,
          onClick: () => { state.setFilters.clear(); refresh(); }
        }));
      }

      const matches = sets.filter(s =>
        !f || s.name.toLowerCase().includes(f) || s.code.toLowerCase().includes(f));

      matches.forEach(s => chips.append(chip({
        name: s.name, count: s.count, icon: setIcons && setIcons[s.code],
        on: state.setFilters.has(s.code),
        onClick: () => {
          if (state.setFilters.has(s.code)) state.setFilters.delete(s.code);
          else state.setFilters.add(s.code);
          refresh();
        }
      })));

      if (!matches.length && f) {
        chips.append(el('div', { class: 'col-chips-empty' }, 'Nenhuma coleção encontrada.'));
      }
    }

    // Atualiza os chips + o contador + a coleção atrás do modal, ao vivo.
    function refresh() {
      syncCount();
      renderChips(input.value);
      render();
    }

    input.addEventListener('input', UI.debounce(() => renderChips(input.value), 150));
    input.addEventListener('keydown', (e) => e.stopPropagation());

    const m = $('wlDialog');
    m.innerHTML = '';
    m.append(el('div', { class: 'col-filter-sheet' },
      el('div', { class: 'modal-head' },
        el('h2', {}, 'Filtrar coleções'),
        el('button', { class: 'modal-close', onclick: closeSetPicker, 'aria-label': 'Fechar' }, '✕')
      ),
      el('div', { class: 'col-filter-sub' }, 'Toque nas coleções que quer ver. Selecione quantas quiser.'),
      el('div', { class: 'col-filter-search-wrap' }, input),
      el('div', { class: 'col-filter-bar' }, countLabel, clearBtn),
      chips
    ));
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    m.onclick = (e) => { if (e.target === m) closeSetPicker(); };

    syncCount();
    renderChips();
    input.focus();
  }

  async function syncSetButton() {
    const label = $('colSetLabel');
    const icon = $('colSetIcon');
    const n = state.setFilters.size;

    if (n === 0) {
      label.textContent = '🗺️ Todas as coleções';
      icon.hidden = true;
    } else if (n === 1) {
      const code = [...state.setFilters][0];
      const c = Store.collectionCards().find(x => x.set === code);
      label.textContent = c ? c.setName : code.toUpperCase();
      await ensureSetIcons();
      if (setIcons && setIcons[code]) { icon.src = setIcons[code]; icon.hidden = false; }
      else icon.hidden = true;
    } else {
      label.textContent = `${n} coleções`;
      icon.hidden = true;
    }
  }

  /* ---------- Render ---------- */
  function render() {
    const { el } = UI;
    const all = Store.collectionCards();
    const empty = all.length === 0;
    const { count, totalUsd } = Store.collectionTotals();

    const badge = $('collectionBadge');
    badge.hidden = count === 0;
    badge.textContent = count;

    $('collectionSummary').textContent = empty
      ? 'Marque cartas como adquiridas para montá-la.'
      : `${count} carta${count === 1 ? '' : 's'}`;

    $('collectionValueBox').hidden = empty;
    $('collectionValue').textContent = Store.fmtPrice(totalUsd);

    $('collectionToolbar').hidden = empty;
    $('colEmpty').hidden = !empty;

    // Remove dos filtros coleções que não existem mais
    for (const code of [...state.setFilters]) {
      if (!all.some(c => c.set === code)) state.setFilters.delete(code);
    }
    syncSetButton();

    // Sincroniza botões de visualização
    const compact = state.view === 'compact';
    $('colViewGrid').classList.toggle('active', !compact);
    $('colViewCompact').classList.toggle('active', compact);
    $('colViewGrid').setAttribute('aria-pressed', String(!compact));
    $('colViewCompact').setAttribute('aria-pressed', String(compact));

    const cards = all.filter(passesFilter);
    const filterEmpty = !empty && cards.length === 0;
    $('colFilterEmpty').hidden = !filterEmpty;

    const host = $('collectionGroups');
    host.className = 'collection-groups' + (compact ? ' is-compact' : '');
    host.innerHTML = '';
    if (empty || filterEmpty) return;

    if (compact) {
      const listBox = el('div', { class: 'col-compact' });
      sortCards(cards).forEach(c => listBox.append(compactRow(c)));
      host.append(listBox);
      return;
    }

    // Modo grade: agrupa por coleção, ordena os grupos por nome
    const groups = new Map();
    for (const c of cards) {
      if (!groups.has(c.set)) groups.set(c.set, []);
      groups.get(c.set).push(c);
    }
    const orderedSets = [...groups.keys()].sort((a, b) =>
      groups.get(a)[0].setName.localeCompare(groups.get(b)[0].setName, 'pt-BR'));

    for (const setCode of orderedSets) {
      const items = sortCards(groups.get(setCode));
      const setName = items[0].setName;
      const groupTotal = items.reduce((s, c) => s + Store.snapshotPriceUsd(c), 0);

      const header = el('div', { class: 'collection-group-header' },
        (setIcons && setIcons[setCode])
          ? el('img', { class: 'collection-group-icon', src: setIcons[setCode], alt: '', loading: 'lazy' })
          : null,
        el('span', { class: 'collection-group-name' }, setName),
        el('span', { class: 'collection-group-meta' },
          `${items.length} carta${items.length === 1 ? '' : 's'} · ${Store.fmtPrice(groupTotal)}`)
      );

      const grid = el('div', { class: 'card-grid collection-grid' });
      items.forEach(c => grid.append(tile(c)));

      host.append(el('div', { class: 'collection-group' }, header, grid));
    }
  }

  /* ---------- Hidratação sob demanda (ids legados sem dados) ---------- */
  let shown = false;
  async function onShow() {
    if (shown) return;
    shown = true;
    if (Store.acquiredNeedingHydration() > 0) {
      $('colHydrating').hidden = false;
      await Store.hydrateAcquired(); // dispara notify('acquired') → render()
      $('colHydrating').hidden = true;
    }
  }

  /* ---------- Eventos ---------- */
  function setView(v) {
    state.view = v;
    try { localStorage.setItem('col-view', v); } catch { /* ok */ }
    render();
  }

  function bind() {
    $('colSortFilter').addEventListener('change', (e) => { sort.key = e.target.value; render(); });
    $('colSetBtn').addEventListener('click', openSetPicker);
    $('colViewGrid').addEventListener('click', () => setView('grid'));
    $('colViewCompact').addEventListener('click', () => setView('compact'));
    $('colScanBtn').addEventListener('click', () => CardScanner.open());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('wlDialog').hidden) closeSetPicker();
    });

    // Busca de adição rápida: abre o modal para escolher a impressão exata.
    const input = $('colSearch');
    const sug = $('colSuggestions');

    const suggest = UI.debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { sug.hidden = true; return; }
      const names = await Scryfall.autocomplete(q);
      sug.innerHTML = '';
      if (!names.length) { sug.hidden = true; return; }
      names.slice(0, 8).forEach(name => {
        sug.append(UI.el('div', {
          class: 'suggestion-item',
          onclick: async () => {
            sug.hidden = true; input.value = '';
            const card = await Scryfall.named(name);
            if (card) CardModal.open(card); // marque ✓ na versão exata dentro do modal
          }
        }, name));
      });
      sug.hidden = false;
    }, 300);

    input.addEventListener('input', suggest);
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        sug.hidden = true;
        const card = await Scryfall.named(input.value.trim());
        if (card) { CardModal.open(card); input.value = ''; }
        else UI.toast('Carta não encontrada.', 'error');
      }
      if (e.key === 'Escape') sug.hidden = true;
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#page-collection .search-panel')) sug.hidden = true;
    });

    // Re-render em qualquer mudança da coleção / wishlist / moeda
    Store.subscribe((what) => {
      if (what === 'acquired' || what === 'wishlist' || what === 'wishlists' || what === 'currency') render();
    });

    ensureSetIcons().then(() => render());
  }

  window.CollectionPage = {
    init() { bind(); render(); },
    onShow,
    focusSearch() { $('colSearch').focus(); }
  };
})();
