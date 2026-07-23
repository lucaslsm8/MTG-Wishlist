/**
 * App — inicialização, navegação e preferências globais.
 * Global: window.App
 */
(function () {
  'use strict';

  const PAGES = ['home', 'boosters', 'wishlist', 'collection'];

  const App = {
    current: 'home',

    /** Navega entre páginas. opts.card pré-carrega análise de booster. */
    go(page, opts = {}) {
      if (!PAGES.includes(page)) page = 'home';
      this.current = page;

      PAGES.forEach(p => {
        document.getElementById(`page-${p}`).hidden = p !== page;
        document.getElementById(`page-${p}`).classList.toggle('active', p === page);
      });
      document.querySelectorAll('.nav-link').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.nav === page));

      window.scrollTo({ top: 0 });

      if (page === 'boosters' && opts.card) BoostersPage.analyzeCard(opts.card);
      if (page === 'collection') CollectionPage.onShow();
    },

    init() {
      // Tema
      document.documentElement.dataset.theme = Store.theme;
      const themeBtn = document.getElementById('themeToggle');
      const syncThemeIcon = () => { themeBtn.textContent = Store.theme === 'dark' ? '🌙' : '☀️'; };
      syncThemeIcon();
      themeBtn.addEventListener('click', () => {
        Store.setTheme(Store.theme === 'dark' ? 'light' : 'dark');
        syncThemeIcon();
      });

      // Moeda
      const currency = document.getElementById('currencySelect');
      currency.value = Store.currency;
      currency.addEventListener('change', () => Store.setCurrency(currency.value));
      Store.ensureRate();

      // Navegação
      document.querySelectorAll('[data-nav]').forEach(elm =>
        elm.addEventListener('click', (e) => { e.preventDefault(); this.go(elm.dataset.nav); }));

      // Atalhos de teclado globais
      this.bindShortcuts();

      // Páginas
      HomePage.init();
      BoostersPage.init();
      WishlistPage.init();
      CollectionPage.init();
    },

    /**
     * Atalhos: / pesquisa · 1-3 páginas · setas navegam o grid ·
     * Enter/W/B agem no card focado (tratados no próprio tile) · Esc fecha.
     */
    bindShortcuts() {
      document.addEventListener('keydown', (e) => {
        const typing = e.target?.matches?.('input, textarea, select');
        if (typing) {
          if (e.key === 'Escape') e.target.blur();
          return;
        }

        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const drawerOpen = !document.getElementById('cardModal').hidden;

        switch (e.key) {
          case '/':
            e.preventDefault();
            if (drawerOpen) CardModal.close();
            ({ home: HomePage, boosters: BoostersPage, wishlist: WishlistPage, collection: CollectionPage })[this.current].focusSearch();
            break;
          case '1': this.go('home'); break;
          case '2': this.go('boosters'); break;
          case '3': this.go('wishlist'); break;
          case '4': this.go('collection'); break;
          case 'ArrowLeft':
          case 'ArrowRight':
          case 'ArrowUp':
          case 'ArrowDown':
            if (this.current === 'home' && !drawerOpen) {
              e.preventDefault();
              HomePage.moveFocus(e.key);
            }
            break;
        }
      });
    }
  };

  window.App = App; // exposto para navegação entre features

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => App.init())
    : App.init();
})();
