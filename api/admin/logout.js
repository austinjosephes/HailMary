/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * API: /api/admin/logout
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Clear cookie
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');

  return res.status(200).json({ ok: true, message: 'Logged out successfully' });
};
