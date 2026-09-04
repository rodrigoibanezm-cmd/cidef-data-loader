function freezeDomain(entries) {
  return Object.freeze(Object.fromEntries(
    Object.entries(entries).map(([capability, action]) => [
      capability,
      Object.freeze({ action }),
    ]),
  ));
}

export const DOMAIN_CAPABILITY_REGISTRY = Object.freeze({
  SALES: freezeDomain({
    MONTHLY_ACTUAL: 'ventas_monthly_actual_v01',
    DAILY_CLOSE_FORECAST: 'daily_close_forecast_v01',
    CURRENT_MONTH_CLOSE_FORECAST: 'current_month_close_forecast_v01',
    PREDICTABILITY_DAY: 'predictability_day_v01',
    INTRAMONTH_HISTORY: 'intramonth_sales_history_context_v01',
    PRODUCT_SALES: 'ventas_product_sales_v01',
    PRODUCT_DETAIL: 'ventas_product_detail_v01',
    PRODUCT_CONCENTRATION: 'ventas_product_concentration_v01',
    PRODUCT_CHANGE_CONTRIBUTION: 'ventas_product_change_contribution_v01',
    STORE_CHANGE_CONTRIBUTION: 'ventas_store_change_contribution_v01',
    SELLER_CHANGE_CONTRIBUTION: 'ventas_seller_change_contribution_v01',
    RELATIVE_PERFORMANCE: 'organizational_relative_performance_v01',
    DETERIORATION_STATUS: 'org_sales_deterioration_status_v01',
  }),

  MARKET: freezeDomain({
    COMPETITIVE_CONTEXT: 'competitive_context_v01',
    SHARE_TRAJECTORY: 'competitive_share_trajectory_v01',
    COMPETITIVE_RELATION: 'competitive_relation_v01',
    INVERSE_SHARE_MOVEMENT: 'competitive_inverse_share_movement_v01',
    MARKET_HISTORY: 'rvm_market_history_v01',
  }),

  DISCOVERY: freezeDomain({
    LIST_TABLES: 'list_tables',
    TABLE_SCHEMA: 'table_schema',
    PROFILE_TABLE: 'profile_table',
    QUERY_TABLE: 'query_table',
  }),

  LONGITUDINAL: freezeDomain({
    VENTAS: 'ventas_longitudinal_context_v01',
    RVM: 'rvm_longitudinal_context_v01',
    CRM: 'crm_longitudinal_context_v01',
  }),
});

export function listCapabilityDomains() {
  return Object.keys(DOMAIN_CAPABILITY_REGISTRY);
}

export function listDomainCapabilities(domain) {
  const normalizedDomain = String(domain || '').trim().toUpperCase();
  const registry = DOMAIN_CAPABILITY_REGISTRY[normalizedDomain];
  return registry ? Object.keys(registry) : [];
}

export function resolveDomainCapability(domain, capability) {
  const normalizedDomain = String(domain || '').trim().toUpperCase();
  const normalizedCapability = String(capability || '').trim().toUpperCase();

  const domainRegistry = DOMAIN_CAPABILITY_REGISTRY[normalizedDomain];
  if (!domainRegistry) {
    const error = new Error(`INVALID_CAPABILITY_DOMAIN: ${domain || 'missing'}`);
    error.code = 'INVALID_CAPABILITY_DOMAIN';
    throw error;
  }

  const entry = domainRegistry[normalizedCapability];
  if (!entry) {
    const error = new Error(`UNSUPPORTED_CAPABILITY_FOR_DOMAIN: ${normalizedDomain}/${capability || 'missing'}`);
    error.code = 'UNSUPPORTED_CAPABILITY_FOR_DOMAIN';
    throw error;
  }

  return Object.freeze({
    domain: normalizedDomain,
    capability: normalizedCapability,
    action: entry.action,
  });
}
