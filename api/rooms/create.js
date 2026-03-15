const { sql } = require('../_lib/db');
const { generateRoomCode } = require('../_lib/roomCodes');

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
    const { playerName, playerId, includeExpansion } = req.body || {};
    if (!playerName || !playerId) {
      return res.status(400).json({ error: 'playerName and playerId are required' });
    }

    // Generate unique room code
    let code;
    let attempts = 0;
    while (attempts < 10) {
      code = generateRoomCode();
      const existing = await sql`SELECT code FROM rooms WHERE code = ${code}`;
      if (existing.length === 0) break;
      attempts++;
    }

    // Create room
    await sql`
      INSERT INTO rooms (code, host_player_id, status, include_expansion)
      VALUES (${code}, ${playerId}, 'LOBBY', ${!!includeExpansion})
    `;

    // Remove player from any previous rooms (handles repeated room creation with same playerId)
    await sql`DELETE FROM room_players WHERE id = ${playerId}`;

    // Add host as player with seat 0
    await sql`
      INSERT INTO room_players (id, room_code, seat_index, name, is_ready)
      VALUES (${playerId}, ${code}, 0, ${playerName}, false)
    `;

    return res.status(200).json({
      roomCode: code,
      playerId,
      seatIndex: 0,
      isHost: true
    });
  } catch (err) {
    console.error('create room error:', err);
    return res.status(500).json({ error: 'Failed to create room' });
  }
};
