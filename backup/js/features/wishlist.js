/**
 * WishlistPage — gerenciador de cartas desejadas (lista + grade).
 * - Múltiplas wishlists nomeadas: criar, renomear, excluir e alternar
 * - Adicionar por pesquisa (autocomplete), escolhendo a wishlist de destino
 * - Filtro por edição (só as edições presentes na wishlist ativa)
 * - Marcar cartas como adquiridas, com progresso e opção de ocultá-las
 * - Visualização em lista (tabela) ou grade (imagens)
 * - Backup (exportar/restaurar JSON) e importação do Scryfall
 * Global: window.WishlistPage
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const FINISH_LABEL = { nonfoil: 'Normal', foil: 'Foil ✨', etched: 'Etched' };
  const BACKUP_APP = 'cogu-mtg-wishlist';

  const sort = { key: 'name', dir: 1 };
  const state = { view: 'list', setFilter: '', hideAcquired: false };
  try {
    state.view = localStorage.getItem('wl-view') === 'grid' ? 'grid' : 'list';
    state.hideAcquired = localStorage.getItem('wl-hide-acquired') === '1';
  } catch { /* ok */ }

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

  /* ---------- Edições da wishlist ativa ---------- */
  function wishlistSets() {
    const map = new Map();
    for (const i of Store.wishlist) {
      const e = map.get(i.set) || { code: i.set, name: i.setName, count: 0 };
      e.count += 1;
      map.set(i.set, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  function filteredItems() {
    let items = state.setFilter
      ? Store.wishlist.filter(i => i.set === state.setFilter)
      : [...Store.wishlist];
    if (state.hideAcquired) items = items.filter(i => !i.acquired);
    return items;
  }

  /* ---------- Ordenação ---------- */
  function sortedItems() {
    const items = filteredItems();
    const val = {
      name: i => i.displayName.toLowerCase(),
      set: i => `${i.setName}·${i.collectorNumber.padStart(5, '0')}`,
      qty: i => i.qty,
      price: i => Store.itemPriceUsd(i),
      total: i => Store.itemPriceUsd(i) * i.qty
    }[sort.key];
    items.sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return items;
  }

  function syncSortIndicators() {
    document.querySelectorAll('#wlTable th.sortable').forEach(th => {
      th.classList.toggle('sorted-asc', th.dataset.sort === sort.key && sort.dir === 1);
      th.classList.toggle('sorted-desc', th.dataset.sort === sort.key && sort.dir === -1);
    });
  }

  /** Botão de marcar/desmarcar como adquirida. */
  function acquireToggle(item, opts = {}) {
    const on = !!item.acquired;
    return UI.el('button', {
      class: 'wl-acquire' + (on ? ' on' : '') + (opts.tile ? ' tile-btn' : ''),
      'aria-pressed': String(on),
      title: on ? 'Marcar como não adquirida' : 'Marcar como adquirida',
      onclick: (e) => {
        e.stopPropagation();
        Store.setAcquired(item.id, item.finish, !on);
        UI.toast(on
          ? `↩️ ${item.displayName} voltou para a lista de desejos`
          : `✅ ${item.displayName} marcada como adquirida`);
      }
    }, on ? '✓' : '');
  }

  /* ---------- Renderização (lista) ---------- */
  function rowNode(item) {
    const { el } = UI;
    const price = Store.itemPriceUsd(item);
    const treatment = UI.treatmentLabel(item);

    const finishCell = item.finishes.length > 1
      ? el('select', {
          class: 'select select-sm wl-finish-select',
          'aria-label': 'Acabamento',
          onchange: (e) => Store.setFinish(item.id, item.finish, e.target.value)
        }, item.finishes.map(f =>
          Object.assign(el('option', { value: f }, FINISH_LABEL[f] || f), { selected: f === item.finish })))
      : el('span', { class: 'wl-cell-sub' }, FINISH_LABEL[item.finish] || item.finish);

    return el('tr', { class: item.acquired ? 'wl-row-acquired' : '' },
      el('td', { class: 'wl-acq-cell' }, acquireToggle(item)),
      el('td', {}, el('img', {
        class: 'wl-thumb', src: item.image, alt: item.displayName, loading: 'lazy',
        title: 'Ver todas as versões', onclick: () => openVersions(item)
      })),
      el('td', {},
        el('div', { class: 'wl-cell-name', title: item.name }, item.displayName)),
      el('td', {},
        el('div', {}, item.setName),
        el('div', { class: 'wl-cell-sub' }, `#${item.collectorNumber} · ${UI.rarityLabel(item.rarity)}`)),
      el('td', {}, treatment ? el('span', { class: 'wl-cell-treatment' }, treatment) : el('span', { class: 'wl-cell-sub' }, '—')),
      el('td', {}, finishCell),
      el('td', { class: 'td-num' },
        el('span', { class: 'wl-qty-cell' },
          el('button', { class: 'wl-qty-btn', onclick: () => Store.changeQty(item.id, item.finish, -1), 'aria-label': 'Diminuir' }, '−'),
          el('span', { class: 'wl-qty' }, String(item.qty)),
          el('button', { class: 'wl-qty-btn', onclick: () => Store.changeQty(item.id, item.finish, 1), 'aria-label': 'Aumentar' }, '+'))),
      el('td', { class: 'td-num' }, el('span', { class: 'wl-price' }, price ? Store.fmtPrice(price) : '—')),
      el('td', { class: 'td-num' }, el('span', { class: 'wl-price' }, price ? Store.fmtPrice(price * item.qty) : '—')),
      el('td', {},
        el('div', { class: 'wl-row-actions' },
          el('button', { class: 'wl-action-link', title: 'Trocar versão', onclick: () => openVersions(item) }, '🔄'),
          el('button', { class: 'wl-action-link', title: 'Mover para outra wishlist', onclick: () => openMoveChooser(item) }, '📁'),
          el('button', {
            class: 'wl-action-link', title: 'Remover',
            onclick: () => { Store.removeFromWishlist(item.id, item.finish); UI.toast(`${item.displayName} removida.`); }
          }, '🗑️')))
    );
  }

  /* ---------- Renderização (grade / imagens) ---------- */
  function gridTile(item) {
    const { el } = UI;
    const price = Store.itemPriceUsd(item);
    const treatment = UI.treatmentLabel(item);

    return el('div', { class: 'card-tile wl-tile' + (item.acquired ? ' wl-tile-acquired' : '') },
      el('div', { class: 'card-tile-img' },
        el('img', {
          src: item.image, alt: item.displayName, loading: 'lazy',
          style: 'cursor:pointer', title: 'Ver todas as versões',
          onclick: () => openVersions(item)
        }),
        item.acquired ? el('div', { class: 'wl-acquired-ribbon' }, '✓ Adquirida') : null,
        el('div', { class: 'wl-acquire-corner' }, acquireToggle(item, { tile: true })),
        el('div', { class: 'wl-tile-side' },
          el('button', { class: 'wl-side-btn', title: 'Trocar versão', onclick: (e) => { e.stopPropagation(); openVersions(item); } }, '🔄'),
          el('button', { class: 'wl-side-btn', title: 'Mover para outra wishlist', onclick: (e) => { e.stopPropagation(); openMoveChooser(item); } }, '📁'),
          el('button', { class: 'wl-side-btn wl-side-danger', title: 'Remover', onclick: (e) => { e.stopPropagation(); Store.removeFromWishlist(item.id, item.finish); UI.toast(`${item.displayName} removida.`); } }, '🗑️')
        )
      ),
      el('div', { class: 'card-tile-info' },
        el('span', { class: 'card-tile-name', title: item.name }, item.displayName),
        el('span', { class: 'wl-tile-setline', title: item.setName }, `${item.setName} · #${item.collectorNumber}`),
        el('div', { class: 'card-tile-meta' },
          el('span', { class: `rarity-${item.rarity}` }, UI.rarityLabel(item.rarity)),
          el('span', {}, FINISH_LABEL[item.finish] || item.finish)),
        treatment ? el('span', { class: 'card-tile-treatment' }, treatment) : null,
        el('div', { class: 'wl-tile-foot' },
          el('span', { class: 'wl-qty-cell' },
            el('button', { class: 'wl-qty-btn', onclick: () => Store.changeQty(item.id, item.finish, -1), 'aria-label': 'Diminuir' }, '−'),
            el('span', { class: 'wl-qty' }, String(item.qty)),
            el('button', { class: 'wl-qty-btn', onclick: () => Store.changeQty(item.id, item.finish, 1), 'aria-label': 'Aumentar' }, '+')),
          el('span', { class: 'wl-tile-total' }, price ? Store.fmtPrice(price * item.qty) : '—'))
      )
    );
  }

  async function openVersions(item) {
    const card = await Scryfall.byId(item.id);
    if (card) CardModal.open(card);
  }

  /* ---------- Diálogo genérico (#wlDialog) ---------- */
  function closeDialog() {
    const m = $('wlDialog');
    m.hidden = true; m.innerHTML = '';
    if (!isCardOrPickerOpen()) document.body.style.overflow = '';
  }
  function isCardOrPickerOpen() {
    return !$('cardModal').hidden || !$('setPicker').hidden;
  }
  function openDialog(sheet) {
    const m = $('wlDialog');
    m.innerHTML = '';
    m.append(sheet);
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    m.onclick = (e) => { if (e.target === m) closeDialog(); };
  }

  /* ---------- Picker de edição ---------- */
  async function openEditionPicker() {
    const { el } = UI;
    await ensureSetIcons();
    const editions = wishlistSets();

    const list = el('div', { class: 'set-picker-list' });
    const pick = (code) => { state.setFilter = code; closeDialog(); render(); };

    const input = el('input', {
      class: 'select', style: 'width: 100%', type: 'search',
      placeholder: 'Buscar edição… ex.: Final Fantasy, Dominaria',
      'aria-label': 'Buscar edição'
    });

    function renderList(filter = '') {
      const f = filter.trim().toLowerCase();
      list.innerHTML = '';

      if (!f) {
        list.append(el('button', {
          class: 'set-item' + (state.setFilter === '' ? ' current' : ''),
          onclick: () => pick('')
        },
          el('span', { class: 'set-item-icon', style: 'display:flex;align-items:center;justify-content:center;font-size:1.1rem' }, '🗺️'),
          el('span', { class: 'set-item-name' }, 'Todas as edições'),
          el('span', { class: 'set-item-meta' }, `${Store.wishlist.length} item(ns)`)
        ));
      }

      const matches = editions.filter(s =>
        !f || s.name.toLowerCase().includes(f) || s.code.toLowerCase().includes(f));

      matches.forEach(s => {
        list.append(el('button', {
          class: 'set-item' + (state.setFilter === s.code ? ' current' : ''),
          onclick: () => pick(s.code)
        },
          (setIcons && setIcons[s.code])
            ? el('img', { class: 'set-item-icon', src: setIcons[s.code], alt: '', loading: 'lazy' })
            : el('span', { class: 'set-item-icon' }, ''),
          el('span', { class: 'set-item-name' }, s.name),
          el('span', { class: 'set-item-meta' }, `${s.code.toUpperCase()} · ${s.count}`)
        ));
      });

      if (!matches.length && f) {
        list.append(el('div', { class: 'version-loading' }, 'Nenhuma edição encontrada.'));
      }
    }

    input.addEventListener('input', UI.debounce(() => renderList(input.value), 150));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = list.querySelector('.set-item');
        if (first) first.click();
      }
      e.stopPropagation();
    });

    openDialog(el('div', { class: 'modal-sheet' },
      el('div', { class: 'modal-head' },
        el('h2', {}, '🗺️ Filtrar por edição'),
        el('button', { class: 'modal-close', onclick: closeDialog, 'aria-label': 'Fechar' }, '✕')
      ),
      el('div', { class: 'set-picker-search' }, input),
      list
    ));

    renderList();
    input.focus();
  }

  /* ---------- Diálogos: criar / renomear ---------- */
  function nameDialog({ title, sub, value, confirmLabel, onConfirm }) {
    const { el } = UI;
    const input = el('input', {
      class: 'wl-name-input', type: 'text', maxlength: '60',
      placeholder: 'Nome da wishlist', value: value || ''
    });
    const submit = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      onConfirm(name);
      closeDialog();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      e.stopPropagation();
    });
    openDialog(el('div', { class: 'wl-dialog-sheet' },
      el('h2', {}, title),
      sub ? el('p', { class: 'wl-dialog-sub' }, sub) : null,
      input,
      el('div', { class: 'wl-dialog-actions' },
        el('button', { class: 'btn btn-ghost', onclick: closeDialog }, 'Cancelar'),
        el('button', { class: 'btn btn-primary', onclick: submit }, confirmLabel)
      )
    ));
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }

  function openCreateDialog(afterCreate, { activate = true } = {}) {
    nameDialog({
      title: '➕ Nova wishlist',
      sub: 'Dê um nome para organizar suas cartas em listas separadas.',
      confirmLabel: 'Criar',
      onConfirm: (name) => {
        const w = Store.createWishlist(name, activate);
        if (activate) state.setFilter = '';
        if (typeof afterCreate === 'function') afterCreate(w);
        else UI.toast(`📋 Wishlist "${w.name}" criada${activate ? ' e ativada' : ''}.`);
      }
    });
  }

  function openRenameDialog() {
    const active = Store.activeWishlist;
    nameDialog({
      title: '✏️ Renomear wishlist',
      value: active.name,
      confirmLabel: 'Salvar',
      onConfirm: (name) => { Store.renameWishlist(active.id, name); UI.toast('Nome atualizado.'); }
    });
  }

  function confirmDeleteDialog() {
    const { el } = UI;
    const active = Store.activeWishlist;
    openDialog(el('div', { class: 'wl-dialog-sheet' },
      el('h2', {}, '🗑️ Excluir wishlist'),
      el('p', { class: 'wl-dialog-sub' },
        `Excluir "${active.name}" e suas ${active.items.length} carta(s)? Esta ação não pode ser desfeita.`),
      el('div', { class: 'wl-dialog-actions' },
        el('button', { class: 'btn btn-ghost', onclick: closeDialog }, 'Cancelar'),
        el('button', {
          class: 'btn btn-danger',
          onclick: () => { const n = active.name; Store.deleteWishlist(active.id); closeDialog(); UI.toast(`Wishlist "${n}" excluída.`); }
        }, 'Excluir')
      )
    ));
  }

  /* ---------- Menu de wishlists (switcher) ---------- */
  function closeMenu() {
    const menu = $('wlMenu');
    menu.hidden = true; menu.innerHTML = '';
    $('wlActiveBtn').setAttribute('aria-expanded', 'false');
  }

  function buildMenu() {
    const { el } = UI;
    const menu = $('wlMenu');
    menu.innerHTML = '';
    menu.append(el('div', { class: 'wl-menu-label' }, 'Suas wishlists'));

    Store.wishlists.forEach(w => {
      const active = w.id === Store.activeId;
      menu.append(el('button', {
        class: 'wl-menu-item' + (active ? ' current' : ''), role: 'menuitem',
        onclick: () => { if (!active) { Store.switchWishlist(w.id); state.setFilter = ''; } closeMenu(); }
      },
        el('span', {}, '📋'),
        el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, w.name),
        active
          ? el('span', { class: 'wl-menu-check' }, '✓')
          : el('span', { class: 'wl-menu-count' }, String(w.items.length))
      ));
    });

    menu.append(el('div', { class: 'wl-menu-sep' }));
    menu.append(el('button', {
      class: 'wl-menu-item', role: 'menuitem',
      onclick: () => { closeMenu(); openCreateDialog(); }
    }, el('span', {}, '➕'), el('span', {}, 'Nova wishlist')));
    menu.append(el('button', {
      class: 'wl-menu-item', role: 'menuitem',
      onclick: () => { closeMenu(); openRenameDialog(); }
    }, el('span', {}, '✏️'), el('span', {}, 'Renomear atual')));
    menu.append(el('button', {
      class: 'wl-menu-item danger', role: 'menuitem',
      disabled: Store.wishlists.length <= 1 ? '' : null,
      onclick: () => { if (Store.wishlists.length > 1) { closeMenu(); confirmDeleteDialog(); } }
    }, el('span', {}, '🗑️'), el('span', {}, 'Excluir atual')));
  }

  function toggleMenu() {
    const menu = $('wlMenu');
    if (menu.hidden) {
      buildMenu();
      menu.hidden = false;
      $('wlActiveBtn').setAttribute('aria-expanded', 'true');
    } else {
      closeMenu();
    }
  }

  /* ---------- Escolher wishlist ao adicionar carta ---------- */
  function addCard(card, opts = {}) {
    const finish = opts.finish;
    const suffix = finish ? ` (${FINISH_LABEL[finish] || finish})` : '';
    if (Store.wishlists.length === 1) {
      Store.addToWishlist(card, { finish });
      UI.toast(`⭐ ${UI.displayName(card)}${suffix} adicionada à ${Store.activeWishlist.name}`);
      return;
    }
    openAddChooser(card, { finish, suffix });
  }

  function openAddChooser(card, { finish, suffix }) {
    const { el } = UI;

    const doAdd = (listId, listName) => {
      Store.addToWishlist(card, { finish, listId });
      closeDialog();
      UI.toast(`⭐ ${UI.displayName(card)}${suffix} adicionada à ${listName}`);
    };

    const list = el('div', { class: 'wl-dialog-list' });
    Store.wishlists.forEach(w => {
      list.append(el('button', {
        class: 'wl-menu-item' + (w.id === Store.activeId ? ' current' : ''),
        onclick: () => doAdd(w.id, w.name)
      },
        el('span', {}, '📋'),
        el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, w.name),
        el('span', { class: 'wl-menu-count' }, String(w.items.length))
      ));
    });
    list.append(el('div', { class: 'wl-menu-sep' }));
    list.append(el('button', {
      class: 'wl-menu-item', onclick: () => openCreateDialog((w) => doAdd(w.id, w.name))
    }, el('span', {}, '➕'), el('span', {}, 'Nova wishlist…')));

    openDialog(el('div', { class: 'wl-dialog-sheet' },
      el('div', { class: 'modal-head', style: 'padding:0' },
        el('h2', {}, 'Adicionar a qual wishlist?'),
        el('button', { class: 'modal-close', onclick: closeDialog, 'aria-label': 'Fechar' }, '✕')
      ),
      el('div', { class: 'wl-dialog-mini' },
        el('img', { src: card.image_uris?.small || UI.cardImage(card), alt: '' }),
        el('div', {},
          el('div', { style: 'font-weight:600' }, UI.displayName(card)),
          el('div', { class: 'wl-dialog-sub', style: 'margin:0' }, `${card.set_name}${suffix}`))
      ),
      list
    ));
  }

  /* ---------- Mover carta para outra wishlist ---------- */
  function openMoveChooser(item) {
    const { el } = UI;
    const others = Store.wishlists.filter(w => w.id !== Store.activeId);

    const doMove = (listId, listName) => {
      Store.moveItem(item.id, item.finish, listId);
      closeDialog();
      UI.toast(`📁 ${item.displayName} movida para ${listName}`);
    };

    const list = el('div', { class: 'wl-dialog-list' });
    others.forEach(w => {
      list.append(el('button', {
        class: 'wl-menu-item', onclick: () => doMove(w.id, w.name)
      },
        el('span', {}, '📋'),
        el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, w.name),
        el('span', { class: 'wl-menu-count' }, String(w.items.length))
      ));
    });
    if (others.length) list.append(el('div', { class: 'wl-menu-sep' }));
    list.append(el('button', {
      class: 'wl-menu-item', onclick: () => openCreateDialog((w) => doMove(w.id, w.name), { activate: false })
    }, el('span', {}, '➕'), el('span', {}, 'Nova wishlist…')));

    openDialog(el('div', { class: 'wl-dialog-sheet' },
      el('div', { class: 'modal-head', style: 'padding:0' },
        el('h2', {}, 'Mover para qual wishlist?'),
        el('button', { class: 'modal-close', onclick: closeDialog, 'aria-label': 'Fechar' }, '✕')
      ),
      el('div', { class: 'wl-dialog-mini' },
        el('img', { src: item.image, alt: '' }),
        el('div', {},
          el('div', { style: 'font-weight:600' }, item.displayName),
          el('div', { class: 'wl-dialog-sub', style: 'margin:0' }, item.setName))
      ),
      list
    ));
  }

  /* ---------- Sincronização do cabeçalho ---------- */
  function syncSwitcher() {
    $('wlActiveName').textContent = Store.activeWishlist.name;
  }

  async function syncEditionButton() {
    const btn = $('wlEditionBtn');
    const label = $('wlEditionLabel');
    const icon = $('wlEditionIcon');
    if (!state.setFilter) {
      label.textContent = '🗺️ Todas as edições';
      icon.hidden = true;
      return;
    }
    const item = Store.wishlist.find(i => i.set === state.setFilter);
    label.textContent = item ? item.setName : state.setFilter.toUpperCase();
    await ensureSetIcons();
    if (setIcons && setIcons[state.setFilter]) {
      icon.src = setIcons[state.setFilter];
      icon.hidden = false;
    } else {
      icon.hidden = true;
    }
  }

  /* ---------- Render ---------- */
  function render() {
    const { totalUsd, count, acquiredCount, pendingUsd } = Store.wishlistTotals();
    const empty = Store.wishlist.length === 0;

    // se o filtro aponta para uma edição que não existe mais, limpa
    if (state.setFilter && !Store.wishlist.some(i => i.set === state.setFilter)) state.setFilter = '';

    syncSwitcher();
    syncEditionButton();

    const items = sortedItems();
    const filterEmpty = !empty && items.length === 0;
    const gridMode = state.view === 'grid';

    $('wlToolbar').hidden = empty;
    $('wlEditionBtn').hidden = empty;
    $('wlEmpty').hidden = !empty;
    $('wlFilterEmpty').hidden = !filterEmpty;
    $('wlTableWrap').hidden = empty || filterEmpty || gridMode;
    $('wlTable').hidden = empty || filterEmpty || gridMode;
    $('wlGrid').hidden = empty || filterEmpty || !gridMode;

    const grid = state.view === 'grid';
    $('wlViewGrid').classList.toggle('active', grid);
    $('wlViewList').classList.toggle('active', !grid);
    $('wlViewGrid').setAttribute('aria-pressed', String(grid));
    $('wlViewList').setAttribute('aria-pressed', String(!grid));

    const hint = $('wlToolbarHint');
    if (hint) hint.textContent = state.setFilter ? `${items.length} carta(s) nesta edição` : '';

    const hideChk = $('wlHideAcquired');
    if (hideChk) hideChk.checked = state.hideAcquired;
    $('wlHideAcquiredChip').hidden = acquiredCount === 0 && !state.hideAcquired;

    if (gridMode) {
      const g = $('wlGrid');
      g.innerHTML = '';
      items.forEach(item => g.append(gridTile(item)));
    } else {
      const body = $('wlTableBody');
      body.innerHTML = '';
      items.forEach(item => body.append(rowNode(item)));
      syncSortIndicators();
    }

    $('wishlistSummary').innerHTML = empty
      ? 'Adicione cartas para acompanhar o valor total.'
      : `${acquiredCount}/${count} adquirida(s) · Total: <strong>${Store.fmtPrice(totalUsd)}</strong>`
        + (acquiredCount ? ` · Faltam <strong>${Store.fmtPrice(pendingUsd)}</strong>` : '');

    const badge = $('wishlistBadge');
    badge.hidden = count === 0;
    badge.textContent = count;

    // menu aberto: reconstrói para refletir mudanças
    if (!$('wlMenu').hidden) buildMenu();
  }

  /* ---------- Backup ---------- */
  function exportBackup() {
    const active = Store.activeWishlist;
    const payload = {
      app: BACKUP_APP,
      version: 2,
      exported_at: new Date().toISOString(),
      name: active.name,
      items: active.items
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wishlist-${active.name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    UI.toast('💾 Backup exportado.');
  }

  /** Restaura um backup deste app na wishlist ATIVA (sem rede). */
  function importBackup(data, statusEl) {
    let merged = 0;
    for (const item of data.items || []) {
      if (!item?.id || !item?.finish) continue;
      const existing = Store.wishlist.find(i => i.id === item.id && i.finish === item.finish);
      if (existing) existing.qty = Math.max(existing.qty, item.qty || 1);
      else Store.wishlist.push(item);
      merged++;
    }
    Store.saveWishlist();
    statusEl.textContent = `✅ Backup restaurado: ${merged} item(ns).`;
  }

  /* ---------- Importação Scryfall / texto ---------- */
  async function importScryfallJson(text, statusEl) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Arquivo não é um JSON válido.'); }

    // Backup deste próprio app: restaura direto, sem rede
    if (data.app === BACKUP_APP) return importBackup(data, statusEl);

    // Formato de deck/lista do Scryfall: { entries: { section: [ { count, finish, card_digest } ] } }
    const entries = [];
    if (data.entries && typeof data.entries === 'object') {
      for (const section of Object.values(data.entries)) {
        if (!Array.isArray(section)) continue;
        for (const e of section) {
          if (e?.card_digest?.id) {
            entries.push({ id: e.card_digest.id, qty: e.count || 1, foil: e.finish === 'foil' || e.foil === true });
          } else if (e?.raw_text) {
            const m = e.raw_text.match(/^(\d+)\s*[xX]?\s+(.+)$/);
            entries.push({ name: m ? m[2] : e.raw_text, qty: m ? parseInt(m[1], 10) : 1 });
          }
        }
      }
    } else if (Array.isArray(data)) {
      // Export "cards" do Scryfall: array de cartas completas
      for (const c of data) if (c?.id) entries.push({ id: c.id, qty: 1 });
    }

    if (!entries.length) throw new Error('Nenhuma carta encontrada no arquivo.');

    statusEl.textContent = `Buscando ${entries.length} carta(s) no Scryfall…`;

    const byId = entries.filter(e => e.id);
    const byName = entries.filter(e => e.name);
    let ok = 0; const failed = [];

    if (byId.length) {
      const { found, notFound } = await Scryfall.collection(byId.map(e => ({ id: e.id })));
      const entryById = Object.fromEntries(byId.map(e => [e.id, e]));
      for (const card of found) {
        const e = entryById[card.id];
        Store.addToWishlist(card, { qty: e?.qty || 1, finish: e?.foil ? 'foil' : undefined });
        ok++;
      }
      failed.push(...notFound.map(n => n.id));
    }

    for (let i = 0; i < byName.length; i++) {
      const e = byName[i];
      statusEl.textContent = `Buscando por nome ${i + 1}/${byName.length}: ${e.name}…`;
      try {
        const card = await Scryfall.named(e.name);
        if (!card) throw new Error();
        Store.addToWishlist(card, { qty: e.qty });
        ok++;
      } catch { failed.push(e.name); }
    }

    statusEl.textContent = `✅ ${ok} carta(s) importada(s)` +
      (failed.length ? ` · ❌ ${failed.length} não encontrada(s)` : '');
  }

  /** Importa lista de texto: "2 Birds of Paradise" por linha. */
  async function importText(text, statusEl) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    let ok = 0; const failed = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\d+)\s*[xX]?\s+(.+)$/);
      const name = (m ? m[2] : lines[i]).trim();
      const qty = m ? parseInt(m[1], 10) : 1;
      statusEl.textContent = `Buscando ${i + 1}/${lines.length}: ${name}…`;
      try {
        const card = await Scryfall.named(name);
        if (!card) throw new Error();
        Store.addToWishlist(card, { qty });
        ok++;
      } catch { failed.push(name); }
    }
    statusEl.textContent = `✅ ${ok} carta(s) importada(s)` +
      (failed.length ? ` · ❌ não encontradas: ${failed.join(', ')}` : '');
  }

  /* ---------- Eventos ---------- */
  function bind() {
    // Ordenação por coluna
    document.querySelectorAll('#wlTable th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sort.key === key) sort.dir *= -1;
        else { sort.key = key; sort.dir = 1; }
        render();
      });
    });

    // Switcher de wishlists
    $('wlActiveBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (e) => {
      if (!$('wlMenu').hidden && !e.target.closest('.wl-switcher')) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!$('wlMenu').hidden) closeMenu(); if (!$('wlDialog').hidden) closeDialog(); }
    });

    // Seletor de edição
    $('wlEditionBtn').addEventListener('click', openEditionPicker);

    // Alternância de visualização
    const setView = (v) => {
      state.view = v;
      try { localStorage.setItem('wl-view', v); } catch { /* ok */ }
      render();
    };
    $('wlViewList').addEventListener('click', () => setView('list'));
    $('wlViewGrid').addEventListener('click', () => setView('grid'));

    // Ocultar cartas já adquiridas
    $('wlHideAcquired').addEventListener('change', (e) => {
      state.hideAcquired = e.target.checked;
      try { localStorage.setItem('wl-hide-acquired', state.hideAcquired ? '1' : '0'); } catch { /* ok */ }
      render();
    });

    // Autocomplete de adição rápida
    const input = $('wlSearch');
    const sug = $('wlSuggestions');

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
            if (card) CardModal.open(card); // escolhe a versão exata antes de adicionar
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
      if (!e.target.closest('#page-wishlist .search-panel')) sug.hidden = true;
    });

    // Backup e importação
    $('wlExportBtn').addEventListener('click', exportBackup);
    $('wlImportBtn').addEventListener('click', () => {
      $('wlImportPanel').hidden = !$('wlImportPanel').hidden;
      $('wlImportStatus').textContent = '';
    });

    const drop = $('wlDropZone');
    const fileInput = $('wlImportFile');
    const status = $('wlImportStatus');

    async function handleFile(file) {
      if (!file) return;
      try {
        const text = await file.text();
        if (file.name.endsWith('.json')) await importScryfallJson(text, status);
        else await importText(text, status);
      } catch (err) {
        status.textContent = `❌ ${err.message || 'Erro ao importar.'}`;
      }
    }

    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
    }));
    drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

    $('wlImportTextBtn').addEventListener('click', async () => {
      const btn = $('wlImportTextBtn');
      btn.disabled = true;
      await importText($('wlImportText').value, status);
      btn.disabled = false;
      $('wlImportText').value = '';
    });

    // Re-render em qualquer mudança da wishlist / moeda
    Store.subscribe((what) => {
      if (what === 'wishlist' || what === 'wishlists' || what === 'currency') render();
    });

    ensureSetIcons().then(() => { if (App.current === 'wishlist') syncEditionButton(); });
  }

  // API pública da página
  window.WishlistPage = {
    init() { bind(); render(); },
    addCard,
    focusSearch() { $('wlSearch').focus(); }
  };
})();
