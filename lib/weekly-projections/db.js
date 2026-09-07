import { neon } from '@neondatabase/serverless';

export function getDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

export function parsePositiveBigInt(value, field) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text) || BigInt(text) <= 0n) {
    const error = new Error(`${field} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

export function parsePositiveInt(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${field} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

export function parseWeekStart(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const error = new Error('week_start must use YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }

  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text || date.getUTCDay() !== 1) {
    const error = new Error('week_start must be a valid Monday');
    error.statusCode = 400;
    throw error;
  }
  return text;
}

export function handleApiError(res, error) {
  console.error(error);
  return res.status(error?.statusCode || 500).json({
    ok: false,
    error: error?.message || 'Internal server error',
  });
}
