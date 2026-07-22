/**
 * UI — helpers de interface compartilhados.
 * Global: window.UI
 */
(function () {
  'use strict';

  const UI = {
    /** Cria elemento com atributos e filhos. */
    el(tag, attrs = {}, ...children) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v);
      }
      for (const child of children.flat()) {
        if (child == null) continue;
        node.append(child.nodeType ? child : document.createTextNode(child));
      }
      return node;
    },

    /** <img> que surge com fade suave ao terminar de carregar. */
    img(attrs = {}) {
      const cls = attrs.class ? `${attrs.class} img-fade` : 'img-fade';
      const node = UI.el('img', { ...attrs, class: cls });
      const done = () => node.classList.add('loaded');
      node.addEventListener('load', done, { once: true });
      node.addEventListener('error', done, { once: true });
      if (node.complete && node.naturalWidth) done();
      return node;
    },

    escape(str) {
      return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
    },

    debounce(fn, ms) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    },

    toast(message, type = 'success', ms = 3200) {
      const area = document.getElementById('toastArea');
      if (!area) return;
      const node = UI.el('div', { class: `toast ${type}` }, message);
      area.append(node);
      setTimeout(() => node.remove(), ms);
    },

    /** Formata preço em USD ou BRL conforme moeda ativa. */
    price(usd, currency, rate) {
      const value = parseFloat(usd);
      if (!value) return '—';
      if (currency === 'brl') return `R$ ${(value * rate).toFixed(2).replace('.', ',')}`;
      return `$${value.toFixed(2)}`;
    },

    rarityLabel(rarity) {
      return { common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica', special: 'Especial', bonus: 'Bônus' }[rarity] || rarity;
    },

    /** Rótulo de tratamento especial de uma impressão. */
    treatmentLabel(card) {
      const tags = [];
      const fx = card.frame_effects || [];
      const promos = card.promo_types || [];
      if (card.border_color === 'borderless') tags.push('Borderless');
      if (fx.includes('extendedart')) tags.push('Extended Art');
      if (fx.includes('showcase')) tags.push('Showcase');
      if (fx.includes('etched')) tags.push('Etched');
      if (card.full_art) tags.push('Full Art');
      if (promos.includes('serialized')) tags.push('Serialized');
      if (promos.includes('textured')) tags.push('Textured');
      if (card.promo) tags.push('Promo');
      return tags.join(' · ');
    },

    /** Melhor URL de imagem de uma carta (lida com dupla-face). */
    cardImage(card, size = 'normal') {
      const uris = card.image_uris || card.card_faces?.[0]?.image_uris || {};
      return uris[size] || uris.normal || uris.large || uris.small || '';
    },

    /** Nome exibível: nome impresso (pt) ou flavor name quando existir. */
    displayName(card) {
      return card.printed_name || card.flavor_name || card.name;
    },

    /**
     * Converte texto com símbolos de mana ({W}, {2}, {W/U}, {T}…) em HTML
     * com os SVGs oficiais do Scryfall. O texto é escapado antes.
     */
    manaHtml(text) {
      if (!text) return '';
      return UI.escape(text).replace(/\{([^}]+)\}/g, (_, sym) => {
        const code = sym.toUpperCase().replace(/\//g, '');
        return `<img class="mana-sym" src="https://svgs.scryfall.io/card-symbols/${code}.svg" alt="{${sym}}">`;
      });
    }
  };

  window.UI = UI;
})();
