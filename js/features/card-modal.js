/**
 * CardModal — drawer lateral com detalhes completos da carta:
 * custo de mana, texto de regras, P/R, artista, preços por acabamento
 * e todas as versões/impressões para adicionar à wishlist.
 * Global: window.CardModal
 */
(function () {
  'use strict';

  const modal = () => document.getElementById('cardModal');

  const FINISH_LABEL = { nonfoil: 'Normal', foil: 'Foil ✨', etched: 'Etched' };

  function close() {
    const m = modal();
    m.hidden = true;
    m.innerHTML = '';
    document.body.style.overflow = '';
  }

  function priceFor(card, finish) {
    const p = card.prices || {};
    return { nonfoil: p.usd, foil: p.usd_foil, etched: p.usd_etched }[finish];
  }

  /* ---------- Bloco de detalhes ---------- */

  /** Uma "face" da carta (cartas dupla-face têm duas). */
  function faceDetails(face) {
    const { el } = UI;
    const parts = [];

    parts.push(el('div', { class: 'card-detail-title' },
      el('h3', {}, face.printed_name || face.name),
      face.mana_cost ? el('span', { class: 'mana-cost', html: UI.manaHtml(face.mana_cost) }) : null
    ));
    if (face.type_line) parts.push(el('div', { class: 'card-detail-type' }, face.printed_type_line || face.type_line));
    if (face.oracle_text) parts.push(el('div', { class: 'card-detail-oracle', html: UI.manaHtml(face.printed_text || face.oracle_text) }));
    if (face.flavor_text) parts.push(el('div', { class: 'card-detail-flavor' }, face.flavor_text));
    return parts;
  }

  function detailBlock(card, setIconUri) {
    const { el } = UI;
    const faces = card.card_faces?.length ? card.card_faces : [card];
    const treatment = UI.treatmentLabel(card);

    const faceNodes = [];
    faces.forEach((face, i) => {
      if (i > 0) faceNodes.push(el('hr', { class: 'face-divider' }));
      faceNodes.push(...faceDetails(face));
    });

    // Preços por acabamento (com botão de adicionar)
    const priceButtons = (card.finishes || ['nonfoil']).map(finish => {
      const usd = priceFor(card, finish);
      return el('button', {
        class: 'version-add-btn',
        title: `Adicionar ${FINISH_LABEL[finish] || finish} à wishlist`,
        onclick: () => WishlistPage.addCard(card, { finish })
      },
        `⭐ ${FINISH_LABEL[finish] || finish}`,
        usd ? el('span', { class: 'version-price' }, Store.fmtPrice(usd)) : null
      );
    });

    return el('div', { class: 'card-detail' },
      el('div', { class: 'card-detail-img' },
        el('img', { src: UI.cardImage(card, 'large'), alt: card.name })),
      el('div', { class: 'card-detail-body' },
        ...faceNodes,
        el('div', { class: 'card-detail-meta' },
          el('span', { class: `rarity-badge rarity-${card.rarity}` }, UI.rarityLabel(card.rarity)),
          el('span', {},
            setIconUri ? el('img', { class: 'set-inline-icon', src: setIconUri, alt: '' }) : null,
            ` ${card.set_name} (${card.set.toUpperCase()}) · #${card.collector_number}`),
          treatment ? el('span', { class: 'card-detail-treatment', style: 'color: var(--accent-2); font-weight: 600' }, treatment) : null
        ),
        el('div', { class: 'card-detail-prices' }, priceButtons),
        el('div', { class: 'card-detail-actions' },
          el('button', {
            class: 'btn btn-secondary btn-sm',
            onclick: () => { close(); App.go('boosters', { card: card.name }); }
          }, '📦 Analisar boosters'),
          el('a', {
            class: 'btn btn-ghost btn-sm', href: card.scryfall_uri,
            target: '_blank', rel: 'noopener', style: 'text-decoration:none'
          }, '🔗 Ver no Scryfall')
        )
      )
    );
  }

  /* ---------- Card de versão ---------- */
  function versionCard(card, currentId) {
    const { el } = UI;
    const treatment = UI.treatmentLabel(card);
    const finishes = card.finishes || ['nonfoil'];

    const finishRow = el('div', { class: 'version-finish-row' },
      finishes.map(finish => {
        const usd = priceFor(card, finish);
        return el('button', {
          class: 'version-add-btn',
          title: `Adicionar versão ${FINISH_LABEL[finish] || finish} à wishlist`,
          onclick: (e) => {
            e.stopPropagation();
            WishlistPage.addCard(card, { finish });
          }
        },
          `+ ${FINISH_LABEL[finish] || finish}`,
          usd ? el('span', { class: 'version-price' }, Store.fmtPrice(usd)) : null
        );
      })
    );

    return el('div', { class: 'version-card' + (card.id === currentId ? ' current' : '') },
      el('img', { src: UI.cardImage(card), alt: card.name, loading: 'lazy' }),
      el('div', { class: 'version-card-info' },
        el('span', { class: 'version-card-set' }, card.set_name),
        el('span', { class: 'version-card-meta' },
          `#${card.collector_number} · ${UI.rarityLabel(card.rarity)}${card.flavor_name ? ` · ${card.flavor_name}` : ''}`),
        treatment ? el('span', { class: 'version-card-treatment' }, treatment) : null,
        finishRow
      )
    );
  }

  /* ---------- API ---------- */
  const CardModal = {
    /**
     * Abre o drawer com detalhes completos + todas as impressões da carta.
     * @param {object} card - carta Scryfall (qualquer impressão)
     */
    async open(card) {
      const m = modal();
      const { el } = UI;
      m.innerHTML = '';
      m.hidden = false;
      document.body.style.overflow = 'hidden';

      const body = el('div', { class: 'modal-body' });
      const sheet = el('div', { class: 'modal-sheet' },
        el('div', { class: 'modal-head' },
          el('h2', {}, UI.displayName(card)),
          el('button', { class: 'modal-close', onclick: close, 'aria-label': 'Fechar' }, '✕')
        ),
        body
      );
      m.append(sheet);
      m.onclick = (e) => { if (e.target === m) close(); };

      // Ícone da expansão (não bloqueia a renderização)
      let setIconUri = null;
      try {
        const sets = await Scryfall.sets();
        setIconUri = sets.find(s => s.code === card.set)?.icon_svg_uri || null;
      } catch { /* opcional */ }

      body.append(detailBlock(card, setIconUri));
      const loading = el('div', { class: 'version-loading' }, 'Buscando todas as versões…');
      body.append(loading);

      try {
        const prints = await Scryfall.prints(card.name);
        loading.remove();
        if (!prints.length) return;
        body.append(
          el('h3', { class: 'versions-title' },
            'Todas as versões ',
            el('span', { class: 'results-count' }, `${prints.length} impressão(ões) — escolha versão e acabamento`)),
          el('div', { class: 'version-grid' }, prints.map(p => versionCard(p, card.id)))
        );
      } catch {
        loading.textContent = 'Erro ao buscar versões. Tente novamente.';
      }
    },

    close
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal().hidden) close();
  });

  window.CardModal = CardModal;
})();
