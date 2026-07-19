# Cogu MTG

Aplicação desktop (navegador) para pesquisa e gerenciamento de cartas de Magic: The Gathering, com a Cogu (a menina cogumelo) como mascote. Sem build, sem dependências: abra `index.html` no navegador.

## Áreas

**🔍 Pesquisa (Home)** — sidebar fixa com pesquisa em português ou inglês (correspondência parcial) e filtros de cor, tipo, custo de mana, raridade, expansão e ordenação. Sem pesquisa ativa, exibe automaticamente a expansão mais recente lançada (detectada dinamicamente via Scryfall — novas coleções aparecem sozinhas). Detalhes/versões abrem num painel lateral.

**📦 Boosters** — pesquise uma carta e veja em quais boosters ela pode aparecer, a chance estimada por booster (Play, Set, Draft, Collector, e linha dedicada para versões especiais no Collector), preço e custo médio por cópia obtida. Os preços de booster são editáveis (clique no valor, na moeda ativa) e ficam salvos. Responde: "qual booster vale mais a pena comprar para conseguir esta carta?"

**⭐ Wishlist** — tabela densa com colunas ordenáveis (carta, edição, qtd, preço, total). Adicione de qualquer pesquisa, escolha a versão exata (arte/expansão/tratamento) e o acabamento (normal/foil/etched); versões diferentes coexistem. Valor total automático. Importa a wishlist do Scryfall (JSON exportado, preservando impressão e acabamento), lista de texto, e tem backup próprio (💾 exporta/restaura sem rede).

## Atalhos de teclado

`/` foca a pesquisa da página atual · `1` `2` `3` trocam de página · setas navegam o grid de cartas · `Enter` abre versões · `W` adiciona à wishlist · `B` analisa boosters · `Esc` fecha painéis.

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
  features/card-modal.js Modal de versões (compartilhado)
  main.js             Navegação, tema, moeda, inicialização
assets/               Mascote Cogu (otimizada + arte original em cogu-source.png)
```

## Notas técnicas

- Dados e preços: [Scryfall API](https://scryfall.com/docs/api) (sem autenticação; rate limit respeitado com fila de ~90ms).
- Pesquisa bilíngue: tenta em inglês; sem resultados, busca nomes impressos `lang:pt` e resolve para as cartas canônicas via `oracle_id`.
- Moeda: USD ou BRL (cotação diária de open.er-api.com, com cache e fallback).
- Probabilidades de booster são estimativas baseadas nas estruturas oficiais dos produtos (slot de rara/mítica ≈ `2/(2R+M)` e `1/(2R+M)`).
- Persistência via `localStorage` (`mtg-wishlist`, `mtg-theme`, `mtg-currency`).
- A importação da wishlist do Scryfall usa o arquivo exportado (Download → JSON) porque a API de decks do Scryfall exige OAuth.
