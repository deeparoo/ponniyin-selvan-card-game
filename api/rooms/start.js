const { sql } = require('../_lib/db');
const { initMultiplayerGame, serializeG } = require('../_lib/gameLogic');

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
    const { roomCode, playerId } = req.body || {};
    if (!roomCode || !playerId) {
      return res.status(400).json({ error: 'roomCode and playerId are required' });
    }

    const upperCode = roomCode.toUpperCase().trim();

    const rooms = await sql`
      SELECT code, host_player_id, status, include_expansion
      FROM rooms
      WHERE code = ${upperCode} AND expires_at > NOW()
    `;
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }
    const room = rooms[0];

    if (room.host_player_id !== playerId) {
      return res.status(403).json({ error: 'Only the host can start the game' });
    }

    if (room.status !== 'LOBBY') {
      return res.status(400).json({ error: 'Game already started' });
    }

    const players = await sql`
      SELECT id, seat_index, name, is_ready
      FROM room_players
      WHERE room_code = ${upperCode}
      ORDER BY seat_index ASC
    `;

    if (players.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 players to start' });
    }

    const notReady = players.filter(p => !p.is_ready);
    if (notReady.length > 0) {
      return res.status(400).json({ error: 'All players must be ready before starting' });
    }

    // Initialize game state
    const playerList = players.map(p => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seat_index
    }));

    const G = initMultiplayerGame(playerList, room.include_expansion);
    const serialized = serializeG(G);

    // Insert game state
    await sql`
      INSERT INTO game_states (room_code, state_json, version)
      VALUES (${upperCode}, ${JSON.stringify(serialized)}, 1)
      ON CONFLICT (room_code) DO UPDATE
        SET state_json = ${JSON.stringify(serialized)}, version = 1, updated_at = NOW()
    `;

    // Update room status
    await sql`
      UPDATE rooms SET status = 'PLAYING', updated_at = NOW()
      WHERE code = ${upperCode}
    `;

    return res.status(200).json({ ok: true, started: true });
  } catch (err) {
    console.error('start game error:', err);
    return res.status(500).json({ error: 'Failed to start game' });
  }
};
