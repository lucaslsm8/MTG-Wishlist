# Cogu MTG

Aplicação desktop (navegador) para pesquisa e gerenciamento de cartas de Magic: The Gathering, com a Cogu (a menina cogumelo) como mascote. Sem build: abra `index.html` no navegador. O núcleo não tem dependências; o único extra é o [Tesseract.js](https://tesseract.projectnaptha.com/) (OCR do scanner de cartas), carregado sob demanda via CDN só quando você usa a câmera.

> **Layout novo ("Galeria + Cogu"):** o `index.html` da raiz é o design repaginado (sidebar lateral, grid de galeria, tema escuro editorial). A versão original está preservada e intacta em **`backup/`** — abra `backup/index.html` para voltar ao layout antigo a qualquer momento. Os dois usam a mesma lógica; só a apresentação muda.

## Áreas

**🔍 Pesquisa (Home)** — sidebar fixa com pesquisa em português ou inglês (correspondência parcial) e filtros de cor, tipo, custo de mana, raridade, expansão e ordenação. Sem pesquisa ativa, exibe automaticamente a expansão mais recente lançada (detectada dinamicamente via Scryfall — novas coleções aparecem sozinhas). Detalhes/versões abrem num painel lateral.

**📦 Boosters** — pesquise uma carta e veja em quais boosters ela pode aparecer, a chance estimada por booster (Play, Set, Draft, Collector, e linha dedicada para versões especiais no Collector), preço e custo médio por cópia obtida. Os preços de booster são editáveis (clique no valor, na moeda ativa) e ficam salvos. Responde: "qual booster vale mais a pena comprar para conseguir esta carta?"

**⭐ Wishlist** — tabela densa com colunas ordenáveis (carta, edição, qtd, preço, total). Adicione de qualquer pesquisa, escolha a versão exata (arte/expansão/tratamento) e o acabamento (normal/foil/etched); versões diferentes coexistem. Valor total automático. Importa a wishlist do Scryfall (JSON exportado, preservando impressão e acabamento), lista de texto, e tem backup próprio (💾 exporta/restaura sem rede).

**💎 Coleção** — as cartas que você já tem. Visão combinada (união por impressão): cartas marcadas como adquiridas na pesquisa **e** itens de qualquer wishlist marcados como adquiridos aparecem juntos, sem duplicar. Presença apenas ("tenho / não tenho"), distinguindo a impressão exata (arte/edição). Cabeçalho compacto com valor total (moeda ativa) e contagem; dois modos de exibição (**Grade** agrupada por coleção e **Compacta** em lista densa para muitas cartas); filtro **multi-seleção** de coleções (veja quantas quiser ao mesmo tempo) e ordenação (nome/preço/raridade). Busca própria para adicionar qualquer carta. Cartas adquiridas na versão antiga (só o id) são recuperadas automaticamente via Scryfall na primeira abertura.

**📷 Escanear carta** — na Coleção, aponte a câmera para uma carta física e adicione-a à coleção. Tem **zoom** (nativo da câmera quando disponível, senão digital; slider, botões e pinça no celular) para o nome preencher o guia, **lanterna** (quando o aparelho suporta) e captura o quadro na **maior resolução possível** (foto do sensor via `ImageCapture`, foco contínuo) para o OCR não sair borrado. Ao capturar, faz OCR local (Tesseract.js, sem enviar a foto para ninguém) de **dois sinais**: o **nome** (topo) e a **edição + número de coletor** (rodapé, que identifica a impressão exata). Junta tudo — impressão exata por edição/número, nome fuzzy, busca por nome e autocomplete — e mostra uma **lista de cartas candidatas** para você tocar na certa. Dá pra escanear várias em sequência. Requer câmera e contexto seguro (https, ex.: GitHub Pages) — em `file://` alguns navegadores bloqueiam a câmera.

## Atalhos de teclado

`/` foca a pesquisa da página atual · `1` `2` `3` `4` trocam de página · setas navegam o grid de cartas · `Enter` abre versões · `W` adiciona à wishlist · `B` analisa boosters · `Esc` fecha painéis.

## Estrutura

```
index.html            Shell da aplicação (3 páginas)
css/main.css          Design system (tokens, componentes, temas claro/escuro)
js/
  core/ui.js          Helpers de UI (el, toast, preço, imagens)
  core/scryfall.js    Cliente da API Scryfall (fila, rate limit, cache, busca bilíngue)
  core/state.js       Estado global + persistência (wishlist, tema, moeda, cotação)
  data/boosters.js    Modelos de booster e cálculo de probabilidade
  features/home.js    Página de pesquisa
  features/boosters.js  Análise de boosters
  features/wishlist.js  Wishlist
  features/collection.js Minha Coleção (cartas adquiridas)
  features/scanner.js   Escanear carta pela câmera (OCR + Scryfall)
  features/card-modal.js Modal de versões (compartilhado)
  main.js             Navegação, tema, moeda, inicialização
assets/               Mascote Cogu (otimizada + arte original em cogu-source.png)
```

## Notas técnicas

- Dados e preços: [Scryfall API](https://scryfall.com/docs/api) (sem autenticação; rate limit respeitado com fila de ~90ms).
- Pesquisa bilíngue: tenta em inglês; sem resultados, busca nomes impressos `lang:pt` e resolve para as cartas canônicas via `oracle_id`.
- Moeda: USD ou BRL (cotação diária de open.er-api.com, com cache e fallback).
- Probabilidades de booster são estimativas baseadas nas estruturas oficiais dos produtos (slot de rara/mítica ≈ `2/(2R+M)` e `1/(2R+M)`).
- Persistência via `localStorage` (`mtg-wishlists`, `mtg-acquired`, `mtg-theme`, `mtg-currency`). A coleção (`mtg-acquired`) guarda um snapshot completo por impressão; ids do formato antigo são hidratados via Scryfall na primeira abertura.
- A importação da wishlist do Scryfall usa o arquivo exportado (Download → JSON) porque a API de decks do Scryfall exige OAuth.
