/**
 * Store — estado global com persistência em localStorage.
 * Global: window.Store
 */
(function () {
  'use strict';

  const KEYS = {
    wishlist: 'mtg-wishlist',            // legado (v1) — migrado para "wishlists"
    wishlists: 'mtg-wishlists',
    activeWishlist: 'mtg-active-wishlist',
    theme: 'mtg-theme',
    currency: 'mtg-currency',
    usdBrl: 'mtg-usd-brl',
    boosterPrices: 'mtg-booster-prices',
    acquired: 'mtg-acquired'             // cartas marcadas como adquiridas (independe da wishlist)
  };

  const listeners = new Set();

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function persist(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  }

  function genId() {
    return 'wl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Carrega as wishlists, migrando o formato antigo (uma lista só) se preciso. */
  function loadWishlists() {
    let lists = load(KEYS.wishlists, null);
    if (!Array.isArray(lists) || !lists.length) {
      const legacy = load(KEYS.wishlist, []);
      lists = [{ id: genId(), name: 'Minha Wishlist', items: Array.isArray(legacy) ? legacy : [] }];
    }
    return lists.map(l => ({
      id: l.id || genId(),
      name: l.name || 'Wishlist',
      items: Array.isArray(l.items) ? l.items : []
    }));
  }

  const _wishlists = loadWishlists();
  let _activeId = load(KEYS.activeWishlist, _wishlists[0].id);
  if (!_wishlists.some(w => w.id === _activeId)) _activeId = _wishlists[0].id;

  // Conjunto de cartas marcadas como adquiridas (por id de impressão do Scryfall).
  // É independente das wishlists: marcar como adquirida só apaga/atenua a carta.
  const _acquired = new Set(load(KEYS.acquired, []));

  const Store = {
    wishlists: _wishlists,
    activeId: _activeId,
    wishlist: _wishlists.find(w => w.id === _activeId).items,
    theme: load(KEYS.theme, 'dark'),
    currency: load(KEYS.currency, 'usd'),
    usdBrl: load(KEYS.usdBrl, { rate: 5.4, updated: 0 }),

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify(what) { listeners.forEach(fn => fn(what)); },

    /* ---------- Tema / moeda ---------- */
    setTheme(theme) {
      this.theme = theme;
      persist(KEYS.theme, theme);
      document.documentElement.dataset.theme = theme;
      this.notify('theme');
    },

    setCurrency(currency) {
      this.currency = currency;
      persist(KEYS.currency, currency);
      this.notify('currency');
    },

    /** Cotação USD→BRL: usa cache de 24h, senão busca em API pública. */
    async ensureRate() {
      const DAY = 86_400_000;
      if (Date.now() - this.usdBrl.updated < DAY) return this.usdBrl.rate;
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if (data?.rates?.BRL) {
          this.usdBrl = { rate: data.rates.BRL, updated: Date.now() };
          persist(KEYS.usdBrl, this.usdBrl);
        }
      } catch { /* mantém cotação em cache */ }
      return this.usdBrl.rate;
    },

    fmtPrice(usd) {
      return UI.price(usd, this.currency, this.usdBrl.rate);
    },

    /* ---------- Preços de booster (personalizáveis) ---------- */
    boosterPrices: load(KEYS.boosterPrices, {}),

    /** Preço (USD) do booster: valor personalizado ou referência padrão. */
    getBoosterPrice(type) {
      const base = type === 'collector-special' ? 'collector' : type;
      return this.boosterPrices[base] ?? BoosterData.REFERENCE_PRICES[base] ?? 0;
    },

    isCustomBoosterPrice(type) {
      const base = type === 'collector-special' ? 'collector' : type;
      return this.boosterPrices[base] != null;
    },

    /** Define preço personalizado em USD (null/0 restaura o padrão). */
    setBoosterPrice(type, usd) {
      const base = type === 'collector-special' ? 'collector' : type;
      if (usd > 0) this.boosterPrices[base] = usd;
      else delete this.boosterPrices[base];
      persist(KEYS.boosterPrices, this.boosterPrices);
      this.notify('boosterPrices');
    },

    /* ---------- Wishlists (múltiplas) ---------- */
    get activeWishlist() {
      return this.wishlists.find(w => w.id === this.activeId) || this.wishlists[0];
    },

    /** Persiste todas as wishlists + qual está ativa. */
    saveWishlists() {
      persist(KEYS.wishlists, this.wishlists);
      persist(KEYS.activeWishlist, this.activeId);
    },

    /** Persiste e avisa a UI (mantém o nome antigo por compatibilidade). */
    saveWishlist() {
      this.saveWishlists();
      this.notify('wishlist');
    },

    createWishlist(name, activate = true) {
      const w = { id: genId(), name: (name || '').trim() || 'Nova wishlist', items: [] };
      this.wishlists.push(w);
      if (activate) { this.activeId = w.id; this.wishlist = w.items; }
      this.saveWishlists();
      this.notify('wishlists');
      if (activate) this.notify('wishlist');
      return w;
    },

    renameWishlist(id, name) {
      const w = this.wishlists.find(x => x.id === id);
      if (!w) return;
      w.name = (name || '').trim() || w.name;
      this.saveWishlists();
      this.notify('wishlists');
    },

    /** Remove uma wishlist (nunca a última). */
    deleteWishlist(id) {
      if (this.wishlists.length <= 1) return;
      this.wishlists = this.wishlists.filter(w => w.id !== id);
      if (this.activeId === id) {
        this.activeId = this.wishlists[0].id;
        this.wishlist = this.wishlists[0].items;
      }
      this.saveWishlists();
      this.notify('wishlists');
      this.notify('wishlist');
    },

    switchWishlist(id) {
      const w = this.wishlists.find(x => x.id === id);
      if (!w) return;
      this.activeId = id;
      this.wishlist = w.items;
      this.saveWishlists();
      this.notify('wishlists');
      this.notify('wishlist');
    },

    /** Converte uma carta do Scryfall em item da wishlist. */
    toWishlistItem(card, { qty = 1, finish } = {}) {
      const finishes = card.finishes || [];
      return {
        id: card.id,
        oracleId: card.oracle_id,
        name: card.name,
        displayName: UI.displayName(card),
        set: card.set,
        setName: card.set_name,
        collectorNumber: card.collector_number,
        rarity: card.rarity,
        image: UI.cardImage(card),
        prices: card.prices || {},
        finishes,
        finish: finish && finishes.includes(finish) ? finish
              : finishes.includes('nonfoil') ? 'nonfoil' : (finishes[0] || 'nonfoil'),
        frame_effects: card.frame_effects || [],
        border_color: card.border_color,
        promo_types: card.promo_types || [],
        promo: !!card.promo,
        full_art: !!card.full_art,
        scryfallUri: card.scryfall_uri,
        qty
      };
    },

    /**
     * Adiciona uma impressão específica. A chave de identidade é (id + finish):
     * a mesma versão em foil e normal são itens distintos.
     * opts.listId permite adicionar a uma wishlist específica (padrão: a ativa).
     */
    addToWishlist(card, opts = {}) {
      const target = this.wishlists.find(w => w.id === opts.listId) || this.activeWishlist;
      const item = this.toWishlistItem(card, opts);
      const existing = target.items.find(i => i.id === item.id && i.finish === item.finish);
      if (existing) existing.qty += item.qty;
      else target.items.push(item);
      this.saveWishlists();
      this.notify('wishlist');
      return item;
    },

    removeFromWishlist(id, finish) {
      const list = this.activeWishlist;
      list.items = list.items.filter(i => !(i.id === id && i.finish === finish));
      this.wishlist = list.items;
      this.saveWishlist();
    },

    /** Move um item da wishlist de origem (padrão: a ativa) para outra. */
    moveItem(id, finish, targetListId, sourceListId = this.activeId) {
      const from = this.wishlists.find(w => w.id === sourceListId);
      const to = this.wishlists.find(w => w.id === targetListId);
      if (!from || !to || from.id === to.id) return;
      const idx = from.items.findIndex(i => i.id === id && i.finish === finish);
      if (idx === -1) return;
      const [moved] = from.items.splice(idx, 1);
      const dup = to.items.find(i => i.id === moved.id && i.finish === moved.finish);
      if (dup) dup.qty += moved.qty;
      else to.items.push(moved);
      this.wishlist = this.activeWishlist.items;
      this.saveWishlist();
    },

    changeQty(id, finish, delta) {
      const item = this.activeWishlist.items.find(i => i.id === id && i.finish === finish);
      if (!item) return;
      item.qty = Math.max(1, item.qty + delta);
      this.saveWishlist();
    },

    /* ---------- Adquiridas (avulsas, fora da wishlist) ---------- */
    /** Chave de uma carta no conjunto de adquiridas (id da impressão). */
    acquiredKey(card) { return card?.id || ''; },

    /** A carta já foi marcada como adquirida? */
    isAcquired(card) { return _acquired.has(this.acquiredKey(card)); },

    /** Alterna a marca de adquirida; retorna o novo estado (true = adquirida). */
    toggleAcquired(card) {
      const key = this.acquiredKey(card);
      if (!key) return false;
      const now = !_acquired.has(key);
      if (now) _acquired.add(key); else _acquired.delete(key);
      persist(KEYS.acquired, [..._acquired]);
      this.notify('acquired');
      return now;
    },

    /** Marca/desmarca um item da wishlist como já adquirido. */
    setAcquired(id, finish, value) {
      const item = this.activeWishlist.items.find(i => i.id === id && i.finish === finish);
      if (!item) return;
      item.acquired = !!value;
      this.saveWishlist();
    },

    setFinish(id, oldFinish, newFinish) {
      const list = this.activeWishlist;
      const item = list.items.find(i => i.id === id && i.finish === oldFinish);
      if (!item || !item.finishes.includes(newFinish)) return;
      // Se já existe item igual com o novo acabamento, mescla
      const dup = list.items.find(i => i.id === id && i.finish === newFinish);
      if (dup) {
        dup.qty += item.qty;
        list.items = list.items.filter(i => i !== item);
        this.wishlist = list.items;
      } else {
        item.finish = newFinish;
      }
      this.saveWishlist();
    },

    /** Substitui a impressão de um item mantendo quantidade. */
    replaceVersion(oldId, oldFinish, card) {
      const list = this.activeWishlist;
      const idx = list.items.findIndex(i => i.id === oldId && i.finish === oldFinish);
      if (idx === -1) return;
      const qty = list.items[idx].qty;
      const next = this.toWishlistItem(card, { qty });
      const dup = list.items.find(i => i.id === next.id && i.finish === next.finish && i !== list.items[idx]);
      if (dup) {
        dup.qty += qty;
        list.items.splice(idx, 1);
      } else {
        list.items[idx] = next;
      }
      this.wishlist = list.items;
      this.saveWishlist();
    },

    /** Preço unitário (USD) de um item conforme o acabamento. */
    itemPriceUsd(item) {
      const p = item.prices || {};
      const map = { nonfoil: p.usd, foil: p.usd_foil, etched: p.usd_etched };
      return parseFloat(map[item.finish] || p.usd || p.usd_foil || p.usd_etched || 0) || 0;
    },

    wishlistTotals() {
      let totalUsd = 0, count = 0, acquiredCount = 0, acquiredUsd = 0;
      for (const item of this.wishlist) {
        const line = this.itemPriceUsd(item) * item.qty;
        totalUsd += line;
        count += item.qty;
        if (item.acquired) { acquiredCount += item.qty; acquiredUsd += line; }
      }
      return {
        totalUsd, count, items: this.wishlist.length,
        acquiredCount, acquiredUsd,
        pendingCount: count - acquiredCount,
        pendingUsd: totalUsd - acquiredUsd
      };
    }
  };

  window.Store = Store;
})();
