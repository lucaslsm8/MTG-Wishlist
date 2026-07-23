/**
 * Scryfall — cliente da API com fila, rate limit e cache em memória.
 * Global: window.Scryfall
 * Docs: https://scryfall.com/docs/api
 */
(function () {
  'use strict';

  const API = 'https://api.scryfall.com';
  const MIN_INTERVAL = 110; // ms entre requests (Scryfall pede 50-100ms)

  const cache = new Map();
  let queue = Promise.resolve();
  let lastRequest = 0;

  /** Fetch serializado com rate limit e cache. */
  function request(url, { cacheable = true } = {}) {
    if (cacheable && cache.has(url)) return Promise.resolve(cache.get(url));

    const run = queue.then(async () => {
      const wait = Math.max(0, lastRequest + MIN_INTERVAL - Date.now());
      if (wait) await new Promise(r => setTimeout(r, wait));
      lastRequest = Date.now();

      // Até 5 tentativas com backoff exponencial em caso de rate limit
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.status === 404) return null; // sem resultados
        if (res.status === 429 && attempt < 4) {
          await new Promise(r => setTimeout(r, 1500 * 2 ** attempt));
          lastRequest = Date.now();
          continue;
        }
        if (!res.ok) throw new Error(`Scryfall ${res.status}`);
        return res.json();
      }
    });

    // Mantém a fila viva mesmo com erros
    queue = run.catch(() => {});

    return run.then(data => {
      if (cacheable && data) cache.set(url, data);
      return data;
    });
  }

  const Scryfall = {
    /**
     * Pesquisa de cartas com paginação.
     * Retorna { cards, hasMore, nextPage, total }.
     */
    async search(query, { order = 'name', dir = 'auto', unique = 'cards', page = 1, extras = false } = {}) {
      const params = new URLSearchParams({
        q: query, order, dir, unique, page: String(page),
        include_extras: String(extras), include_multilingual: 'false'
      });
      const data = await request(`${API}/cards/search?${params}`);
      if (!data) return { cards: [], hasMore: false, total: 0 };
      return { cards: data.data || [], hasMore: !!data.has_more, total: data.total_cards || 0, nextPage: data.next_page };
    },

    /** Busca por URL de página seguinte (paginação). */
    async searchUrl(url) {
      const data = await request(url);
      if (!data) return { cards: [], hasMore: false, total: 0 };
      return { cards: data.data || [], hasMore: !!data.has_more, total: data.total_cards || 0, nextPage: data.next_page };
    },

    /**
     * Pesquisa bilíngue: tenta em inglês; sem resultados, tenta nomes impressos em português
     * e converte para as cartas em inglês (via oracle_id) para manter preços/impressões completos.
     */
    async searchBilingual(nameQuery, filters = '', opts = {}) {
      const base = `${nameQuery} ${filters}`.trim();
      let result = await this.search(base, opts);
      if (result.cards.length > 0) return result;

      // Fallback: procurar pelo nome impresso em pt-BR
      const pt = await this.search(`lang:pt ${base}`, { ...opts, unique: 'cards' });
      if (!pt.cards.length) return result;

      const oracleIds = [...new Set(pt.cards.map(c => c.oracle_id))].slice(0, 40);
      const q = oracleIds.map(id => `oracleid:${id}`).join(' or ');
      const en = await this.search(`(${q}) ${filters}`.trim(), opts);
      // Preserva o nome impresso em pt para exibição
      const printedByOracle = Object.fromEntries(pt.cards.map(c => [c.oracle_id, c.printed_name]));
      en.cards.forEach(c => { if (printedByOracle[c.oracle_id]) c.printed_name_pt = printedByOracle[c.oracle_id]; });
      return en;
    },

    /** Autocomplete de nomes de cartas. */
    async autocomplete(q) {
      const data = await request(`${API}/cards/autocomplete?q=${encodeURIComponent(q)}&include_extras=false`);
      return data?.data || [];
    },

    /** Carta por nome (fuzzy). */
    async named(name) {
      return request(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`);
    },

    /** Carta por id. */
    async byId(id) {
      return request(`${API}/cards/${id}`);
    },

    /** Carta pela edição + número de coletor (impressão exata). */
    async bySetNumber(code, number) {
      if (!code || !number) return null;
      return request(`${API}/cards/${encodeURIComponent(String(code).toLowerCase())}/${encodeURIComponent(String(number))}`);
    },

    /** Todas as impressões de uma carta (todas as páginas). */
    async prints(name) {
      const q = encodeURIComponent(`!"${name}"`);
      let url = `${API}/cards/search?order=released&unique=prints&include_extras=true&include_variations=true&q=${q}`;
      const all = [];
      while (url) {
        const data = await request(url);
        if (!data) break;
        all.push(...(data.data || []));
        url = data.has_more ? data.next_page : null;
      }
      return all;
    },

    /** Lote de cartas por identificadores (máx. 75 por chamada — a função pagina sozinha). */
    async collection(identifiers) {
      const found = [], notFound = [];
      for (let i = 0; i < identifiers.length; i += 75) {
        const chunk = identifiers.slice(i, i + 75);
        const res = await fetch(`${API}/cards/collection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        if (!res.ok) throw new Error(`Scryfall ${res.status}`);
        const data = await res.json();
        found.push(...(data.data || []));
        notFound.push(...(data.not_found || []));
        await new Promise(r => setTimeout(r, MIN_INTERVAL));
      }
      return { found, notFound };
    },

    /** Todas as expansões (cacheado). */
    async sets() {
      const data = await request(`${API}/sets`);
      return data?.data || [];
    },

    /**
     * Expansão "principal" mais recente já lançada
     * (expansion/core/masters/draft_innovation com cartas).
     */
    async latestSet() {
      const MAIN_TYPES = new Set(['expansion', 'core', 'masters', 'draft_innovation']);
      const today = new Date().toISOString().slice(0, 10);
      const sets = await this.sets();
      return sets.find(s =>
        MAIN_TYPES.has(s.set_type) &&
        s.card_count > 0 &&
        !s.digital &&
        s.released_at && s.released_at <= today
      ) || null;
    }
  };

  window.Scryfall = Scryfall;
})();
