const { sql } = require('../_lib/db');
const { deserializeG } = require('../_lib/gameLogic');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const roomCode = req.query?.roomCode || req.body?.roomCode;
    const playerId = req.query?.playerId || req.body?.playerId;

    if (!roomCode) {
      return res.status(400).json({ error: 'roomCode is required' });
    }

    const upperCode = roomCode.toUpperCase().trim();

    // Update last seen
    if (playerId) {
      await sql`
        UPDATE room_players SET last_seen_at = NOW()
        WHERE room_code = ${upperCode} AND id = ${playerId}
      `;
    }

    const states = await sql`
      SELECT state_json, version, response_deadline
      FROM game_states
      WHERE room_code = ${upperCode}
    `;

    if (states.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const stateRow = states[0];
    const G = deserializeG(stateRow.state_json);

    // Build client-visible state
    // Hide other players' card identities (show count only), but show own cards
    const myPlayer = playerId ? G.players.find(p => p.id === playerId) : null;
    const mySeatIndex = myPlayer ? myPlayer.seatIndex : null;

    const clientPlayers = G.players.map(p => {
      const isMe = p.id === playerId;
      return {
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        coins: p.coins,
        alive: p.alive,
        cardCount: p.cards.length,
        // Only reveal your own cards
        cards: isMe ? p.cards : p.cards.map(() => ({ charId: '??', uid: null }))
      };
    });

    // Build pending action info (hide responded set from clients)
    let clientPendingAction = null;
    if (G.pendingAction) {
      const pa = G.pendingAction;
      clientPendingAction = {
        actingPlayerId: pa.actingPlayerId,
        actionType: pa.actionType,
        charId: pa.charId,
        targetPlayerId: pa.targetPlayerId,
        blockingPlayerId: pa.blockingPlayerId,
        blockCharId: pa.blockCharId,
        lossTarget: pa.lossTarget,
        lossType: pa.lossType,
        afterLossIsBlock: pa.afterLossIsBlock,
        afterLossIsBlockFail: pa.afterLossIsBlockFail,
        allCards: pa.actingPlayerId === mySeatIndex ? (pa.allCards || []) : [],
        extra: pa.actingPlayerId === mySeatIndex ? (pa.extra || {}) : {}
      };
    }

    const clientState = {
      players: clientPlayers,
      currentPlayerIdx: G.currentPlayerIdx,
      phase: G.phase,
      pendingAction: clientPendingAction,
      awaitingResponseFrom: G.awaitingResponseFrom,
      log: G.log.slice(0, 30),
      includeExpansion: G.includeExpansion,
      winner: G.winner,
      deckSize: G.deck.length,
      eliminatedCount: G.eliminated.length,
      version: stateRow.version,
      responseDeadline: stateRow.response_deadline
    };

    return res.status(200).json(clientState);
  } catch (err) {
    console.error('game state error:', err);
    return res.status(500).json({ error: 'Failed to get game state' });
  }
};
