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
    const { roomCode, playerId, ready } = req.body || {};
    if (!roomCode || !playerId) {
      return res.status(400).json({ error: 'roomCode and playerId are required' });
    }

    const upperCode = roomCode.toUpperCase().trim();
    const isReady = ready !== false; // default true

    await sql`
      UPDATE room_players
      SET is_ready = ${isReady}, last_seen_at = NOW()
      WHERE room_code = ${upperCode} AND id = ${playerId}
    `;

    return res.status(200).json({ ok: true, ready: isReady });
  } catch (err) {
    console.error('ready error:', err);
    return res.status(500).json({ error: 'Failed to update ready status' });
  }
};
