/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * API: /api/admin/entry/[id] (or /api/admin/entry?id=123)
 * Deletes a submission and atomically subtracts creditedAmount from total and today counts.
 */

const { adminDeleteSubmission } = require('../../../lib/db');
const { authenticateAdmin } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const session = authenticateAdmin(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Admin session expired or invalid.' });
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract ID from query param or path
  let entryId = req.query?.id;
  if (!entryId) {
    const segments = (req.url || '').split('?')[0].split('/');
    entryId = segments[segments.length - 1];
  }

  if (!entryId || isNaN(Number(entryId))) {
    return res.status(400).json({ error: 'Valid submission ID is required.' });
  }

  try {
    const result = await adminDeleteSubmission(Number(entryId), session.u || 'admin');
    if (result.notFound) {
      return res.status(404).json({ error: 'Submission entry not found.' });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('Error deleting submission:', err);
    return res.status(500).json({ error: 'Failed to delete submission.' });
  }
};
