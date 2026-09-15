import { deriveTemporalMetadata } from '../../temporal/periodMath.js';
import { deepFreeze, invariant } from '../primitives.js';
import { resolveGroundingDefaults } from './defaultPolicy.js';

const MONTHS = Object.freeze({
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12,
});
const pad = (value) => String(value).padStart(2,'0');
const iso = (year,month,day) => `${year}-${pad(month)}-${pad(day)}`;
const endDay = (year,month) => new Date(Date.UTC(year,month,0)).getUTCDate();
function addMonths(year,month,delta) { const date=new Date(Date.UTC(year,month-1+delta,1)); return {year:date.getUTCFullYear(),month:date.getUTCMonth()+1}; }
function normalize(value) { return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[¿?¡!.,]/g,' ').replace(/\s+/g,' ').trim(); }
function localParts(instant,timezone) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const read=(type)=>Number(parts.find((part)=>part.type===type)?.value); return {year:read('year'),month:read('month'),day:read('day')};
}
function periodShape(anchor,quantity,unit,closure,alignment='CALENDAR') { return {anchor,quantity,unit,closure,alignment}; }
function rangeForShape(shape,today) {
  if(shape.anchor==='CURRENT') {
    if(shape.unit==='MONTH') return {date_from:iso(today.year,today.month,1),date_to:iso(today.year,today.month,today.day)};
    if(shape.unit==='QUARTER') { const month=Math.floor((today.month-1)/3)*3+1; return {date_from:iso(today.year,month,1),date_to:iso(today.year,today.month,today.day)}; }
    if(shape.unit==='YEAR') return {date_from:iso(today.year,1,1),date_to:iso(today.year,today.month,today.day)};
  }
  if(shape.anchor==='LAST'&&shape.closure==='CLOSED') {
    if(shape.unit==='MONTH') { const end=addMonths(today.year,today.month,-1); const start=addMonths(end.year,end.month,-(shape.quantity-1)); return {date_from:iso(start.year,start.month,1),date_to:iso(end.year,end.month,endDay(end.year,end.month))}; }
    if(shape.unit==='QUARTER') { const currentStart=Math.floor((today.month-1)/3)*3+1; const endStart=addMonths(today.year,currentStart,-3); const start=addMonths(endStart.year,endStart.month,-3*(shape.quantity-1)); const end=addMonths(endStart.year,endStart.month,2); return {date_from:iso(start.year,start.month,1),date_to:iso(end.year,end.month,endDay(end.year,end.month))}; }
  }
  invariant(false,'UNSUPPORTED_TEMPORAL_SHAPE','$.semantic_period');
}
function materialize(expression,shape,range,defaults) {
  const metadata=deriveTemporalMetadata(range,{now:defaults.anchor_timestamp,timezone:defaults.timezone});
  return deepFreeze({
    status:'BOUND', expression, semantic_period:shape,
    materialized_period:{date_from:range.date_from,date_to:range.date_to,period_status:metadata.period_status,timezone:defaults.timezone,anchor_timestamp:defaults.anchor_timestamp,temporal_policy_ref:'calendar_grounding.v1'},
    provenance:'USER_EXPLICIT',
  });
}

export function groundTemporalExpression(text,{now,timezone}={}) {
  const normalized=normalize(text); const defaults=resolveGroundingDefaults({now,timezone}); const today=localParts(new Date(defaults.anchor_timestamp),defaults.timezone);
  let match=normalized.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/);
  if(match) { const month=MONTHS[match[1]]; let year=match[2]?Number(match[2]):today.year; if(!match[2]&&month>today.month)year-=1; const shape=periodShape('EXPLICIT',1,'MONTH','CLOSED'); return materialize(match[0],shape,{date_from:iso(year,month,1),date_to:iso(year,month,endDay(year,month))},defaults); }
  let shape=null; let expression=null;
  if(/\b(este mes|mes actual)\b/.test(normalized)){shape=periodShape('CURRENT',1,'MONTH','CURRENT');expression='este mes';}
  else if(/\b(mes pasado|ultimo mes)\b/.test(normalized)){shape=periodShape('LAST',1,'MONTH','CLOSED');expression='último mes';}
  else if(/\bultimo trimestre\b/.test(normalized)){shape=periodShape('LAST',1,'QUARTER','CLOSED');expression='último trimestre';}
  else if((match=normalized.match(/\bultimos\s+(\d+)\s+meses\b/))){shape=periodShape('LAST',Number(match[1]),'MONTH','CLOSED');expression=match[0];}
  else if(/\btrimestre actual\b/.test(normalized)){shape=periodShape('CURRENT',1,'QUARTER','CURRENT');expression='trimestre actual';}
  else if(/\b(ytd|ano a la fecha)\b/.test(normalized)){shape=periodShape('CURRENT',1,'YEAR','CURRENT');expression='YTD';}
  if(!shape)return null;
  return materialize(expression,shape,rangeForShape(shape,today),defaults);
}

export function materializeSemanticPeriod(expression,semanticPeriod,{now,timezone}={}) {
  const defaults=resolveGroundingDefaults({now,timezone}); const today=localParts(new Date(defaults.anchor_timestamp),defaults.timezone);
  return materialize(expression,semanticPeriod,rangeForShape(semanticPeriod,today),defaults);
}
