# Cogu MTG — Redesign "Galeria + Cogu" (novo shell, mesma lógica)

**Data:** 2026-07-19
**Abordagem:** A (novo shell HTML + CSS novo, reaproveitando a lógica JS existente)
**Status:** Aprovado no brainstorming — pronto para plano de implementação

## 1. Objetivo

Criar um front-end visualmente novo para o Cogu MTG com a melhor UI/UX possível,
mantendo o app atual como **backup congelado e isolado**. Nenhuma mudança de
comportamento/lógica: a mesma pilha JS aciona a nova interface.

Direção estética escolhida: **híbrido "galeria premium + Cogu"** — base escura
editorial elegante (artes das cartas como protagonistas) com a personalidade da
mascote nos detalhes (estados vazios, toasts, micro-animações).

Responsividade: **desktop-first, sem quebrar no mobile** (2–3 breakpoints).

## 2. Organização de arquivos

Backup congelado e autossuficiente; app novo na raiz.

```
MTG/
├── index.html          ← APP NOVO (redesign)
├── css/main.css        ← design system novo (reescrito)
├── js/                 ← lógica (cópia viva, inalterada; evolui aqui daqui pra frente)
├── assets/             ← mascote / imagens
├── backup/             ← ORIGINAL congelado, autossuficiente e intocado
│   ├── index.html
│   ├── css/main.css
│   ├── js/…            (cópia)
│   └── assets/…        (cópia)
├── docs/superpowers/specs/2026-07-19-cogu-mtg-redesign-design.md
└── README.md
```

**Ordem de operações crítica:** copiar TUDO para `backup/` ANTES de tocar em
qualquer arquivo da raiz. `backup/index.html` usa caminhos relativos internos
(`css/…`, `js/…`, `assets/…`), então funciona sozinho ao abrir direto.

## 3. Restrição inviolável — inventário de hooks

O novo `index.html` DEVE conter todos os elementos abaixo, com os mesmos `id`,
`data-*` e a mesma semântica de estado (`hidden`, `.active`, `value`, tipo de
input). Podemos reorganizar a marcação em volta e trocar todas as classes de
estilo, mas estes pontos de conexão são contrato com o JS.

### IDs obrigatórios
- **Shell/nav:** `page-home`, `page-boosters`, `page-wishlist` (cada um com
  toggle de `hidden`/`.active`); botões de nav com `data-nav="home|boosters|wishlist"`;
  `themeToggle`, `currencySelect`, `cardModal`, `setPicker`, `wlDialog`, `toastArea`.
- **Home:** `globalSearch` (input search), `globalSearchClear`, `cardGrid`,
  `resultsTitle`, `resultsCount`, `homeLoader`, `homeEmpty`, `loadMoreBtn`,
  `filtersBtn`, `filtersBadge`, `filtersPanel`, `colorFilter` (com 6 `.color-pip[data-color=W|U|B|R|G|C]`),
  `typeFilter`, `cmcFilter`, `rarityFilter`, `sortFilter`, `clearFilters`,
  `allPrintsToggle`, `setPickerBtn`, `activeSetChip`, `activeSetIcon`,
  `activeSetName`, `activeSetClear`.
- **Boosters:** `boosterSearch`, `boosterSearchBtn`, `boosterSuggestions`,
  `boosterResults`, `boosterEmpty`.
- **Wishlist:** `wlActiveBtn`, `wlActiveName`, `wlMenu`, `wishlistSummary`,
  `wlEditionBtn`, `wlEditionIcon`, `wlEditionLabel`, `wlExportBtn`, `wlImportBtn`,
  `wlSearch`, `wlSuggestions`, `wlImportPanel`, `wlImportFile`, `wlImportText`,
  `wlImportTextBtn`, `wlImportStatus`, `wlDropZone`, `wlToolbar`, `wlToolbarHint`,
  `wlHideAcquired`, `wlHideAcquiredChip`, `wlViewList`, `wlViewGrid`,
  `wlTableWrap`, `wlTable`, `wlTableBody`, `wlGrid`, `wlEmpty`, `wlFilterEmpty`,
  `wishlistBadge`. Cabeçalho da tabela mantém os `th[data-sort=name|set|qty|price|total]`
  com classe `sortable`.
- **Badge de nav da wishlist:** `wishlistBadge` fica dentro do link de nav.

### Classes geradas dinamicamente pelo JS (o CSS novo precisa estilizá-las)
`.card-tile` (+ `-img/-actions/-info/-name/-meta/-price/-set/-treatment`),
`.tile-btn`, `.rarity-common|uncommon|rare|mythic`, `.mana-sym`, `.mana-cost`,
`.modal-sheet`, `.modal-head`, `.modal-close`, `.modal-body`, `.card-detail*`,
`.version-*`, `.rarity-badge`, `.set-item*`, `.set-group-label`, `.suggestion-item`,
`.booster-*` (`card-head`, `set-block`, `set-header`, `table`, `note`, `best-pick`,
`value-tag`, `.prob`, `.meta`), `.price-edit*`, `.price-reset`, `.wl-*` (todo o
conjunto: `row`, `tile`, `thumb`, `qty-*`, `acquire*`, `menu-*`, `dialog-*`,
`cell-*`, `side-btn`, `tile-side`, `acquired-ribbon`, `finish-select`, etc.),
`.toast` (+ `.error`), `.loader`, `.spinner`, `.empty-state`, `.empty-mascot`,
`.status-area`, `.select`, `.btn` (+ variações `primary/secondary/ghost/danger/sm`),
`.view-btn`, `.toggle-chip`, `.active-chip`, `.chip-*`.

**Regra:** a lista de classes acima é derivada do JS atual. Antes de finalizar,
recolher todas as strings de `class:` e `className` nos `js/features/*` e conferir
que cada uma tem estilo no CSS novo (checklist de verificação).

## 4. Shell & navegação

- **Sidebar vertical fixa à esquerda** (~76px rail; expande para ~220px com rótulos
  no hover, ou fixa via preferência). Topo: marca Cogu (mascote + wordmark).
  Meio: nav (🔍 Pesquisa · 📦 Boosters · ⭐ Wishlist + `wishlistBadge`). Rodapé:
  `currencySelect` + `themeToggle`.
- **Topbar contextual** enxuta no conteúdo: busca global protagonista
  (`globalSearch`) + título da área. Some/adapta por página.
- Estado de página continua via `hidden`/`.active` em `#page-*` (JS inalterado);
  a sidebar reflete `.active` no link `[data-nav]` correspondente (o JS já faz isso).
- **Mobile (<720px):** sidebar vira **bottom tab bar** fixa; topbar recolhe a busca
  num campo full-width.

## 5. Sistema estético (tokens)

- **Cores:** base carvão quente mais neutra e profunda que o atual `#12101a`;
  superfícies elevadas em camadas; manter `--accent #e0503c` (vermelho cogumelo)
  e `--accent-2 #34c8a8` (verde Cogu) como acentos **pontuais**. Manter tokens de
  raridade (`--rarity-*`) e `--gold` para preços. Tema claro preservado via
  `[data-theme="light"]`.
- **Tipografia:** título em display (stack de sistema, ex.: `"Georgia"`/grotesk —
  **sem CDN**, offline/CSP-safe); corpo em sans do sistema. Escala mais generosa e
  hierarquia clara (números de preço/total com peso e tamanho de destaque).
- **Espaço & forma:** mais respiro no grid de cartas; raios e sombras recalibrados;
  hover das cartas com elevação + brilho sutil (transform/opacity — barato).
- **Movimento:** micro-interações discretas (fade/rise já existentes, refinadas);
  respeitar `prefers-reduced-motion`.
- **Cogu:** estados vazios ilustrados com a mascote, toasts com toque de
  personalidade, sem infantilizar.

## 6. Tratamento por página

- **Pesquisa:** quando sem busca, **hero da expansão mais recente** (o JS já entrega
  `✨ Lançamento mais recente: <set>` em `resultsTitle`; a vitrine ganha destaque
  visual). Grid de galeria com mais respiro. Filtros num painel/popover mais legível
  (mantendo `filtersPanel`/`colorFilter` e selects).
- **Boosters:** o **melhor custo-benefício** (`best-pick`) vira card-destaque no topo;
  blocos por set (`booster-set-block`) mais limpos; célula de preço editável
  (`price-edit`) visivelmente clicável.
- **Wishlist:** total como **número-tesouro** grande (`wishlistSummary`), progresso de
  adquiridas em barra, tabela densa (`wl-table`) repaginada + modo grade (`wl-grid`).

## 7. Responsividade

Desktop-first. Breakpoints alvo: ~1024px (grid encolhe), ~720px (sidebar→bottom bar,
topbar recolhe), ~480px (tabela da wishlist colapsa em cartões empilhados via CSS,
sem tocar no JS que gera as linhas). Meta: "não quebrar", não paridade total mobile.

## 8. Verificação (sem testes automatizados no projeto)

Como não há suíte de testes, a verificação é manual e por checklist:
1. **Checklist de hooks:** cada id/classe da seção 3 presente no novo HTML/CSS.
2. **Smoke test funcional** no navegador (ou via browser tool): buscar carta
   (PT e EN), abrir modal de versões, adicionar à wishlist, alternar lista/grade,
   marcar adquirida, analisar boosters + editar preço, trocar tema e moeda,
   abrir seletor de expansões, importar/exportar backup.
3. **Backup intacto:** `backup/index.html` abre e funciona idêntico ao original.
4. **Responsivo:** conferir nos breakpoints que nada fica sobreposto/cortado.
5. **Console limpo:** sem erros de `null` (indício de hook faltando).

## 9. Fora de escopo (YAGNI)

- Nenhuma mudança na lógica JS, na API Scryfall ou no formato do localStorage.
- Sem framework, bundler, ou dependência externa (mantém "abra o index").
- Sem novas funcionalidades — é redesign visual/estrutural, não de features.
- Sem paridade mobile completa (só "não quebrar").
