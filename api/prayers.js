/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * API: /api/prayers
 * GET: Fetch public campaign statistics and recent history
 * POST: Submit prayers atomically with 100,000 target limiting and rate limiting
 */

const { getPublicCampaignData, submitPrayers } = require('../lib/db');
const { validatePrayerAmount } = require('../lib/utils');
const { checkRateLimit, getClientIp } = require('../lib/rate-limit');

module.exports = async function handler(req, res) {
  // Common security & CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Public campaign data
  if (req.method === 'GET') {
    try {
      const data = await getPublicCampaignData();
      return res.status(200).json(data);
    } catch (err) {
      console.error('Error fetching campaign data:', err);
      return res.status(500).json({ error: 'Failed to retrieve campaign data. Please try again.' });
    }
  }

  // POST: Submit prayers
  if (req.method === 'POST') {
    // 1. Rate limiting check
    const rateCheck = checkRateLimit(req);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: `Too many submissions from this device. Please wait ${rateCheck.retryAfterSeconds || 60} seconds before submitting again.`
      });
    }

    // 2. Body parsing
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    // 3. Input validation
    const validation = validatePrayerAmount(body.amount);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // 4. Atomic submission
    try {
      const clientIp = getClientIp(req);
      const result = await submitPrayers(validation.amount, clientIp);

      let message = `Added ${result.creditedAmount.toLocaleString()} Hail Mary${result.creditedAmount === 1 ? '' : 's'} to the offering.`;
      if (result.isGoalFull) {
        message = 'The 100,000 prayer goal has already been reached. No additional prayers were added to the campaign total.';
      } else if (result.creditedAmount < result.submittedAmount) {
        message = `Goal reached! ${result.creditedAmount.toLocaleString()} of your ${result.submittedAmount.toLocaleString()} prayers completed the 100,000 target!`;
      }

      return res.status(200).json({
        ...result,
        message
      });
    } catch (err) {
      console.error('Error saving prayer submission:', err);
      return res.status(500).json({
        error: 'Something went wrong while recording your offering. Please try again.'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
