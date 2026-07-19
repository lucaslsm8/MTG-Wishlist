/**
 * Home — pesquisa de cartas (barra global no header), filtros em popover,
 * seletor de expansões com ícones e vitrine da expansão mais recente.
 * Global: window.HomePage
 */
(function () {
  'use strict';

  const state = {
    query: '',
    colors: new Set(),
    type: '',
    cmc: '',
    rarity: '',
    set: '',        // código da expansão ativa
    allPrints: false, // mostrar todas as variações/impressões
    sort: 'name',
    nextPage: null,
    latestSet: null,
    sets: [],
    loading: false
  };

  const $ = (id) => document.getElementById(id);

  /* ---------- Construção da query Scryfall ---------- */
  function buildFilters() {
    const parts = [];
    if (state.colors.size) {
      const c = [...state.colors].join('');
      parts.push(c === 'C' ? 'c=c' : `c>=${c.replace('C', '')}`);
    }
    if (state.type) parts.push(`t:${state.type}`);
    if (state.cmc) parts.push(state.cmc === '7+' ? 'mv>=7' : `mv=${state.cmc}`);
    if (state.rarity) parts.push(`r:${state.rarity}`);
    if (state.set) parts.push(`set:${state.set}`);
    return parts.join(' ');
  }

  function activeFilterCount() {
    return (state.colors.size ? 1 : 0) + !!state.type + !!state.cmc + !!state.rarity;
  }

  function sortParams() {
    const map = {
      name: { order: 'name', dir: 'auto' },
      released: { order: 'released', dir: 'desc' },
      usd: { order: 'usd', dir: 'desc' },
      cmc: { order: 'cmc', dir: 'asc' },
      rarity: { order: 'rarity', dir: 'desc' }
    };
    return map[state.sort] || map.name;
  }

  /** Opções de busca conforme o modo de variações. */
  function searchOpts() {
    return {
      ...sortParams(),
      unique: state.allPrints ? 'prints' : 'cards',
      extras: state.allPrints
    };
  }

  /* ---------- Renderização ---------- */
  function cardTile(card) {
    const { el } = UI;
    const price = card.prices?.usd || card.prices?.usd_foil;
    const name = card.printed_name_pt || UI.displayName(card);

    return el('div', {
      class: 'card-tile', tabindex: '0', role: 'button',
      'aria-label': `${name}, ver detalhes`,
      onclick: () => CardModal.open(card),
      onkeydown: (e) => {
        if (e.key === 'Enter') CardModal.open(card);
        else if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          WishlistPage.addCard(card);
        } else if (e.key.toLowerCase() === 'b') {
          e.preventDefault();
          App.go('boosters', { card: card.name });
        }
      }
    },
      el('div', { class: 'card-tile-img' },
        el('img', { src: UI.cardImage(card), alt: name, loading: 'lazy' }),
        el('div', { class: 'card-tile-actions' },
          el('button', {
            class: 'tile-btn', title: 'Adicionar à wishlist',
            onclick: (e) => {
              e.stopPropagation();
              WishlistPage.addCard(card);
            }
          }, '⭐'),
          el('button', {
            class: 'tile-btn', title: 'Ver boosters para esta carta',
            onclick: (e) => { e.stopPropagation(); App.go('boosters', { card: card.name }); }
          }, '📦')
        )
      ),
      el('div', { class: 'card-tile-info' },
        el('span', { class: 'card-tile-name', title: card.name }, name),
        state.allPrints
          ? el('span', { class: 'card-tile-set', title: card.set_name },
              `${card.set_name} · #${card.collector_number}`)
          : null,
        state.allPrints && UI.treatmentLabel(card)
          ? el('span', { class: 'card-tile-treatment' }, UI.treatmentLabel(card))
          : null,
        el('div', { class: 'card-tile-meta' },
          el('span', { class: `rarity-${card.rarity}` }, UI.rarityLabel(card.rarity)),
          el('span', { class: 'card-tile-price' }, price ? Store.fmtPrice(price) : '')
        )
      )
    );
  }

  function setLoading(on) {
    state.loading = on;
    $('homeLoader').hidden = !on;
    if (on) { $('homeEmpty').hidden = true; $('loadMoreBtn').hidden = true; }
  }

  function renderResults(cards, { append = false, title, total } = {}) {
    const grid = $('cardGrid');
    if (!append) grid.innerHTML = '';
    cards.forEach(c => grid.append(cardTile(c)));

    if (title) $('resultsTitle').textContent = title;
    $('resultsCount').textContent = total ? `${total} carta(s)` : '';
    $('homeEmpty').hidden = grid.children.length > 0;
    $('loadMoreBtn').hidden = !state.nextPage;
  }

  function syncChrome() {
    // Badge de filtros ativos
    const n = activeFilterCount();
    const badge = $('filtersBadge');
    badge.hidden = n === 0;
    badge.textContent = n;

    // Chip da expansão ativa
    const chip = $('activeSetChip');
    if (state.set) {
      const set = state.sets.find(s => s.code === state.set);
      chip.hidden = false;
      $('activeSetName').textContent = set?.name || state.set.toUpperCase();
      const icon = $('activeSetIcon');
      if (set?.icon_svg_uri) { icon.src = set.icon_svg_uri; icon.hidden = false; }
      else icon.hidden = true;
    } else {
      chip.hidden = true;
    }
  }

  /* ---------- Ações ---------- */
  async function runSearch({ append = false } = {}) {
    if (state.loading) return;
    syncChrome();
    setLoading(true);
    try {
      let result;
      if (append && state.nextPage) {
        result = await Scryfall.searchUrl(state.nextPage);
      } else {
        const filters = buildFilters();
        const opts = searchOpts();
        const q = state.query.trim();
        if (!q && !filters) { setLoading(false); return showLatestSet(); }
        result = q
          ? await Scryfall.searchBilingual(q, filters, opts)
          : await Scryfall.search(filters, opts);
      }
      state.nextPage = result.hasMore ? result.nextPage : null;
      const title = state.query.trim()
        ? `Resultados para “${state.query.trim()}”`
        : (state.set ? `Expansão: ${state.sets.find(s => s.code === state.set)?.name || state.set}` : 'Resultados');
      renderResults(result.cards, { append, title, total: result.total });
    } catch (err) {
      console.error(err);
      UI.toast('Erro ao pesquisar. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  }

  /** Vitrine padrão: cartas da expansão mais recente (detectada dinamicamente). */
  async function showLatestSet() {
    syncChrome();
    setLoading(true);
    try {
      if (!state.latestSet) state.latestSet = await Scryfall.latestSet();
      const set = state.latestSet;
      if (!set) return;
      const result = await Scryfall.search(`set:${set.code}`, {
        order: 'set', dir: 'asc',
        unique: state.allPrints ? 'prints' : 'cards',
        extras: state.allPrints
      });
      state.nextPage = result.hasMore ? result.nextPage : null;
      renderResults(result.cards, {
        title: `✨ Lançamento mais recente: ${set.name}`,
        total: result.total
      });
    } catch (err) {
      console.error(err);
      UI.toast('Erro ao carregar a expansão mais recente.', 'error');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Expansões ---------- */
  async function loadSets() {
    const RELEVANT = new Set(['expansion', 'core', 'masters', 'draft_innovation', 'commander', 'funny', 'box']);
    const all = await Scryfall.sets();
    state.sets = all.filter(s => s.card_count > 0 && !s.digital && RELEVANT.has(s.set_type));
  }

  /** Drawer de seleção de expansão, com busca e ícones. */
  function openSetPicker() {
    const { el } = UI;
    const m = $('setPicker');
    m.innerHTML = '';
    m.hidden = false;
    document.body.style.overflow = 'hidden';

    const closePicker = () => { m.hidden = true; m.innerHTML = ''; document.body.style.overflow = ''; };
    m.onclick = (e) => { if (e.target === m) closePicker(); };

    const list = el('div', { class: 'set-picker-list' });
    const input = el('input', {
      class: 'select', style: 'width: 100%', type: 'search',
      placeholder: 'Buscar expansão… ex.: Final Fantasy, Spider-Man, Avatar',
      'aria-label': 'Buscar expansão'
    });

    const pick = (code) => { closePicker(); selectSet(code); };

    function renderList(filter = '') {
      const f = filter.trim().toLowerCase();
      const matches = state.sets.filter(s =>
        !f || s.name.toLowerCase().includes(f) || s.code.includes(f));
      list.innerHTML = '';

      let lastYear = null;
      for (const s of matches.slice(0, 250)) {
        const year = s.released_at?.slice(0, 4) || '—';
        if (year !== lastYear) {
          list.append(el('div', { class: 'set-group-label' }, year));
          lastYear = year;
        }
        list.append(el('button', {
          class: 'set-item' + (s.code === state.set ? ' current' : ''),
          onclick: () => pick(s.code)
        },
          el('img', { class: 'set-item-icon', src: s.icon_svg_uri, alt: '', loading: 'lazy' }),
          el('span', { class: 'set-item-name' }, s.name),
          el('span', { class: 'set-item-meta' }, `${s.code.toUpperCase()} · ${s.card_count} cartas`)
        ));
      }
      if (!matches.length) list.append(el('div', { class: 'version-loading' }, 'Nenhuma expansão encontrada.'));
    }

    input.addEventListener('input', UI.debounce(() => renderList(input.value), 150));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = list.querySelector('.set-item');
        if (first) first.click();
      }
      e.stopPropagation();
    });

    m.append(el('div', { class: 'modal-sheet' },
      el('div', { class: 'modal-head' },
        el('h2', {}, '🗺️ Expansões'),
        el('button', { class: 'modal-close', onclick: closePicker, 'aria-label': 'Fechar' }, '✕')
      ),
      el('div', { class: 'set-picker-search' }, input),
      list
    ));

    renderList();
    input.focus();
  }

  function selectSet(code) {
    state.set = code;
    runSearch();
  }

  /* ---------- Popover de filtros ---------- */
  function toggleFiltersPanel(force) {
    const panel = $('filtersPanel');
    panel.hidden = force != null ? !force : !panel.hidden;
  }

  /* ---------- Eventos ---------- */
  function bind() {
    // Pesquisa global (header)
    const search = $('globalSearch');
    const goHomeIfNeeded = () => { if (App.current !== 'home') App.go('home'); };

    const debounced = UI.debounce(() => {
      state.query = search.value;
      $('globalSearchClear').hidden = !search.value;
      goHomeIfNeeded();
      runSearch();
    }, 450);

    search.addEventListener('input', debounced);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { state.query = search.value; goHomeIfNeeded(); runSearch(); }
    });
    $('globalSearchClear').addEventListener('click', () => {
      search.value = ''; state.query = '';
      $('globalSearchClear').hidden = true;
      runSearch();
    });

    // Popover de filtros
    $('filtersBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleFiltersPanel(); });
    $('filtersPanel').addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => toggleFiltersPanel(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleFiltersPanel(false);
        const picker = $('setPicker');
        if (!picker.hidden) { picker.hidden = true; picker.innerHTML = ''; document.body.style.overflow = ''; }
      }
    });

    document.querySelectorAll('#colorFilter .color-pip').forEach(pip => {
      pip.addEventListener('click', () => {
        const c = pip.dataset.color;
        if (state.colors.has(c)) { state.colors.delete(c); pip.classList.remove('active'); }
        else { state.colors.add(c); pip.classList.add('active'); }
        runSearch();
      });
    });

    for (const [id, key] of [['typeFilter', 'type'], ['cmcFilter', 'cmc'], ['rarityFilter', 'rarity'], ['sortFilter', 'sort']]) {
      $(id).addEventListener('change', (e) => { state[key] = e.target.value; runSearch(); });
    }

    $('clearFilters').addEventListener('click', () => {
      state.colors.clear(); state.type = state.cmc = state.rarity = ''; state.sort = 'name';
      document.querySelectorAll('#colorFilter .color-pip.active').forEach(p => p.classList.remove('active'));
      ['typeFilter', 'cmcFilter', 'rarityFilter'].forEach(id => $(id).value = '');
      $('sortFilter').value = 'name';
      runSearch();
    });

    // Expansões
    $('allPrintsToggle').addEventListener('change', (e) => {
      state.allPrints = e.target.checked;
      runSearch();
    });

    $('setPickerBtn').addEventListener('click', openSetPicker);
    $('activeSetClear').addEventListener('click', () => { state.set = ''; runSearch(); });

    $('loadMoreBtn').addEventListener('click', () => runSearch({ append: true }));

    // Re-renderizar preços ao trocar moeda
    Store.subscribe((what) => {
      if (what === 'currency' && !state.loading) runSearch();
    });
  }

  /** Navegação por setas no grid de cartas. */
  function moveFocus(key) {
    const grid = $('cardGrid');
    const tiles = [...grid.querySelectorAll('.card-tile')];
    if (!tiles.length) return;

    const current = document.activeElement?.closest('.card-tile');
    let idx = tiles.indexOf(current);
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 1;

    if (idx === -1) idx = 0;
    else if (key === 'ArrowRight') idx = Math.min(idx + 1, tiles.length - 1);
    else if (key === 'ArrowLeft') idx = Math.max(idx - 1, 0);
    else if (key === 'ArrowDown') idx = Math.min(idx + cols, tiles.length - 1);
    else if (key === 'ArrowUp') idx = Math.max(idx - cols, 0);

    tiles[idx].focus();
    tiles[idx].scrollIntoView({ block: 'nearest' });
  }

  // API pública da página
  window.HomePage = {
    init() {
      bind();
      loadSets();
      showLatestSet();
    },
    moveFocus,
    focusSearch() { $('globalSearch').focus(); $('globalSearch').select(); }
  };
})();
