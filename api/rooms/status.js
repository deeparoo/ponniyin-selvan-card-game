const { sql } = require('../_lib/db');

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

    // Update last seen if playerId provided
    if (playerId) {
      await sql`
        UPDATE room_players SET last_seen_at = NOW()
        WHERE room_code = ${upperCode} AND id = ${playerId}
      `;
    }

    const rooms = await sql`
      SELECT code, host_player_id, status, include_expansion
      FROM rooms
      WHERE code = ${upperCode} AND expires_at > NOW()
    `;
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }
    const room = rooms[0];

    const players = await sql`
      SELECT id, seat_index, name, is_ready
      FROM room_players
      WHERE room_code = ${upperCode}
      ORDER BY seat_index ASC
    `;

    return res.status(200).json({
      roomCode: upperCode,
      status: room.status,
      hostPlayerId: room.host_player_id,
      includeExpansion: room.include_expansion,
      players: players.map(p => ({
        id: p.id,
        seatIndex: p.seat_index,
        name: p.name,
        isReady: p.is_ready
      }))
    });
  } catch (err) {
    console.error('status error:', err);
    return res.status(500).json({ error: 'Failed to get room status' });
  }
};
