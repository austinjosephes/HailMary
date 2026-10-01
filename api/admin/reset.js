/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * API: /api/admin/reset
 */

const { adminResetCampaign } = require('../../lib/db');
const { authenticateAdmin } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const session = authenticateAdmin(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Admin session expired or invalid.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const reason = String(body.reason || 'Admin full campaign reset').trim();

  try {
    const updatedData = await adminResetCampaign(reason, session.u || 'admin');
    return res.status(200).json(updatedData);
  } catch (err) {
    console.error('Admin reset error:', err);
    return res.status(500).json({ error: 'Failed to reset campaign data.' });
  }
};
