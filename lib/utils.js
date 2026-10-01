/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * Utility functions for timezone, formatting, and validation.
 */

const TARGET_GOAL = 100000;
const MAX_SUBMISSION_AMOUNT = 10000;

/**
 * Returns current date in Asia/Kolkata timezone as 'YYYY-MM-DD'
 */
function getKolkataDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Returns current time in Asia/Kolkata timezone formatted as 'hh:mm AM/PM'
 */
function getKolkataTimeString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return formatter.format(date);
}

/**
 * Validates a prayer submission amount.
 * Returns { valid: boolean, amount?: number, error?: string }
 */
function validatePrayerAmount(rawAmount) {
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
    return { valid: false, error: 'Prayer amount is required.' };
  }

  const num = Number(rawAmount);

  if (typeof rawAmount === 'object') {
    return { valid: false, error: 'Invalid submission format.' };
  }

  if (isNaN(num) || !Number.isFinite(num)) {
    return { valid: false, error: 'Amount must be a valid finite number.' };
  }

  if (!Number.isInteger(num)) {
    return { valid: false, error: 'Amount must be a whole integer.' };
  }

  if (num <= 0) {
    return { valid: false, error: 'Amount must be greater than 0.' };
  }

  if (num > MAX_SUBMISSION_AMOUNT) {
    return { valid: false, error: `Maximum allowed submission per request is ${MAX_SUBMISSION_AMOUNT.toLocaleString()} prayers.` };
  }

  return { valid: true, amount: num };
}

/**
 * Safe string escaping for HTML output to prevent XSS
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  TARGET_GOAL,
  MAX_SUBMISSION_AMOUNT,
  getKolkataDateString,
  getKolkataTimeString,
  validatePrayerAmount,
  escapeHtml
};
