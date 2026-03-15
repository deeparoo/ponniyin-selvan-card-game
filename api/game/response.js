const { sql } = require('../_lib/db');
const { deserializeG, serializeG, applyHumanResponse, applyBlockResponse } = require('../_lib/gameLogic');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { roomCode, playerId, responseType, blockCharId } = req.body || {};
    if (!roomCode || !playerId || !responseType) {
      return res.status(400).json({ error: 'roomCode, playerId, and responseType are required' });
    }

    const upperCode = roomCode.toUpperCase().trim();

    const playerRows = await sql`
      SELECT seat_index FROM room_players
      WHERE room_code = ${upperCode} AND id = ${playerId}
    `;
    if (playerRows.length === 0) {
      return res.status(403).json({ error: 'Player not in room' });
    }
    const seatIndex = playerRows[0].seat_index;

    const states = await sql`
      SELECT state_json, version FROM game_states WHERE room_code = ${upperCode}
    `;
    if (states.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const { state_json, version } = states[0];
    let G = deserializeG(state_json);

    // Determine if this is a response to an action or a response to a block
    if (G.phase === 'HUMAN_RESPONSE') {
      G = applyHumanResponse(G, seatIndex, responseType, blockCharId);
    } else if (G.phase === 'ACTIVE_QUESTION_BLOCK') {
      // responseType should be 'ACCEPT' or 'QUESTION'
      G = applyBlockResponse(G, seatIndex, responseType);
    } else {
      return res.status(400).json({ error: `Cannot respond in phase: ${G.phase}` });
    }

    const serialized = serializeG(G);
    await sql`
      UPDATE game_states
      SET state_json = ${JSON.stringify(serialized)}, version = ${version + 1}, updated_at = NOW()
      WHERE room_code = ${upperCode}
    `;

    return res.status(200).json({ ok: true, version: version + 1 });
  } catch (err) {
    console.error('response error:', err);
    return res.status(500).json({ error: 'Failed to apply response' });
  }
};
