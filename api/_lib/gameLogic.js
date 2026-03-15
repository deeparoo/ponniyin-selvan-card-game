'use strict';

const { getAllChars } = require('./gameChars');

// Actions that cannot be challenged (no charId required)
const NON_QUESTIONABLE = new Set(['INCOME', 'REPLACE_CARD', 'COUP']);

// Actions that cannot be blocked
const NON_BLOCKABLE = new Set(['INCOME', 'REPLACE_CARD', 'COUP', 'KUNDAVAI_COINS', 'DRAW2']);

// ══════════════════════════════════════════
// SERIALIZATION
// ══════════════════════════════════════════

function serializeG(G) {
  // Extract responded Set BEFORE JSON.stringify (which would lose it)
  let respondedArr = [];
  if (G.pendingAction) {
    if (G.pendingAction.responded instanceof Set) {
      respondedArr = Array.from(G.pendingAction.responded);
    } else if (Array.isArray(G.pendingAction.responded)) {
      respondedArr = G.pendingAction.responded;
    } else if (Array.isArray(G.pendingAction.responded_arr)) {
      respondedArr = G.pendingAction.responded_arr;
    }
  }
  const raw = JSON.parse(JSON.stringify(G));
  if (raw.pendingAction) {
    raw.pendingAction.responded_arr = respondedArr;
    delete raw.pendingAction.responded;
  }
  return raw;
}

function deserializeG(raw) {
  const G = JSON.parse(JSON.stringify(raw));
  if (G.pendingAction) {
    G.pendingAction.responded = new Set(G.pendingAction.responded_arr || []);
    delete G.pendingAction.responded_arr;
  }
  return G;
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

function getAlivePlayers(G) {
  return G.players.filter(p => p.alive);
}

function getCharName(G, charId) {
  if (!charId) return '(unknown)';
  return getAllChars(G.includeExpansion)[charId]?.shortName || charId;
}

function addLog(G, msg, type = 'info') {
  G.log.unshift({ msg, type });
  if (G.log.length > 60) G.log.pop();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawFromDeck(G) {
  if (G.deck.length === 0) return null;
  return G.deck.shift();
}

function returnToDeck(G, card) {
  G.deck.push(card);
  G.deck = shuffle(G.deck);
}

function eliminateCard(G, card) {
  G.eliminated.push(card);
}

function createDeck(includeExpansion) {
  const chars = getAllChars(includeExpansion);
  const deck = [];
  for (const [id, ch] of Object.entries(chars)) {
    for (let i = 0; i < ch.count; i++) {
      deck.push({ charId: id, uid: `${id}_${i}` });
    }
  }
  return deck;
}

function getBlockersFor(G, actionType, targetSeatIndex, blockingSeatIndex) {
  const chars = getAllChars(G.includeExpansion);
  const targetPlayer = targetSeatIndex != null ? G.players.find(p => p.seatIndex === targetSeatIndex) : null;
  const blockingPlayer = G.players.find(p => p.seatIndex === blockingSeatIndex);
  if (!blockingPlayer) return [];
  return Object.values(chars).filter(ch => {
    if (!ch.counter) return false;
    if (!ch.counter.blocks.includes(actionType)) return false;
    if (ch.counter.selfOnly && targetPlayer && blockingPlayer.id !== targetPlayer.id) return false;
    return true;
  }).map(ch => ch.id);
}

function checkWin(G) {
  const alive = getAlivePlayers(G);
  if (alive.length === 1) {
    G.winner = { id: alive[0].id, name: alive[0].name, seatIndex: alive[0].seatIndex };
    G.phase = 'GAME_OVER';
    addLog(G, `${alive[0].name} is the King Maker! The Chola throne is decided.`, 'victory');
    return true;
  }
  return false;
}

function nextPlayer(G) {
  if (checkWin(G)) return;
  G.pendingAction = null;
  G.awaitingResponseFrom = null;
  let idx = G.currentPlayerIdx;
  const total = G.players.length;
  let tries = 0;
  do {
    idx = (idx + 1) % total;
    if (++tries > total + 1) { checkWin(G); return; }
  } while (!G.players[idx].alive);
  G.currentPlayerIdx = idx;
  const current = G.players[idx];
  if (current.coins >= 10) {
    addLog(G, `${current.name} has ${current.coins} coins — must use Coup!`, 'warning');
    G.phase = 'FORCE_ELIMINATE';
    return;
  }
  G.phase = 'ACTION_SELECT';
  addLog(G, `It is ${current.name}'s turn.`);
}

function playerLoseCard(G, seatIndex, cardUid) {
  const player = G.players.find(p => p.seatIndex === seatIndex);
  if (!player) return;
  let card;
  if (cardUid) {
    const idx = player.cards.findIndex(c => c.uid === cardUid);
    if (idx !== -1) [card] = player.cards.splice(idx, 1);
  } else if (player.cards.length > 0) {
    [card] = player.cards.splice(0, 1);
  }
  if (card) {
    eliminateCard(G, card);
    addLog(G, `${player.name} loses their ${getCharName(G, card.charId)} card.`, 'loss');
  }
  if (player.cards.length === 0) {
    player.alive = false;
    addLog(G, `${player.name} has been eliminated!`, 'elimination');
  }
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════

function initMultiplayerGame(playerList, includeExpansion) {
  // playerList = [{id, name, seatIndex}]
  const deck = shuffle(createDeck(includeExpansion));
  const players = playerList.map(p => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    isHuman: true,
    isAI: false,
    cards: [],
    coins: 2,
    alive: true
  }));
  // Sort by seatIndex for deterministic order
  players.sort((a, b) => a.seatIndex - b.seatIndex);
  for (const p of players) {
    p.cards = [deck.shift(), deck.shift()];
  }
  const G = {
    players,
    deck,
    eliminated: [],
    currentPlayerIdx: 0, // seatIndex of first player
    phase: 'ACTION_SELECT',
    pendingAction: null,
    awaitingResponseFrom: null,
    log: [],
    includeExpansion,
    winner: null
  };
  addLog(G, 'The Chola court assembles. May the sharpest mind prevail.');
  addLog(G, `Players: ${players.map(p => p.name).join(', ')}`);
  const current = G.players[0];
  if (current.coins >= 10) {
    G.phase = 'FORCE_ELIMINATE';
    addLog(G, `${current.name} has ${current.coins} coins — must use Coup!`, 'warning');
  }
  addLog(G, `It is ${current.name}'s turn.`);
  return G;
}

// ══════════════════════════════════════════
// RESPONSE COLLECTION
// ══════════════════════════════════════════

function startActionResponse(G) {
  const pa = G.pendingAction;
  if (!pa) return;
  const canQ = !NON_QUESTIONABLE.has(pa.actionType);
  const canBlock = !NON_BLOCKABLE.has(pa.actionType);
  const alive = getAlivePlayers(G);
  const respondents = alive.filter(p => p.seatIndex !== pa.actingPlayerId);
  const anyCanBlock = canBlock && respondents.some(p =>
    getBlockersFor(G, pa.actionType, pa.targetPlayerId, p.seatIndex).length > 0
  );
  if (!canQ && !anyCanBlock) {
    executeAction(G);
    return;
  }
  pa.responded = new Set();
  G.phase = 'RESPONSE_WINDOW';
  collectNextResponse(G);
}

function collectNextResponse(G) {
  const pa = G.pendingAction;
  if (!pa) return;
  const alive = getAlivePlayers(G);
  const respondents = alive.filter(p =>
    p.seatIndex !== pa.actingPlayerId && !pa.responded.has(p.seatIndex)
  );
  if (respondents.length === 0) {
    executeAction(G);
    return;
  }
  const next = respondents[0];
  G.phase = 'HUMAN_RESPONSE';
  G.awaitingResponseFrom = next.seatIndex;
}

// ══════════════════════════════════════════
// ACTION APPLICATION
// ══════════════════════════════════════════

function applyHumanAction(G, seatIndex, actionType, charId, targetSeatIndex, extra) {
  if (G.phase !== 'ACTION_SELECT' && G.phase !== 'FORCE_ELIMINATE') return G;
  if (G.currentPlayerIdx !== seatIndex) return G;

  const player = G.players.find(p => p.seatIndex === seatIndex);
  if (!player || !player.alive) return G;

  extra = extra || {};

  // INCOME
  if (actionType === 'INCOME') {
    player.coins += 1;
    addLog(G, `${player.name} takes 1 coin as Income. [${player.coins} coins]`);
    nextPlayer(G);
    return G;
  }

  // REPLACE_CARD (costs 8, must have exactly 1 card)
  if (actionType === 'REPLACE_CARD') {
    if (player.coins < 8 || player.cards.length !== 1) return G;
    player.coins -= 8;
    const nc = drawFromDeck(G);
    if (nc) {
      player.cards.push(nc);
      addLog(G, `${player.name} pays 8 coins and draws a replacement card.`);
    }
    nextPlayer(G);
    return G;
  }

  // COUP (costs 10)
  if (actionType === 'COUP') {
    if (player.coins < 10) return G;
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive) return G;
    player.coins -= 10;
    addLog(G, `${player.name} pays 10 coins — Coup on ${target.name}!`);
    if (target.cards.length <= 1) {
      playerLoseCard(G, target.seatIndex);
      if (!checkWin(G)) nextPlayer(G);
    } else {
      G.pendingAction = {
        actingPlayerId: seatIndex,
        actionType: 'COUP',
        charId: null,
        targetPlayerId: targetSeatIndex,
        responded: new Set(),
        responded_arr: [],
        blockingPlayerId: null,
        blockCharId: null,
        lossTarget: targetSeatIndex,
        lossType: 'COUP_LOSS',
        extra: {},
        allCards: [],
        afterLossIsBlock: false,
        afterLossIsBlockFail: false
      };
      G.phase = 'LOSE_CARD_SELECT';
    }
    return G;
  }

  // GIFT (can be blocked by PERIYA)
  if (actionType === 'GIFT') {
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'GIFT',
      charId: null,
      targetPlayerId: null,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} takes 2 coins as a Gift (can be blocked).`);
    startActionResponse(G);
    return G;
  }

  // TAX
  if (actionType === 'TAX') {
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'TAX',
      charId: 'PERIYA',
      targetPlayerId: null,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Periya Pazhuvettarayar — Tax.`);
    startActionResponse(G);
    return G;
  }

  // KUNDAVAI_COINS
  if (actionType === 'KUNDAVAI_COINS') {
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'KUNDAVAI_COINS',
      charId: 'KUNDAVAI',
      targetPlayerId: null,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Kundavai — Treasury Gift (+2 coins).`);
    startActionResponse(G);
    return G;
  }

  // DRAW2
  if (actionType === 'DRAW2') {
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'DRAW2',
      charId: 'ARUL',
      targetPlayerId: null,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Arulmozhivarman — Recruit (draw 2 cards).`);
    startActionResponse(G);
    return G;
  }

  // STEAL
  if (actionType === 'STEAL') {
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive) return G;
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'STEAL',
      charId: 'NANDINI',
      targetPlayerId: targetSeatIndex,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Nandini — Steal from ${target.name}.`);
    startActionResponse(G);
    return G;
  }

  // ASSASSINATE
  if (actionType === 'ASSASSINATE') {
    if (player.coins < 4) return G;
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive) return G;
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'ASSASSINATE',
      charId: 'RAVID',
      targetPlayerId: targetSeatIndex,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Ravidasan — Assassination on ${target.name}.`);
    startActionResponse(G);
    return G;
  }

  // SPY
  if (actionType === 'SPY') {
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive) return G;
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'SPY',
      charId: 'AAZHWAR',
      targetPlayerId: targetSeatIndex,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Aazhwarkadiyan — Spy on ${target.name}.`);
    startActionResponse(G);
    return G;
  }

  // GUESS
  if (actionType === 'GUESS') {
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive) return G;
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'GUESS',
      charId: 'VANTHI',
      targetPlayerId: targetSeatIndex,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: extra.guessedCard ? { guessedCard: extra.guessedCard } : {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    if (!extra.guessedCard) {
      // Need player to pick a card to guess — enter intermediate phase
      G.phase = 'GUESS_SELECT';
      addLog(G, `${player.name} claims Vanthiyathevan — Gamble against ${target.name}. Choosing card to guess…`);
      return G;
    }
    addLog(G, `${player.name} claims Vanthiyathevan — Gamble, guessing ${getCharName(G, extra.guessedCard)} from ${target.name}.`);
    startActionResponse(G);
    return G;
  }

  // KANDAMARAN_EXCHANGE
  if (actionType === 'KANDAMARAN_EXCHANGE') {
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive || target.cards.length < 2) return G;
    if (!extra.myCardUid) return G;
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'KANDAMARAN_EXCHANGE',
      charId: 'KANDA',
      targetPlayerId: targetSeatIndex,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: { myCardUid: extra.myCardUid },
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Kandamaran — Force swap with ${target.name}.`);
    startActionResponse(G);
    return G;
  }

  // DISCARD_REPLACE (expansion - Aditha Karikalan)
  if (actionType === 'DISCARD_REPLACE') {
    if (player.coins < 2) return G;
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive) return G;
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'DISCARD_REPLACE',
      charId: 'ADITHA',
      targetPlayerId: targetSeatIndex,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    addLog(G, `${player.name} claims Aditha Karikalan — Decree on ${target.name}.`);
    startActionResponse(G);
    return G;
  }

  // GIVE_COINS (expansion - Manimegalai)
  if (actionType === 'GIVE_COINS') {
    const target = G.players.find(p => p.seatIndex === targetSeatIndex);
    if (!target || !target.alive) return G;
    G.pendingAction = {
      actingPlayerId: seatIndex,
      actionType: 'GIVE_COINS',
      charId: 'MANI',
      targetPlayerId: targetSeatIndex,
      responded: new Set(),
      blockingPlayerId: null,
      blockCharId: null,
      lossTarget: null,
      lossType: null,
      extra: extra.giveAmount != null ? { giveAmount: extra.giveAmount } : {},
      allCards: [],
      afterLossIsBlock: false,
      afterLossIsBlockFail: false
    };
    if (extra.giveAmount == null) {
      // Need player to enter amount — enter intermediate phase
      G.phase = 'GIVE_COINS_SELECT';
      addLog(G, `${player.name} claims Manimegalai — Sacrifice for ${target.name}. Choosing amount…`);
      return G;
    }
    const giveAmount = extra.giveAmount;
    addLog(G, `${player.name} claims Manimegalai — Sacrifice, giving ${giveAmount} coins to ${target.name}.`);
    startActionResponse(G);
    return G;
  }

  return G;
}

// ══════════════════════════════════════════
// RESPONSE (PASS / QUESTION / BLOCK)
// ══════════════════════════════════════════

function applyHumanResponse(G, seatIndex, responseType, blockCharId) {
  if (G.phase !== 'HUMAN_RESPONSE') return G;
  if (G.awaitingResponseFrom !== seatIndex) return G;

  const pa = G.pendingAction;
  if (!pa) return G;

  pa.responded.add(seatIndex);
  G.awaitingResponseFrom = null;

  const actingPlayer = G.players.find(p => p.seatIndex === pa.actingPlayerId);
  const responder = G.players.find(p => p.seatIndex === seatIndex);

  if (responseType === 'PASS') {
    addLog(G, `${responder.name} passes.`);
    collectNextResponse(G);
    return G;
  }

  if (responseType === 'QUESTION') {
    if (!pa.charId || NON_QUESTIONABLE.has(pa.actionType)) return G;
    addLog(G, `${responder.name} questions ${actingPlayer.name}'s claim of ${getCharName(G, pa.charId)}!`);
    resolveQuestion(G, seatIndex, pa.actingPlayerId, pa.charId, false);
    return G;
  }

  if (responseType === 'BLOCK') {
    if (!blockCharId) return G;
    addLog(G, `${responder.name} claims ${getCharName(G, blockCharId)} to block!`);
    handleBlock(G, seatIndex, blockCharId, pa.actingPlayerId);
    return G;
  }

  return G;
}

// ══════════════════════════════════════════
// BLOCK RESPONSE (ACCEPT / QUESTION)
// ══════════════════════════════════════════

function applyBlockResponse(G, seatIndex, responseType) {
  if (G.phase !== 'ACTIVE_QUESTION_BLOCK') return G;
  const pa = G.pendingAction;
  if (!pa) return G;
  if (pa.actingPlayerId !== seatIndex) return G;

  const actingPlayer = G.players.find(p => p.seatIndex === seatIndex);
  const blocker = G.players.find(p => p.seatIndex === pa.blockingPlayerId);

  if (responseType === 'ACCEPT') {
    addLog(G, `${actingPlayer.name} accepts the block. The action is cancelled.`);
    nextPlayer(G);
    return G;
  }

  if (responseType === 'QUESTION') {
    addLog(G, `${actingPlayer.name} questions ${blocker.name}'s block (${getCharName(G, pa.blockCharId)})!`);
    resolveQuestion(G, seatIndex, pa.blockingPlayerId, pa.blockCharId, true);
    return G;
  }

  return G;
}

// ══════════════════════════════════════════
// RESOLVE QUESTION (CHALLENGE)
// ══════════════════════════════════════════

function resolveQuestion(G, questionerSeatIndex, claimedSeatIndex, charId, isBlockChallenge) {
  const questioner = G.players.find(p => p.seatIndex === questionerSeatIndex);
  const claimedPlayer = G.players.find(p => p.seatIndex === claimedSeatIndex);
  if (!questioner || !claimedPlayer) return;

  const hasCard = claimedPlayer.cards.some(c => c.charId === charId);

  if (hasCard) {
    // Challenge FAILS — questioner loses a card, action proceeds (or block stands)
    addLog(G, `${claimedPlayer.name} reveals ${getCharName(G, charId)}! The challenge fails.`);
    // Replace the revealed card
    const revealedCard = claimedPlayer.cards.find(c => c.charId === charId);
    if (revealedCard) {
      const idx = claimedPlayer.cards.indexOf(revealedCard);
      returnToDeck(G, revealedCard);
      const newCard = drawFromDeck(G);
      if (newCard) claimedPlayer.cards[idx] = newCard;
    }
    if (questioner.cards.length <= 1) {
      playerLoseCard(G, questionerSeatIndex);
      if (!checkWin(G)) {
        if (isBlockChallenge) {
          addLog(G, 'The block stands. The action is blocked.');
          nextPlayer(G);
        } else {
          executeAction(G);
        }
      }
    } else {
      G.pendingAction.lossType = 'CHALLENGE_FAILED';
      G.pendingAction.lossTarget = questionerSeatIndex;
      G.pendingAction.afterLossIsBlock = isBlockChallenge;
      G.pendingAction.afterLossIsBlockFail = false;
      G.phase = 'LOSE_CARD_SELECT';
      addLog(G, `${questioner.name}'s challenge failed. They must choose a card to lose.`);
    }
  } else {
    // Challenge SUCCEEDS — bluffer loses a card
    addLog(G, `${claimedPlayer.name} cannot show ${getCharName(G, charId)}! The bluff is exposed.`);
    if (claimedPlayer.cards.length <= 1) {
      playerLoseCard(G, claimedSeatIndex);
      if (!checkWin(G)) {
        if (isBlockChallenge) {
          // Block was a bluff — action proceeds
          executeAction(G);
        } else {
          // Acting player was bluffing — action cancelled
          nextPlayer(G);
        }
      }
    } else {
      G.pendingAction.lossType = 'BLUFF_FAILED';
      G.pendingAction.lossTarget = claimedSeatIndex;
      G.pendingAction.afterLossIsBlockFail = isBlockChallenge;
      G.pendingAction.afterLossIsBlock = false;
      G.phase = 'LOSE_CARD_SELECT';
      addLog(G, `${claimedPlayer.name}'s bluff was exposed. They must choose a card to lose.`);
    }
  }
}

// ══════════════════════════════════════════
// HANDLE BLOCK
// ══════════════════════════════════════════

function handleBlock(G, blockerSeatIndex, blockCharId, actingPlayerSeatIndex) {
  G.pendingAction.blockingPlayerId = blockerSeatIndex;
  G.pendingAction.blockCharId = blockCharId;
  G.phase = 'ACTIVE_QUESTION_BLOCK';
  G.awaitingResponseFrom = actingPlayerSeatIndex;
}

// ══════════════════════════════════════════
// LOSE CARD
// ══════════════════════════════════════════

function applyLoseCard(G, seatIndex, cardUid) {
  if (G.phase !== 'LOSE_CARD_SELECT') return G;
  const pa = G.pendingAction;
  if (!pa) return G;
  if (pa.lossTarget !== seatIndex) return G;

  playerLoseCard(G, seatIndex, cardUid);
  if (checkWin(G)) return G;

  const lt = pa.lossType;

  if (lt === 'BLUFF_FAILED') {
    if (pa.afterLossIsBlockFail) {
      // Block bluff caught — execute the original action
      executeAction(G);
    } else {
      // Acting player bluffed, challenge succeeded — action cancelled
      nextPlayer(G);
    }
  } else if (lt === 'CHALLENGE_FAILED') {
    if (pa.afterLossIsBlock) {
      // Questioner failed to expose block — block stands
      addLog(G, 'The block stands. The action is blocked.');
      nextPlayer(G);
    } else {
      // Questioner failed to expose actor — execute action
      executeAction(G);
    }
  } else if (lt === 'ASSASSINATION' || lt === 'COUP_LOSS') {
    nextPlayer(G);
  } else if (lt === 'ADITHA_REPLACE') {
    // Target discards and draws a new card
    const target = G.players.find(p => p.seatIndex === seatIndex);
    const fresh = drawFromDeck(G);
    if (fresh && target) {
      target.cards.push(fresh);
      target.alive = true;
    }
    nextPlayer(G);
  } else {
    nextPlayer(G);
  }

  return G;
}

// ══════════════════════════════════════════
// KEEP CARDS (DRAW2 exchange)
// ══════════════════════════════════════════

function applyKeepCards(G, seatIndex, keepUids) {
  if (G.phase !== 'CARD_EXCHANGE_SELECT') return G;
  if (G.currentPlayerIdx !== seatIndex) return G;
  const pa = G.pendingAction;
  if (!pa) return G;
  const actor = G.players.find(p => p.seatIndex === seatIndex);
  if (!actor) return G;
  const allCards = pa.allCards || [];
  const kept = allCards.filter(c => keepUids.includes(c.uid));
  allCards.filter(c => !keepUids.includes(c.uid)).forEach(c => returnToDeck(G, c));
  actor.cards = kept;
  addLog(G, `${actor.name} recruits new allies (Arulmozhivarman).`);
  nextPlayer(G);
  return G;
}

// ══════════════════════════════════════════
// GIVE COINS (Manimegalai - set amount before response)
// ══════════════════════════════════════════

function applyGiveCoins(G, seatIndex, amount) {
  // This is called to set the giveAmount before starting response window
  // In multiplayer, GIVE_COINS needs the amount set before responses
  if (G.phase !== 'GIVE_COINS_SELECT') return G;
  if (G.currentPlayerIdx !== seatIndex) return G;
  const pa = G.pendingAction;
  if (!pa) return G;
  pa.extra = pa.extra || {};
  pa.extra.giveAmount = amount;
  const target = pa.targetPlayerId != null ? G.players.find(p => p.seatIndex === pa.targetPlayerId) : null;
  addLog(G, `${G.players.find(p=>p.seatIndex===seatIndex)?.name} claims Manimegalai — giving ${amount} coins to ${target?.name || '?'}.`);
  startActionResponse(G);
  return G;
}

// ══════════════════════════════════════════
// GUESS CARD (Vanthiyathevan - set guess before response)
// ══════════════════════════════════════════

function applyGuessCard(G, seatIndex, guessedCharId) {
  if (G.phase !== 'GUESS_SELECT') return G;
  if (G.currentPlayerIdx !== seatIndex) return G;
  const pa = G.pendingAction;
  if (!pa) return G;
  pa.extra = pa.extra || {};
  pa.extra.guessedCard = guessedCharId;
  const target = pa.targetPlayerId != null ? G.players.find(p => p.seatIndex === pa.targetPlayerId) : null;
  addLog(G, `${G.players.find(p => p.seatIndex === seatIndex)?.name} guesses ${getCharName(G, guessedCharId)} from ${target?.name || '?'}…`);
  startActionResponse(G);
  return G;
}

// ══════════════════════════════════════════
// EXECUTE ACTION
// ══════════════════════════════════════════

function executeAction(G) {
  const pa = G.pendingAction;
  if (!pa) return;
  const actor = G.players.find(p => p.seatIndex === pa.actingPlayerId);
  const target = pa.targetPlayerId != null ? G.players.find(p => p.seatIndex === pa.targetPlayerId) : null;
  G.phase = 'RESOLVING';

  if (pa.actionType === 'GIFT') { doGift(G, actor); return; }
  if (pa.actionType === 'TAX') { doTax(G, actor); return; }
  if (pa.actionType === 'KUNDAVAI_COINS') { doKundavaiCoins(G, actor); return; }
  if (pa.actionType === 'DRAW2') { doDrawTwo(G, actor); return; }
  if (pa.actionType === 'STEAL') { doSteal(G, actor, target); return; }
  if (pa.actionType === 'ASSASSINATE') { doAssassinate(G, actor, target); return; }
  if (pa.actionType === 'SPY') { doSpy(G, actor, target); return; }
  if (pa.actionType === 'GUESS') { doGuess(G, actor, target, pa.extra?.guessedCard); return; }
  if (pa.actionType === 'KANDAMARAN_EXCHANGE') { doKandamaranExchange(G, actor, target, pa.extra?.myCardUid); return; }
  if (pa.actionType === 'DISCARD_REPLACE') { doAdithaAction(G, actor, target); return; }
  if (pa.actionType === 'GIVE_COINS') { doGiveCoins(G, actor, target, pa.extra?.giveAmount || 0); return; }
  nextPlayer(G);
}

// ══════════════════════════════════════════
// ACTION EXECUTORS
// ══════════════════════════════════════════

function doTax(G, actor) {
  actor.coins += 3;
  addLog(G, `${actor.name} (Periya Pazhuvettarayar) collects 3 coins as Tax. [${actor.coins} coins]`);
  nextPlayer(G);
}

function doGift(G, actor) {
  actor.coins += 2;
  addLog(G, `${actor.name} takes 2 coins as a Gift. [${actor.coins} coins]`);
  nextPlayer(G);
}

function doSteal(G, actor, target) {
  if (!target) { nextPlayer(G); return; }
  const amt = Math.min(2, target.coins);
  target.coins -= amt;
  actor.coins += amt;
  addLog(G, `${actor.name} (Nandini) steals ${amt} coin${amt !== 1 ? 's' : ''} from ${target.name}.`);
  nextPlayer(G);
}

function doKundavaiCoins(G, actor) {
  actor.coins += 2;
  addLog(G, `${actor.name} (Kundavai) takes 2 coins from the Treasury. [${actor.coins} coins]`);
  nextPlayer(G);
}

function doDrawTwo(G, actor) {
  const drawn = [drawFromDeck(G), drawFromDeck(G)].filter(Boolean);
  const allCards = [...actor.cards, ...drawn];
  if (allCards.length <= 2) {
    actor.cards = allCards;
    addLog(G, `${actor.name} (Arulmozhivarman) recruits new allies.`);
    nextPlayer(G);
  } else {
    G.pendingAction.allCards = allCards;
    G.phase = 'CARD_EXCHANGE_SELECT';
    addLog(G, `${actor.name} (Arulmozhivarman) draws 2 cards — must choose 2 to keep.`);
  }
}

function doGuess(G, actor, target, guessedCharId) {
  if (!target || !guessedCharId) { nextPlayer(G); return; }
  const correct = target.cards.some(c => c.charId === guessedCharId);
  if (correct) {
    const take = Math.min(3, target.coins);
    target.coins -= take;
    actor.coins += take;
    const cardIdx = target.cards.findIndex(c => c.charId === guessedCharId);
    if (cardIdx !== -1) {
      const old = target.cards[cardIdx];
      const fresh = drawFromDeck(G);
      if (fresh) { returnToDeck(G, old); target.cards[cardIdx] = fresh; }
    }
    addLog(G, `${actor.name} (Vanthiyathevan) guessed correctly! Takes ${take} coin${take !== 1 ? 's' : ''} from ${target.name}.`);
  } else {
    const give = actor.coins;
    target.coins += give;
    actor.coins = 0;
    addLog(G, `${actor.name} (Vanthiyathevan) guessed wrong. Loses all ${give} coin${give !== 1 ? 's' : ''} to ${target.name}.`);
  }
  nextPlayer(G);
}

function doKandamaranExchange(G, actor, target, myCardUid) {
  if (!target || target.cards.length < 2) { nextPlayer(G); return; }
  const myIdx = myCardUid ? actor.cards.findIndex(c => c.uid === myCardUid) : 0;
  const theirIdx = Math.floor(Math.random() * target.cards.length);
  const myCard = actor.cards[myIdx >= 0 ? myIdx : 0] || actor.cards[0];
  const theirCard = target.cards[theirIdx];
  actor.cards[actor.cards.indexOf(myCard)] = theirCard;
  target.cards[theirIdx] = myCard;
  addLog(G, `${actor.name} (Kandamaran) forces a card swap with ${target.name}.`);
  nextPlayer(G);
}

function doAssassinate(G, actor, target) {
  if (actor.coins < 4) { addLog(G, 'Not enough coins to assassinate.'); nextPlayer(G); return; }
  actor.coins -= 4;
  if (!target || !target.alive) { nextPlayer(G); return; }
  addLog(G, `${actor.name} (Ravidasan) assassinates ${target.name}!`, 'loss');
  if (target.cards.length <= 1) {
    playerLoseCard(G, target.seatIndex);
    if (!checkWin(G)) nextPlayer(G);
  } else {
    G.pendingAction.lossType = 'ASSASSINATION';
    G.pendingAction.lossTarget = target.seatIndex;
    G.phase = 'LOSE_CARD_SELECT';
    addLog(G, `${target.name} must choose a card to lose.`);
  }
}

function doSpy(G, actor, target) {
  if (!target) { nextPlayer(G); return; }
  const idx = Math.floor(Math.random() * target.cards.length);
  const spied = target.cards[idx];
  const replacement = drawFromDeck(G);
  if (replacement) { returnToDeck(G, spied); target.cards[idx] = replacement; }
  // In multiplayer we don't reveal what was spied to all players
  // The spy info is stored in extra for the actor to see separately
  G.pendingAction.extra = G.pendingAction.extra || {};
  G.pendingAction.extra.spiedCard = spied ? spied.charId : null;
  G.pendingAction.extra.spiedTarget = target.name;
  addLog(G, `${actor.name} (Aazhwarkadiyan) spies on ${target.name} and replaces their card.`);
  nextPlayer(G);
}

function doAdithaAction(G, actor, target) {
  if (actor.coins < 2) { nextPlayer(G); return; }
  actor.coins -= 2;
  if (!target || !target.alive) { nextPlayer(G); return; }
  if (target.cards.length <= 1) {
    const old = target.cards[0];
    const fresh = drawFromDeck(G);
    if (fresh && old) { returnToDeck(G, old); target.cards[0] = fresh; }
    addLog(G, `${actor.name} (Aditha Karikalan) forces ${target.name} to replace their card.`);
    nextPlayer(G);
  } else {
    G.pendingAction.lossType = 'ADITHA_REPLACE';
    G.pendingAction.lossTarget = target.seatIndex;
    G.phase = 'LOSE_CARD_SELECT';
    addLog(G, `${target.name} must choose a card to discard — Aditha Karikalan forces a replacement.`);
  }
}

function doGiveCoins(G, actor, target, amount) {
  const give = Math.min(amount, actor.coins);
  actor.coins -= give;
  target.coins += give;
  addLog(G, `${actor.name} (Manimegalai) gives ${give} coin${give !== 1 ? 's' : ''} to ${target.name}.`);
  nextPlayer(G);
}

module.exports = {
  initMultiplayerGame,
  applyHumanAction,
  applyHumanResponse,
  applyBlockResponse,
  applyLoseCard,
  applyKeepCards,
  applyGiveCoins,
  applyGuessCard,
  serializeG,
  deserializeG,
  getBlockersFor,
  getAllChars: (G) => getAllChars(G.includeExpansion)
};
