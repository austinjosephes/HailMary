/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * API: /api/admin/data
 */

const { getAdminData } = require('../../lib/db');
const { authenticateAdmin } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const session = authenticateAdmin(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Admin session expired or invalid.' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await getAdminData();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Admin data fetch error:', err);
    return res.status(500).json({ error: 'Internal server error fetching admin data' });
  }
};
