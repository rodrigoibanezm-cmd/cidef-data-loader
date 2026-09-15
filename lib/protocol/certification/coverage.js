const supported=(overrides={})=>Object.freeze({entities:[],measures:[],universes:[],organization_scopes:[],periods:[],comparisons:[],grains:[],...overrides});
const goal=(status,capabilities,claim_types,support,blockers=[])=>Object.freeze({status,certified_capabilities:Object.freeze(capabilities),supported:supported(support),claim_types:Object.freeze(claim_types),sufficiency_contract:claim_types.length?`ALL(OBLIGATION_REF(EXACT_${claim_types[0]}))`:'UNAVAILABLE',production_signal_rules:Object.freeze([]),production_transition_rules:Object.freeze([]),blockers:Object.freeze(blockers)});

export const TARGET_GOAL_COVERAGE=Object.freeze({
  OBSERVED_RESULT:goal('PARTIALLY_EXECUTABLE',['LONGITUDINAL/VENTAS'],['OBSERVED_VALUE'],{entities:['BRAND'],measures:['VIN_SALES'],universes:['COMPANY'],organization_scopes:['CIDEF'],periods:['CLOSED_CALENDAR_MONTH'],comparisons:['NONE'],grains:['BRAND']},['Other domains require exact authority/projectors']),
  PROJECTED_RESULT:goal('PARTIALLY_EXECUTABLE',['SALES/CURRENT_MONTH_CLOSE_FORECAST'],['PROJECTED_VALUE'],{entities:['COMPANY'],measures:['VIN_SALES'],universes:['OWN_STORES'],organization_scopes:['CIDEF'],periods:['OPEN_OR_PARTIAL_CALENDAR_MONTH'],comparisons:['NONE'],grains:['TOTAL']},['OWN_STORES only; cannot satisfy COMPANY']),
  EXPECTATION_GAP:goal('NOT_EXECUTABLE',[],[],{},['VIN_GAP requires composite STORE+BRAND binding absent from GoalInstance']),
  TEMPORAL_CHANGE:goal('PARTIALLY_EXECUTABLE',['LONGITUDINAL/VENTAS_CHANGE'],['CHANGE_VALUE'],{entities:['BRAND','MODEL'],measures:['VIN_SALES'],universes:['COMPANY','OWN_STORES','DEALERS'],organization_scopes:['CIDEF'],periods:['EXACTLY_2_CLOSED_CALENDAR_MONTHS'],comparisons:['PREVIOUS_PERIOD'],grains:['BRAND','MODEL']},['No silent YOY or non-comparable periods']),
  TEMPORAL_TRAJECTORY:goal('PARTIALLY_EXECUTABLE',['LONGITUDINAL/VENTAS_TRAJECTORY'],['TRAJECTORY_SERIES'],{entities:['BRAND','MODEL'],measures:['VIN_SALES'],universes:['COMPANY','OWN_STORES','DEALERS'],organization_scopes:['CIDEF'],periods:['AT_LEAST_2_CLOSED_CALENDAR_MONTHS'],comparisons:['NONE'],grains:['BRAND','MODEL']},['RVM and CRM authority surfaces not target-certified']),
  RELATIVE_PERFORMANCE:goal('PARTIALLY_EXECUTABLE',['SALES/ORGANIZATIONAL_RELATIVE_PERFORMANCE'],['RELATIVE_PERFORMANCE_VALUE'],{entities:['STORE','SELLER'],measures:['VIN_SALES'],universes:['OWN_STORES'],organization_scopes:['CIDEF'],periods:['CLOSED_CALENDAR_MONTH'],comparisons:['EXPECTED'],grains:['STORE','SELLER']},['CURRENT_SNAPSHOT rules; no historical point-in-time reconstruction']),
  MARKET_POSITION:goal('NOT_EXECUTABLE',[],[],{},['Target QuestionContract commercial-universe authority does not represent RVM market denominator exactly']),
  RISK_STATUS:goal('PARTIALLY_EXECUTABLE',['SALES/DETERIORATION_STATUS'],['RISK_RULE_RESULT'],{entities:['STORE'],measures:['VIN_SALES'],universes:['OWN_STORES'],organization_scopes:['CIDEF'],periods:['ONE_CLOSED_CALENDAR_MONTH'],comparisons:['EXPECTED'],grains:['STORE']},['Only registered deterioration rule; trajectory alone is not risk']),
  CHANGE_ATTRIBUTION:goal('PARTIALLY_EXECUTABLE',['SALES/PRODUCT_CHANGE_CONTRIBUTION','SALES/STORE_CHANGE_CONTRIBUTION','SALES/SELLER_CHANGE_CONTRIBUTION'],['CHANGE_CONTRIBUTION_SET'],{entities:['COMPANY'],measures:['VIN_SALES'],universes:['COMPANY'],organization_scopes:['CIDEF'],periods:['EXACTLY_2_CLOSED_CALENDAR_MONTHS'],comparisons:['PREVIOUS_PERIOD'],grains:['MODEL','STORE','SELLER']},['Attribution is noncausal']),
  CONCENTRATION_STATUS:goal('NOT_EXECUTABLE',[],[],{},['Public concentration motor omits complete distribution required by proof']),
  SIGNAL_STATUS:goal('NOT_EXECUTABLE',[],[],{},['Existing predictability outputs lack a certified target signal proposition/projector']),
  ASSOCIATED_MOVEMENT:goal('NOT_EXECUTABLE',[],[],{},['Competitive relation outputs lack target RVM authority and may not be promoted to causality']),
  FLOW_STATUS:goal('NOT_EXECUTABLE',[],[],{},['CRM context lacks certified historical stage semantics and reconciliation']),
  OPERATIONAL_LEAKAGE:goal('NOT_EXECUTABLE',[],[],{},['No existing motor proves expected transitions, exceptions, leakage and reconciliation']),
});

const migrated=Object.freeze({
  'SALES/CURRENT_MONTH_CLOSE_FORECAST':['PROJECTED_RESULT','SALES/CURRENT_MONTH_CLOSE_FORECAST','protocol.evidence.current_month_forecast.v1'],
  'SALES/PRODUCT_CHANGE_CONTRIBUTION':['CHANGE_ATTRIBUTION','SALES/PRODUCT_CHANGE_CONTRIBUTION','protocol.evidence.product_change_contribution.v1'],
  'SALES/STORE_CHANGE_CONTRIBUTION':['CHANGE_ATTRIBUTION','SALES/STORE_CHANGE_CONTRIBUTION','protocol.evidence.store_change_contribution.v1'],
  'SALES/SELLER_CHANGE_CONTRIBUTION':['CHANGE_ATTRIBUTION','SALES/SELLER_CHANGE_CONTRIBUTION','protocol.evidence.seller_change_contribution.v1'],
  'SALES/RELATIVE_PERFORMANCE':['RELATIVE_PERFORMANCE','SALES/ORGANIZATIONAL_RELATIVE_PERFORMANCE','protocol.evidence.organizational_relative_performance.v1'],
  'SALES/DETERIORATION_STATUS':['RISK_STATUS','SALES/DETERIORATION_STATUS','protocol.evidence.deterioration_status.v1'],
  'LONGITUDINAL/VENTAS':['OBSERVED_RESULT,TEMPORAL_CHANGE,TEMPORAL_TRAJECTORY','LONGITUDINAL/VENTAS','protocol.evidence.observed_value.v1|protocol.evidence.ventas_change.v1|protocol.evidence.ventas_trajectory.v1'],
});
const inventory=Object.freeze({
  'SALES/COMMERCIAL_CONTEXT':['ventas_commercial_context_v01','STRUCTURAL_CONTEXT_ONLY','Context does not prove a business Goal'],
  'SALES/MONTHLY_ACTUAL':['ventas_monthly_actual_v01','LEGACY_ONLY','Public output is not adapted; longitudinal path is authoritative'],
  'SALES/DAILY_CLOSE_FORECAST':['daily_close_forecast_v01','LEGACY_ONLY','Legacy own-store forecast contract lacks target scope adapter'],
  'SALES/CURRENT_MONTH_CLOSE_FORECAST':['current_month_close_forecast_v01'],
  'SALES/PREDICTABILITY_DAY':['predictability_day_v01','REQUIRES_NEW_BUSINESS_RULE','No target SIGNAL_STATUS rule/policy mapping'],
  'SALES/INTRAMONTH_HISTORY':['intramonth_sales_history_context_v01','STRUCTURAL_CONTEXT_ONLY','Historical context is not a proposition'],
  'SALES/PACE_CHANGE':['sales_pace_change_v01','INSUFFICIENT_SEMANTICS','Pace is not closed-period temporal change'],
  'SALES/PRODUCT_SALES':['ventas_product_sales_v01','LEGACY_ONLY','Longitudinal exact path covers supported observations'],
  'SALES/PRODUCT_DETAIL':['ventas_product_detail_v01','STRUCTURAL_CONTEXT_ONLY','Detail rows do not constitute a bounded Goal proof'],
  'SALES/PRODUCT_CONCENTRATION':['ventas_product_concentration_v01','INSUFFICIENT_SEMANTICS','Complete distribution omitted from public output'],
  'SALES/PRODUCT_CHANGE_CONTRIBUTION':['ventas_product_change_contribution_v01'],
  'SALES/STORE_CHANGE_CONTRIBUTION':['ventas_store_change_contribution_v01'],
  'SALES/SELLER_CHANGE_CONTRIBUTION':['ventas_seller_change_contribution_v01'],
  'SALES/VIN_GAP':['vin_gap_v01','REQUIRES_NEW_BUSINESS_RULE','Composite STORE+BRAND binding cannot be proven exactly'],
  'SALES/VIN_GROWTH_DIAGNOSTIC':['vin_growth_diagnostic_v01','INSUFFICIENT_SEMANTICS','Diagnostic bundle is not one closed EvidenceGoal claim'],
  'SALES/RELATIVE_PERFORMANCE':['organizational_relative_performance_v01'],
  'SALES/DETERIORATION_STATUS':['org_sales_deterioration_status_v01'],
  'MARKET/COMPETITIVE_CONTEXT':['competitive_context_v01','STRUCTURAL_CONTEXT_ONLY','Context is not market-position evidence'],
  'MARKET/SHARE_TRAJECTORY':['competitive_share_trajectory_v01','UNSUPPORTED_AUTHORITY','RVM market denominator not represented by target scope authority'],
  'MARKET/COMPETITIVE_RELATION':['competitive_relation_v01','UNSUPPORTED_AUTHORITY','RVM authority unavailable at target claim boundary'],
  'MARKET/INVERSE_SHARE_MOVEMENT':['competitive_inverse_share_movement_v01','UNSUPPORTED_AUTHORITY','RVM authority unavailable; association remains noncausal'],
  'MARKET/SHARE_TRANSFER':['competitive_share_transfer_v01','UNSUPPORTED_AUTHORITY','RVM authority unavailable; no causal promotion'],
  'MARKET/GROWTH_MATRIX':['competitive_growth_matrix_v01','INSUFFICIENT_SEMANTICS','Matrix is not an exact single Goal claim'],
  'MARKET/MARKET_HISTORY':['rvm_market_history_v01','STRUCTURAL_CONTEXT_ONLY','Historical context requires semantic projector and authority'],
  'CRM/CONTEXT':['crm_context_v01','STRUCTURAL_CONTEXT_ONLY','Current-state CRM context is not historical evidence'],
  'CRM/LONGITUDINAL_CONTEXT':['crm_longitudinal_context_v01','UNSUPPORTED_COVERAGE','No historical snapshot authority; event series cannot prove state'],
  'PRICING/HISTORY':['pricing_history_v01','UNSUPPORTED_AUTHORITY','Target AvailabilitySnapshot has no PRICING authority; published is not realized price'],
  'DISCOVERY/LIST_TABLES':['list_tables','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'DISCOVERY/TABLE_SCHEMA':['table_schema','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'DISCOVERY/PROFILE_TABLE':['profile_table','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'DISCOVERY/QUERY_TABLE':['query_table','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'LONGITUDINAL/VENTAS':['ventas_longitudinal_context_v01'],
  'LONGITUDINAL/RVM':['rvm_longitudinal_context_v01','UNSUPPORTED_AUTHORITY','RVM denominator/status authority cannot bind exact target commercial scope'],
  'LONGITUDINAL/CRM':['crm_longitudinal_context_v01','UNSUPPORTED_COVERAGE','Current CRM authority cannot prove historical snapshots'],
});

export const TARGET_CAPABILITY_COVERAGE=Object.freeze(Object.entries(inventory).map(([capability_id,[motor,classification='CERTIFIABLE_WITH_TARGET_ADAPTER',blocker=null]])=>{const migratedRow=migrated[capability_id];return Object.freeze({capability_id,motor,classification:migratedRow?'CERTIFIABLE_WITH_TARGET_ADAPTER':classification,target_goal_types:Object.freeze(migratedRow?migratedRow[0].split(','):[]),target_contract:migratedRow?.[1]??null,projector:migratedRow?.[2]??null,claim_types:Object.freeze(migratedRow?migratedRow[0].split(',').map(goalType=>TARGET_GOAL_COVERAGE[goalType].claim_types[0]):[]),blocker,notes:blocker??'Native target adapter registered'});}));

export function getTargetCertificationCoverage(){return Object.freeze({matrix_version:'target_capability_coverage.v1',goals:TARGET_GOAL_COVERAGE,capabilities:TARGET_CAPABILITY_COVERAGE});}
