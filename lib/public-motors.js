export const DEALER_ANALYTICS_MOTORS = Object.freeze([
  'table_schema',
  'profile_table',
  'query_table',
  'join_tables',
  'vin_olap',
]);

export function isDealerAnalyticsMotor(name) {
  return DEALER_ANALYTICS_MOTORS.includes(name);
}
