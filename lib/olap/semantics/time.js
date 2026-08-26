import { VIN_CUBE } from '../vin-cube-registry.js';
import { quoteIdentifier } from '../query/sql-utils.js';

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/;

export function parseSourceDate(value) {
  if (value == null || String(value).trim() === '') {
    return { status:'null', date:null };
  }
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(text);
  let year; let month; let day;
  if (iso) {
    [, year, month, day] = iso;
  } else {
    const source = DATE_RE.exec(text);
    if (!source) return { status:'invalid', date:null };
    month = source[1];
    day = source[2];
    year = 2000 + Number(source[3]);
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const valid = date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
  return valid ? { status:'parsed', date } : { status:'invalid', date:null };
}

export function parseIsoDate(value) {
  if (value == null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.getUTCFullYear() === +match[1]
    && date.getUTCMonth() === +match[2] - 1
    && date.getUTCDate() === +match[3] ? date : null;
}

export function dateKey(date, grain) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (grain === 'day') return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if (grain === 'month') return `${year}-${String(month).padStart(2,'0')}`;
  if (grain === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  if (grain === 'year') return String(year);
  return null;
}

export function daysBetween(asOf, start) {
  return Math.floor((asOf.getTime() - start.getTime()) / 86400000);
}

export function dateSql(expression) {
  const text = `TRIM(${expression}::text)`;
  const iso = `LEFT(${text},10)`;
  const us = `SPLIT_PART(${text},' ',1)`;
  const usIso = `('20' || LPAD(SPLIT_PART(${us},'/',3),2,'0') || '-' || LPAD(SPLIT_PART(${us},'/',1),2,'0') || '-' || LPAD(SPLIT_PART(${us},'/',2),2,'0'))`;
  return `CASE
    WHEN ${text} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN CASE
      WHEN SUBSTRING(${iso},1,4)::int BETWEEN 1 AND 9999
        AND SUBSTRING(${iso},6,2)::int BETWEEN 1 AND 12
        AND SUBSTRING(${iso},9,2)::int BETWEEN 1 AND 31
        AND TO_CHAR(TO_DATE(${iso},'YYYY-MM-DD'),'YYYY-MM-DD') = ${iso}
      THEN TO_DATE(${iso},'YYYY-MM-DD') ELSE NULL END
    WHEN ${text} ~ '^\\d{1,2}/\\d{1,2}/\\d{2}( \\d{1,2}:\\d{2})?$' THEN CASE
      WHEN SPLIT_PART(${us},'/',1)::int BETWEEN 1 AND 12
        AND SPLIT_PART(${us},'/',2)::int BETWEEN 1 AND 31
        AND TO_CHAR(TO_DATE(${usIso},'YYYY-MM-DD'),'YYYY-MM-DD') = ${usIso}
      THEN TO_DATE(${usIso},'YYYY-MM-DD') ELSE NULL END
    ELSE NULL END`;
}

export function timeRoleSql(role, alias = 'i') {
  return dateSql(`${alias}.${quoteIdentifier(VIN_CUBE.timeRoles[role])}`);
}

export function timeGrainSql(time, alias = 'i') {
  if (!time?.grain) return null;
  const date = timeRoleSql(time.role, alias);
  if (time.grain === 'day') return `TO_CHAR(${date},'YYYY-MM-DD')`;
  if (time.grain === 'month') return `TO_CHAR(${date},'YYYY-MM')`;
  if (time.grain === 'quarter') return `TO_CHAR(${date},'YYYY') || '-Q' || EXTRACT(QUARTER FROM ${date})::int`;
  return `TO_CHAR(${date},'YYYY')`;
}
