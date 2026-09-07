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

export function parseDate(value, field = 'date') {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const error = new Error(`${field} must use YYYY-MM-DD`);
    error.statusCode = 400;
    throw error;
  }
  const date = new Date(`${text}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    const error = new Error(`${field} must be a valid date`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

export function parseWeekStart(value) {
  const text = parseDate(value, 'week_start');
  const date = new Date(`${text}T12:00:00Z`);
  if (date.getUTCDay() !== 1) {
    const error = new Error('week_start must be a valid Monday');
    error.statusCode = 400;
    throw error;
  }
  return text;
}

export function handleApiError(res, error) {
  console.error(error);
  const statusCode = error?.code === '23505' ? 409 : (error?.statusCode || 500);
  return res.status(statusCode).json({
    ok: false,
    error: error?.code === '23505' ? 'Projection already exists for this date and CRM opportunity' : (error?.message || 'Internal server error'),
  });
}
