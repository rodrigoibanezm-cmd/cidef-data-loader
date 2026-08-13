import { seasonalitySourceSql } from './seasonality-source-sql.js';

export function monthlySeasonalitySql(input) {
  const pageParam = input.scope === 'CIDEF' ? 7 : 5;
  const offsetParam = pageParam + 1;
  return `/* monthly_seasonality */ WITH ${seasonalitySourceSql(input)},
  selected_groups AS (SELECT group_value FROM analysis GROUP BY group_value
    ORDER BY group_value LIMIT $${pageParam}::integer OFFSET $${offsetParam}::integer),
  monthly AS (SELECT to_char(date_trunc('month',event_date),'YYYY-MM') AS year_month,
    EXTRACT(YEAR FROM event_date)::int AS year,
    EXTRACT(QUARTER FROM event_date)::int AS quarter,
    EXTRACT(MONTH FROM event_date)::int AS month_number,
    a.group_value,SUM(a.units) AS units
    FROM analysis a JOIN selected_groups g USING(group_value)
    GROUP BY 1,2,3,4,5),
  metrics AS (SELECT m.*,
    SUM(units) OVER (PARTITION BY group_value,year) AS annual_total,
    SUM(units) OVER (PARTITION BY group_value,year,quarter) AS quarter_total,
    AVG(units) OVER (PARTITION BY group_value,month_number) AS month_avg,
    DENSE_RANK() OVER (PARTITION BY group_value,year ORDER BY units DESC) AS year_rank
    FROM monthly m)
  SELECT year_month,year,quarter,month_number,group_value,units,
    ROUND(100*units/NULLIF(annual_total,0),4) AS annual_weight_pct,
    ROUND(100*units/NULLIF(quarter_total,0),4) AS quarter_weight_pct,
    ROUND(100*(units/NULLIF(month_avg,0)-1),4) AS deviation_vs_month_avg_pct,
    year_rank::int AS ranking_in_year
  FROM metrics ORDER BY group_value,year_month`;
}
