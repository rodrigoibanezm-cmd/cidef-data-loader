import { seasonalitySourceSql } from './seasonality-source-sql.js';

export function intramonthWeekSql(input) {
  const pageParam = input.scope === 'CIDEF' ? 7 : 5;
  const offsetParam = pageParam + 1;
  return `/* intramonth_week */ WITH ${seasonalitySourceSql(input)},
  selected_groups AS (SELECT group_value FROM analysis GROUP BY group_value
    ORDER BY group_value LIMIT $${pageParam}::integer OFFSET $${offsetParam}::integer),
  monthly AS (SELECT to_char(date_trunc('month',event_date),'YYYY-MM') AS year_month,
    a.group_value,SUM(a.units) AS units,
    SUM(a.units) FILTER (WHERE EXTRACT(DAY FROM event_date) BETWEEN 1 AND 7) AS w1,
    SUM(a.units) FILTER (WHERE EXTRACT(DAY FROM event_date) BETWEEN 8 AND 14) AS w2,
    SUM(a.units) FILTER (WHERE EXTRACT(DAY FROM event_date) BETWEEN 15 AND 21) AS w3,
    SUM(a.units) FILTER (WHERE EXTRACT(DAY FROM event_date) BETWEEN 22 AND 28) AS w4,
    SUM(a.units) FILTER (WHERE EXTRACT(DAY FROM event_date) >= 29) AS w5,
    SUM(a.units) FILTER (WHERE event_date >= date_trunc('month',event_date)
      + interval '1 month' - interval '7 days') AS last7
    FROM analysis a JOIN selected_groups g USING(group_value) GROUP BY 1,2)
  SELECT year_month,group_value,units,
    ROUND(100*COALESCE(w1,0)/NULLIF(units,0),4) AS share_w1_pct,
    ROUND(100*COALESCE(w2,0)/NULLIF(units,0),4) AS share_w2_pct,
    ROUND(100*COALESCE(w3,0)/NULLIF(units,0),4) AS share_w3_pct,
    ROUND(100*COALESCE(w4,0)/NULLIF(units,0),4) AS share_w4_pct,
    ROUND(100*COALESCE(w5,0)/NULLIF(units,0),4) AS share_w5_pct,
    ROUND(100*COALESCE(w5,0)/NULLIF(units,0),4) AS last_week_share_pct,
    ROUND(100*COALESCE(last7,0)/NULLIF(units,0),4) AS last_7_days_share_pct
  FROM monthly ORDER BY group_value,year_month`;
}
