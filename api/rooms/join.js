const { sql } = require('../_lib/db');

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
    const { roomCode, playerName, playerId } = req.body || {};
    if (!roomCode || !playerName || !playerId) {
      return res.status(400).json({ error: 'roomCode, playerName, and playerId are required' });
    }

    const upperCode = roomCode.toUpperCase().trim();

    // Check if room exists and is in LOBBY state
    const rooms = await sql`
      SELECT code, host_player_id, status, include_expansion
      FROM rooms
      WHERE code = ${upperCode} AND expires_at > NOW()
    `;
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }
    const room = rooms[0];
    if (room.status !== 'LOBBY') {
      return res.status(400).json({ error: 'Game already in progress' });
    }

    // Check if player is already in the room
    const existing = await sql`
      SELECT id, seat_index FROM room_players
      WHERE room_code = ${upperCode} AND id = ${playerId}
    `;
    if (existing.length > 0) {
      // Rejoin - update last_seen
      await sql`
        UPDATE room_players SET last_seen_at = NOW()
        WHERE id = ${playerId} AND room_code = ${upperCode}
      `;
      return res.status(200).json({
        roomCode: upperCode,
        playerId,
        seatIndex: existing[0].seat_index,
        isHost: room.host_player_id === playerId
      });
    }

    // Remove player from any other rooms before joining this one
    await sql`DELETE FROM room_players WHERE id = ${playerId}`;

    // Count current players
    const players = await sql`
      SELECT seat_index FROM room_players
      WHERE room_code = ${upperCode}
      ORDER BY seat_index ASC
    `;
    if (players.length >= 6) {
      return res.status(400).json({ error: 'Room is full (max 6 players)' });
    }

    // Find next available seat
    const takenSeats = new Set(players.map(p => p.seat_index));
    let seatIndex = 0;
    while (takenSeats.has(seatIndex)) seatIndex++;

    await sql`
      INSERT INTO room_players (id, room_code, seat_index, name, is_ready)
      VALUES (${playerId}, ${upperCode}, ${seatIndex}, ${playerName}, false)
    `;

    return res.status(200).json({
      roomCode: upperCode,
      playerId,
      seatIndex,
      isHost: room.host_player_id === playerId
    });
  } catch (err) {
    console.error('join room error:', err);
    return res.status(500).json({ error: 'Failed to join room' });
  }
};
