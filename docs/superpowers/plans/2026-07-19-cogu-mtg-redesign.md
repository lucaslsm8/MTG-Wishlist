# Cogu MTG Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Visual/CSS tasks additionally use the **frontend-design** skill for aesthetic direction.

**Goal:** Ship a new "Galeria + Cogu" front-end for Cogu MTG at the project root, reusing the existing JS logic unchanged, with the original app frozen as a self-contained backup.

**Architecture:** Approach A — new `index.html` (re-organized markup that preserves every JS hook) + a rewritten `css/main.css` design system, driving the same `js/` modules. The original app is copied verbatim into `backup/` before anything at root is touched.

**Tech Stack:** Vanilla HTML/CSS/JS. No build, no bundler, no dependencies, no CDN (offline/CSP-safe). Data via Scryfall API (unchanged). State via localStorage (unchanged).

## Global Constraints

- **No logic changes.** `js/**` is not edited. No changes to Scryfall calls or localStorage schema.
- **No dependencies / no build / no CDN.** App must still work by opening `index.html` directly. System font stacks only.
- **Hook contract is inviolable.** The new HTML must contain every id/`data-*` in the spec's hook inventory (§3), with the same state semantics (`hidden`, `.active`, input `type`, `value`). The new CSS must style every dynamically-generated class.
- **Backup is frozen and self-contained.** `backup/` holds a complete copy (index + css + js + assets); it is never edited after Task 1.
- **Desktop-first, don't break mobile.** Breakpoints ~1024 / ~720 / ~480px.
- **No git, no automated tests in this project.** "Verification" = hook checklist + in-browser smoke test. Checkpoints replace commits.
- **Language:** UI text and comments in Portuguese (pt-BR), matching the codebase.
- **Brand tokens preserved:** `--accent #e0503c`, `--accent-2 #34c8a8`, rarity tokens, `--gold`.

Spec: `docs/superpowers/specs/2026-07-19-cogu-mtg-redesign-design.md`

---

### Task 1: Freeze the original app into `backup/`

**Files:**
- Create: `backup/index.html`, `backup/css/main.css`, `backup/js/**`, `backup/assets/**` (verbatim copies)

**Interfaces:**
- Consumes: nothing.
- Produces: a self-contained, working copy of the current app under `backup/`.

- [ ] **Step 1: Copy the entire current app into `backup/`**

Run (Git Bash):
```bash
cd /c/Users/lucas/Desktop/MTG
mkdir -p backup
cp index.html backup/index.html
cp -r css backup/css
cp -r js backup/js
cp -r assets backup/assets
```

- [ ] **Step 2: Verify the backup is complete and self-contained**

Run:
```bash
ls -R backup | head -40
```
Expected: `backup/index.html`, `backup/css/main.css`, all 8 `backup/js/**/*.js`, and `backup/assets/*` present. `backup/index.html` still references `css/…`, `js/…`, `assets/…` (relative paths resolve inside `backup/`).

- [ ] **Step 3: Smoke-test the backup in the browser**

Open `backup/index.html` (preview tool or file://). Expected: original app loads and works exactly as before (search returns cards, no console errors). This is the safety net — confirm it before touching root.

- [ ] **Step 4: Checkpoint**

Note in progress log: "backup/ frozen and verified working." Do not edit `backup/**` again.

---

### Task 2: New `index.html` shell — full hook-preserving markup

**Files:**
- Modify (replace): `index.html`
- Create: `css/main.css` will be replaced in Task 3; for now keep the existing link so the page is styled-enough to smoke test. (Leave `css/main.css` untouched until Task 3.)

**Interfaces:**
- Consumes: the frozen `js/**` modules (via the same `<script>` tags, same order).
- Produces: a DOM containing 100% of the hook inventory, so all JS features work. Later CSS tasks restyle around it.

**Hook inventory to preserve (from spec §3) — this is the acceptance contract:**
Shell: `page-home`, `page-boosters`, `page-wishlist`; nav buttons with `data-nav="home|boosters|wishlist"`; `themeToggle`, `currencySelect`, `cardModal`, `setPicker`, `wlDialog`, `toastArea`.
Home: `globalSearch`, `globalSearchClear`, `cardGrid`, `resultsTitle`, `resultsCount`, `homeLoader`, `homeEmpty`, `loadMoreBtn`, `filtersBtn`, `filtersBadge`, `filtersPanel`, `colorFilter` + six `.color-pip[data-color=W|U|B|R|G|C]`, `typeFilter`, `cmcFilter`, `rarityFilter`, `sortFilter`, `clearFilters`, `allPrintsToggle`, `setPickerBtn`, `activeSetChip`, `activeSetIcon`, `activeSetName`, `activeSetClear`.
Boosters: `boosterSearch`, `boosterSearchBtn`, `boosterSuggestions`, `boosterResults`, `boosterEmpty`.
Wishlist: `wlActiveBtn`, `wlActiveName`, `wlMenu`, `wishlistSummary`, `wlEditionBtn`, `wlEditionIcon`, `wlEditionLabel`, `wlExportBtn`, `wlImportBtn`, `wlSearch`, `wlSuggestions`, `wlImportPanel`, `wlImportFile`, `wlImportText`, `wlImportTextBtn`, `wlImportStatus`, `wlDropZone`, `wlToolbar`, `wlToolbarHint`, `wlHideAcquired`, `wlHideAcquiredChip`, `wlViewList`, `wlViewGrid`, `wlTableWrap`, `wlTable` (+ `thead` with `th[data-sort=name|set|qty|price|total].sortable`), `wlTableBody`, `wlGrid`, `wlEmpty`, `wlFilterEmpty`, `wishlistBadge`.
Also preserve the select `<option>` values in `typeFilter`/`cmcFilter`/`rarityFilter`/`sortFilter` exactly (they map to Scryfall queries in home.js).

- [ ] **Step 1: Rewrite `index.html` with the new shell structure**

New structure: `<div class="app-shell">` containing an `<aside class="sidebar">` (brand + vertical nav with the three `[data-nav]` buttons incl. `#wishlistBadge`, and footer with `#currencySelect` + `#themeToggle`), and a `<div class="app-content">` containing a `<header class="topbar">` (holds `#globalSearch` + `#globalSearchClear`) and `<main>` with the three `<section id="page-*">`. Keep the `<div id="cardModal">`, `<div id="setPicker">`, `<div id="wlDialog">`, `<div id="toastArea">` and the same 9 `<script>` tags in the same order as the original. Reuse the original page-internal markup (filters, tables, panels) verbatim where possible so no hook is lost — only the outer shell (header→sidebar/topbar) changes in this task. Keep `<link rel="stylesheet" href="css/main.css">` for now.

- [ ] **Step 2: Diff the hook set against the contract**

Run:
```bash
cd /c/Users/lucas/Desktop/MTG
grep -oE 'id="[^"]+"' index.html | sort -u > /tmp/new_ids.txt
grep -oE 'id="[^"]+"' backup/index.html | sort -u > /tmp/old_ids.txt
comm -23 /tmp/old_ids.txt /tmp/new_ids.txt
```
Expected: **empty output** (every id present in the original is present in the new shell). Any line printed = a missing hook to add back before continuing.

- [ ] **Step 3: Smoke-test all three pages with the OLD css still linked**

Open `index.html`. Verify (console must be clean of `null` errors):
search a card (PT + EN), open card modal, add to wishlist, switch list/grid, mark acquired, go to Boosters and analyze a card + edit a price, open expansion picker, toggle theme + currency. All must work — proving the hook contract holds before restyling.

- [ ] **Step 4: Checkpoint**

Progress log: "New shell markup live; hook diff empty; all features work on old CSS."

---

### Task 3: New design system foundation (`css/main.css`) — tokens, reset, shell layout, themes

**Files:**
- Modify (replace): `css/main.css`

**Interfaces:**
- Consumes: the shell markup from Task 2 (`.app-shell`, `.sidebar`, `.topbar`, `.app-content`, `#page-*`).
- Produces: CSS custom properties (tokens) and base/shell rules that later per-page tasks build on. Uses **frontend-design** skill for aesthetic calibration.

- [ ] **Step 1: Use the frontend-design skill**

Invoke `frontend-design` to set aesthetic direction (galeria premium + Cogu): color mood, type scale, spacing rhythm, motion. Apply its guidance to the tokens below.

- [ ] **Step 2: Write tokens + reset + shell layout**

Author `:root` tokens (dark default) and `[data-theme="light"]` overrides. Keep brand tokens verbatim: `--accent:#e0503c; --accent-2:#34c8a8;` plus `--rarity-common/uncommon/rare/mythic`, `--gold`, `--acquired`. Introduce a deeper neutral charcoal base (replacing `#12101a`), layered elevation surfaces, a generous type scale, refined radii/shadows, and a system display+sans font stack (no CDN). Implement `.app-shell` (grid: sidebar + content), `.sidebar` (fixed vertical rail, brand, vertical `.nav-link[data-nav]` with `.active` state + `#wishlistBadge`, footer controls), `.topbar` (search protagonist), and `.app-main` spacing. Preserve `[hidden]{display:none!important}` and `.page`/`.active` visibility. Respect `prefers-reduced-motion`.

- [ ] **Step 3: Verify shell & theming in browser**

Open `index.html`. Expected: sidebar renders with working nav highlight, topbar search is prominent, page switching works, `#themeToggle` flips light/dark cleanly (both themes legible), currency select styled. No layout overflow on the body.

- [ ] **Step 4: Checkpoint** — "Design-system foundation + shell styled; themes verified."

---

### Task 4: Style the Pesquisa (Home) page

**Files:**
- Modify (append/extend): `css/main.css`

**Interfaces:**
- Consumes: tokens/shell from Task 3; the classes `home.js` generates.
- Produces: styles for the search/gallery experience. Uses **frontend-design** skill.

**Classes to cover (generated by home.js / present in markup):** `.results-toolbar`, `.results-heading`, `.toolbar-actions`, `.card-grid`, `.card-tile` (+ `-img`, `-actions`, `-info`, `-name`, `-set`, `-treatment`, `-meta`, `-price`), `.tile-btn`, `.rarity-common|uncommon|rare|mythic`, `.toggle-chip`, `.active-chip`, `.chip-icon`, `.chip-clear`, `.filters-anchor`, `.filters-panel`, `.filters-group`, `.filters-label`, `.color-filter`, `.color-pip` (+ `.active`), `.select` (+ `-sm`), `.btn` variants, `.set-picker-search`, `.set-picker-list`, `.set-item` (+ `.current`), `.set-item-icon|name|meta`, `.set-group-label`, `.suggestions`, `.suggestion-item`, `.status-area`, `.loader`, `.spinner`, `.empty-state`, `.empty-mascot`, `.results-count`, `.mana-sym`.

- [ ] **Step 1: Style the gallery grid + card tiles**

More generous grid gutters; card hover elevation + subtle glow (transform/opacity only); calibrated rarity colors; readable meta row with `--gold` prices. Focus-visible ring for keyboard nav (arrow-key focus used by home.js `moveFocus`).

- [ ] **Step 2: Style the results toolbar, filters popover, set picker, autocomplete**

Legible `filters-panel` popover; active color pips; `active-chip` for selected set; `set-picker` list with year groups + icons; suggestion dropdown.

- [ ] **Step 3: Add the "latest set" hero treatment**

When no search, home.js sets `resultsTitle` to `✨ Lançamento mais recente: <set>`. Give `.results-heading` a hero look (larger title, breathing room). Pure CSS — no JS/markup change beyond a wrapper class already in the shell.

- [ ] **Step 4: Verify Pesquisa in browser**

Search PT + EN; empty state shows Cogu; filters/color pips/set picker work and look right; card hover + keyboard arrows focus tiles; prices reflect currency.

- [ ] **Step 5: Checkpoint** — "Pesquisa styled & verified."

---

### Task 5: Style the Boosters page

**Files:**
- Modify (append/extend): `css/main.css`

**Interfaces:**
- Consumes: tokens/shell; classes from `boosters.js`.
- Produces: styles for booster analysis. Uses **frontend-design** skill.

**Classes to cover:** `.page-intro`, `.intro-mascot`, `.search-panel`, `.search-row`, `.search-box`, `.booster-results`, `.booster-card-head` (+ `.meta`), `.best-pick`, `.booster-set-block`, `.booster-set-header` (+ `.set-icon`, `.set-meta`), `.booster-table` (+ `th/td`, `.prob`, `.value-tag`), `.booster-note`, `.price-edit`, `.price-edit-input`, `.price-reset`, `.empty-state`.

- [ ] **Step 1: Make `best-pick` a hero highlight card**

Promote the "🏆 Melhor custo-benefício" block into a prominent accent card at the top of results (accent-soft background, clear framing) — it's the answer users came for.

- [ ] **Step 2: Style booster set blocks + tables + editable price**

Clean per-set tables; `.prob` in `--accent-2`; `.value-tag` chip; make `.price-edit` visibly clickable (dashed→hover accent) and `.price-edit-input` obvious in edit mode.

- [ ] **Step 3: Verify Boosters in browser**

Analyze a card (e.g., "Sol Ring"); best-pick renders on top; per-set tables readable; click a price → edit → save persists; empty + not-found states show Cogu.

- [ ] **Step 4: Checkpoint** — "Boosters styled & verified."

---

### Task 6: Style the Wishlist page

**Files:**
- Modify (append/extend): `css/main.css`

**Interfaces:**
- Consumes: tokens/shell; classes from `wishlist.js`.
- Produces: styles for the wishlist manager. Uses **frontend-design** skill.

**Classes to cover:** `.wishlist-header`, `.wishlist-summary` (+ `strong`), `.wishlist-actions`, `.wl-switcher`, `.wl-active-btn` (+ `.wl-active-icon`, `.wl-caret`), `.wl-menu` (+ `-label`, `-item`, `.current`, `-check`, `-count`, `-sep`, `.danger`), `.wl-edition-btn` (+ `-icon`, `#wlEditionLabel`), `.wl-dialog-sheet` (+ `-sub`, `-actions`, `-mini`, `-list`), `.wl-name-input`, `.wl-toolbar` (+ `-left`, `-hint`), `.view-toggle`, `.view-btn` (+ `.active`), `.wl-grid`, `.wl-tile` (+ `-setline`, `-foot`, `-total`, `-side`, `-acquired`), `.wl-side-btn` (+ `.wl-side-danger`), `.wl-acquire` (+ `.on`, `.tile-btn`), `.wl-acquire-corner`, `.wl-acquired-ribbon`, `.wl-table-wrap`, `.wl-table` (+ `thead`, `th.sortable`, `.sorted-asc/desc`, `.th-num/.td-num`), `.wl-thumb`, `.wl-cell-name|sub|treatment`, `.wl-price`, `.wl-finish-select`, `.wl-qty-cell|btn|qty`, `.wl-row-actions`, `.wl-action-link`, `.wl-row-acquired`, `.import-panel`, `.import-steps`, `.drop-zone` (+ `.dragover`), `.import-alt`, `.import-status`.

- [ ] **Step 1: Style the header as a "treasure" summary**

`wishlistSummary` total as a large, prominent number (`--gold`); acquired progress readable (consider a slim progress bar from the `acquired/count` text already provided — CSS-only, optional). Style the wishlist switcher dropdown + edition button.

- [ ] **Step 2: Style the dense table + grid tiles + dialogs + import panel**

Repaint `.wl-table` (sticky-feeling header, sortable indicators, hover rows, right-aligned numerics); grid tiles with hover side-actions + acquired ribbon; dialogs (`create/rename/delete/move/add chooser`); import drop-zone.

- [ ] **Step 3: Verify Wishlist in browser**

Add cards; toggle list/grid; sort columns; change qty; mark acquired (+ hide acquired); rename/create/delete lists; move item; open edition filter; export a backup then re-import it; paste a text list. All styled and functional.

- [ ] **Step 4: Checkpoint** — "Wishlist styled & verified."

---

### Task 7: Style shared overlays + Cogu personality

**Files:**
- Modify (append/extend): `css/main.css`

**Interfaces:**
- Consumes: tokens; classes from `card-modal.js` and `ui.js`.
- Produces: styles for the drawer/modal, versions, toasts, empty states, mana symbols. Uses **frontend-design** skill.

**Classes to cover:** `.modal`, `.modal-sheet`, `.modal-head`, `.modal-close`, `.modal-body`, `.card-detail` (+ `-img`, `-body`, `-title`, `-type`, `-oracle`, `-flavor`, `-meta`, `-prices`, `-actions`, `-treatment`), `.mana-cost`, `.rarity-badge`, `.set-inline-icon`, `.face-divider`, `.versions-title`, `.version-grid`, `.version-card` (+ `-info`, `-set`, `-meta`, `-treatment`), `.version-finish-row`, `.version-add-btn`, `.version-price`, `.version-loading`, `.toast` (+ `.error`), `.empty-mascot` refinement.

- [ ] **Step 1: Style the right-side drawer (card modal) + versions grid**

Keep the slide-in drawer; refine detail layout, oracle text block, rarity badge, per-finish add buttons, versions grid.

- [ ] **Step 2: Style toasts + add Cogu touches**

Toasts with personality; empty states leaning on the mascot; consistent motion (respecting reduced-motion).

- [ ] **Step 3: Verify overlays in browser**

Open a card → drawer shows details + all versions; add a finish from the drawer; trigger a toast; confirm mana symbols render inline.

- [ ] **Step 4: Checkpoint** — "Overlays + Cogu touches styled & verified."

---

### Task 8: Responsive breakpoints

**Files:**
- Modify (append): `css/main.css`

**Interfaces:**
- Consumes: all prior styles.
- Produces: media queries so nothing breaks on smaller widths.

- [ ] **Step 1: Add breakpoints**

`~1024px`: card grid columns shrink; toolbar wraps. `~720px`: sidebar becomes a fixed **bottom tab bar** (nav still uses the same `[data-nav]` buttons; only layout changes via CSS), topbar search goes full-width, drawer/modal `width` → near-full. `~480px`: `.wl-table` collapses to stacked cards using CSS (e.g., `display:block` rows with `data`-driven labels or simply horizontal scroll wrapper if labels aren't feasible without markup changes — prefer a scroll wrapper to avoid touching JS-generated rows).

- [ ] **Step 2: Verify responsiveness**

Resize (or use device presets) at 1024 / 720 / 480: no horizontal body scroll, nav reachable, wishlist readable, drawer usable. Desktop remains the primary, polished view.

- [ ] **Step 3: Checkpoint** — "Responsive breakpoints verified."

---

### Task 9: Final verification pass + README note

**Files:**
- Modify: `README.md` (add a short note about `backup/` and the redesign)

**Interfaces:**
- Consumes: the finished app.
- Produces: sign-off.

- [ ] **Step 1: Full hook checklist**

Re-run the id diff from Task 2 Step 2 (expected empty). Then grep every `class:`/`className` literal in `js/features/*` and `js/core/ui.js` and confirm each class has a rule in `css/main.css`:
```bash
grep -rhoE "class: *'[^']+'|className *= *'[^']+'" js | grep -oE "[a-z][a-z0-9-]+" | sort -u
```
Cross-check against `css/main.css`. Any unstyled class → add a rule.

- [ ] **Step 2: End-to-end smoke test (all features)**

Full pass across all 3 pages using the spec §8 list. Console must be clean.

- [ ] **Step 3: Confirm backup still intact**

Open `backup/index.html`: original look + behavior unchanged.

- [ ] **Step 4: Update README**

Add a short section: new app at root, original preserved in `backup/`, how to switch. Keep pt-BR.

- [ ] **Step 5: Final checkpoint** — "Redesign complete, verified, backup intact."

---

## Self-Review

**Spec coverage:** §2 org → Task 1. §3 hooks → Tasks 2 & 9. §4 shell → Tasks 2–3. §5 tokens → Task 3. §6 per-page → Tasks 4–6. §7 responsive → Task 8. §8 verification → each task + Task 9. §9 out-of-scope → enforced by Global Constraints (no JS/logic edits). All covered.

**Placeholder scan:** No TBD/TODO. Visual tasks specify exact class lists + acceptance criteria rather than pre-written final CSS, deferring pixel-level decisions to the frontend-design skill at execution — intentional for a design task, not a placeholder.

**Type consistency:** No new JS types introduced (logic untouched). The id/class inventories are copied verbatim from the spec's hook list and the grep results.
