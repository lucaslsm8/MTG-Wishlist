/**
 * BoosterData — modelos de booster e cálculo de probabilidade.
 * Global: window.BoosterData
 *
 * As probabilidades são ESTIMATIVAS baseadas nas estruturas oficiais
 * divulgadas pela Wizards of the Coast:
 * - Slot de rara/mítica: uma rara específica aparece ~2x mais que uma mítica
 *   → P(rara X) = 2/(2R+M), P(mítica X) = 1/(2R+M)
 * - Play Booster (2024+): 14 cartas, 6-7 comuns, 3 incomuns, 1 wildcard C/U,
 *   1 wildcard raridade variável, 1 rara/mítica, 1 foil de qualquer raridade.
 * - Collector Booster: 5-6 raras/míticas garantidas, incluindo tratamentos especiais.
 */
(function () {
  'use strict';

  // Datas-chave de mudança de produto
  const PLAY_BOOSTER_START = '2024-02-01';   // Murders at Karlov Manor
  const SET_BOOSTER_START = '2020-09-01';    // Zendikar Rising
  const COLLECTOR_START = '2019-09-01';      // Throne of Eldraine

  /** Preços médios de referência (USD) por tipo de booster. */
  const REFERENCE_PRICES = {
    play: 4.5,
    set: 5.0,
    draft: 4.0,
    collector: 25.0
  };

  const LABELS = {
    play: 'Play Booster',
    set: 'Set Booster',
    draft: 'Draft Booster',
    collector: 'Collector Booster',
    'collector-special': 'Collector — versão especial'
  };

  /** Slots médios de raras/míticas com tratamento especial num Collector Booster. */
  const COLLECTOR_SPECIAL_SLOTS = 1.5;

  /**
   * Probabilidade de UMA versão especial específica (borderless, showcase,
   * extended art…) num Collector Booster, dado o tamanho do pool de versões
   * especiais raras/míticas da expansão.
   */
  function specialProbability(specialPoolSize) {
    if (!specialPoolSize) return 0;
    return 1 - Math.exp(-COLLECTOR_SPECIAL_SLOTS / specialPoolSize);
  }

  /**
   * Tipos de expansão que realmente têm produtos em booster.
   * Exclui commander, promo, box, memorabilia, masterpiece, arsenal, tokens,
   * Secret Lair (alchemy/digital), etc. — onde a carta NÃO sai de booster.
   */
  const BOOSTER_SET_TYPES = new Set([
    'core', 'expansion', 'masters', 'draft_innovation', 'funny'
  ]);

  /** Uma expansão tem booster? (usado para descartar sets sem sentido). */
  function setHasBoosters(set) {
    if (!set || set.digital) return false;
    return BOOSTER_SET_TYPES.has(set.set_type);
  }

  /** Quais tipos de booster existem para uma expansão, conforme tipo e data de lançamento. */
  function boosterTypesForSet(set) {
    if (!setHasBoosters(set)) return [];
    const d = set.released_at || '0000-00-00';
    // Masters e draft_innovation não seguem a linha Play/Set booster do varejo.
    if (set.set_type === 'masters' || set.set_type === 'draft_innovation') {
      return d >= COLLECTOR_START ? ['draft', 'collector'] : ['draft'];
    }
    if (d >= PLAY_BOOSTER_START) return ['play', 'collector'];
    if (d >= SET_BOOSTER_START) return ['draft', 'set', 'collector'];
    if (d >= COLLECTOR_START) return ['draft', 'collector'];
    return ['draft'];
  }

  /**
   * Número esperado de "chances" de uma carta específica aparecer num booster,
   * dado o tipo de booster e a contagem de cartas por raridade no set.
   * counts = { common, uncommon, rare, mythic }
   */
  function expectedCopies(type, rarity, counts, isSpecialVersion) {
    const C = Math.max(counts.common, 1);
    const U = Math.max(counts.uncommon, 1);
    const R = Math.max(counts.rare, 1);
    const M = Math.max(counts.mythic, 1);
    const rareSlot = 2 / (2 * R + M);   // P de UMA rara específica no slot de rara
    const mythicSlot = 1 / (2 * R + M); // P de UMA mítica específica no slot de rara

    switch (type) {
      case 'play': {
        // 6.5 comuns + 3 incomuns + wildcard C/U + wildcard variável + rara/mítica + foil
        const wildcardRare = 0.125; // chance do wildcard ser rara/mítica
        const foilByRarity = { common: 0.6, uncommon: 0.25, rare: 0.12, mythic: 0.03 };
        const base = {
          common: 6.5 / C + 0.44 / C,
          uncommon: 3 / U + 0.44 / U,
          rare: rareSlot + wildcardRare * rareSlot,
          mythic: mythicSlot + wildcardRare * mythicSlot
        }[rarity] || 0;
        const foil = (foilByRarity[rarity] || 0) / { common: C, uncommon: U, rare: R, mythic: M }[rarity];
        return base + foil;
      }
      case 'set': {
        // Set boosters: ~1.34 raras/míticas em média, 12 cartas
        const base = {
          common: 4 / C,
          uncommon: 3.5 / U,
          rare: 1.34 * rareSlot,
          mythic: 1.34 * mythicSlot
        }[rarity] || 0;
        return base;
      }
      case 'draft': {
        return {
          common: 10 / C,
          uncommon: 3 / U,
          rare: rareSlot,
          mythic: mythicSlot
        }[rarity] || 0;
      }
      case 'collector': {
        // ~5.5 raras/míticas garantidas (incl. versões especiais), comuns/incomuns foil
        const rareCount = 5.5;
        const base = {
          common: 4 / C,
          uncommon: 4 / U,
          rare: rareCount * rareSlot,
          mythic: rareCount * mythicSlot
        }[rarity] || 0;
        // Versões especiais (borderless, showcase, extended) praticamente só saem aqui
        return isSpecialVersion ? base : base;
      }
      default: return 0;
    }
  }

  /**
   * Probabilidade (0-1) de abrir a carta em UM booster do tipo dado.
   * Usa aproximação P ≈ 1 - e^(-esperança), correta para valores pequenos.
   */
  function probability(type, rarity, counts, isSpecialVersion = false) {
    const e = expectedCopies(type, rarity, counts, isSpecialVersion);
    return 1 - Math.exp(-e);
  }

  /**
   * Versões especiais (borderless/showcase/extended/promo) não saem em
   * boosters normais — apenas no Collector.
   */
  function availableIn(card, setTypes) {
    const special = !!(card.border_color === 'borderless'
      || (card.frame_effects || []).some(f => ['showcase', 'extendedart', 'etched'].includes(f))
      || card.promo);
    if (card.booster === false && !setTypes.includes('collector')) return [];
    if (special) return setTypes.filter(t => t === 'collector');
    return setTypes;
  }

  // API pública do módulo
  window.BoosterData = { REFERENCE_PRICES, LABELS, boosterTypesForSet, setHasBoosters, probability, specialProbability, availableIn };
})();
