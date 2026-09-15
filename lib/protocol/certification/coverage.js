const supported=(overrides={})=>Object.freeze({entities:[],measures:[],universes:[],organization_scopes:[],periods:[],comparisons:[],grains:[],...overrides});
const goal=(status,capabilities,claim_types,support,blockers=[])=>Object.freeze({status,certified_capabilities:Object.freeze(capabilities),supported:supported(support),claim_types:Object.freeze(claim_types),sufficiency_contract:claim_types.length?`ALL(OBLIGATION_REF(EXACT_${claim_types[0]}))`:'UNAVAILABLE',production_signal_rules:Object.freeze([]),production_transition_rules:Object.freeze([]),blockers:Object.freeze(blockers)});

export const TARGET_GOAL_COVERAGE=Object.freeze({
  OBSERVED_RESULT:goal('PARTIALLY_EXECUTABLE',['LONGITUDINAL/VENTAS','PRICING/HISTORY_OBSERVED'],['OBSERVED_VALUE','OBSERVED_COMMERCIAL_CONDITION'],{entities:['BRAND','VERSION'],measures:['VIN_SALES','PUBLISHED_COMMERCIAL_CONDITION'],universes:['COMPANY','PUBLISHED_CONDITIONS'],organization_scopes:['CIDEF'],periods:['CLOSED_CALENDAR_MONTH','EXACT_VALIDITY_INTERVAL'],comparisons:['NONE'],grains:['BRAND','VERSION']},['Published commercial conditions only; realized transaction price unavailable']),
  PROJECTED_RESULT:goal('PARTIALLY_EXECUTABLE',['SALES/CURRENT_MONTH_CLOSE_FORECAST'],['PROJECTED_VALUE'],{entities:['COMPANY'],measures:['VIN_SALES'],universes:['OWN_STORES'],organization_scopes:['CIDEF'],periods:['OPEN_OR_PARTIAL_CALENDAR_MONTH'],comparisons:['NONE'],grains:['TOTAL']},['OWN_STORES only; cannot satisfy COMPANY']),
  EXPECTATION_GAP:goal('NOT_EXECUTABLE',[],[],{},['VIN_GAP requires composite STORE+BRAND binding absent from GoalInstance']),
  TEMPORAL_CHANGE:goal('PARTIALLY_EXECUTABLE',['LONGITUDINAL/VENTAS_CHANGE'],['CHANGE_VALUE'],{entities:['BRAND','MODEL'],measures:['VIN_SALES'],universes:['COMPANY','OWN_STORES','DEALERS'],organization_scopes:['CIDEF'],periods:['EXACTLY_2_CLOSED_CALENDAR_MONTHS'],comparisons:['PREVIOUS_PERIOD'],grains:['BRAND','MODEL']},['No silent YOY or non-comparable periods']),
  TEMPORAL_TRAJECTORY:goal('PARTIALLY_EXECUTABLE',['LONGITUDINAL/VENTAS_TRAJECTORY','MARKET/SHARE_TRAJECTORY'],['TRAJECTORY_SERIES'],{entities:['BRAND','MODEL'],measures:['VIN_SALES','MARKET_SHARE'],universes:['COMPANY','OWN_STORES','DEALERS','RVM_MARKET'],organization_scopes:['CIDEF'],periods:['AT_LEAST_2_CLOSED_CALENDAR_MONTHS'],comparisons:['NONE'],grains:['BRAND','MODEL']},['RVM trajectory is CONSOLIDATED TOTAL_RVM_MARKET/CHILE only; CRM historical authority unavailable']),
  RELATIVE_PERFORMANCE:goal('PARTIALLY_EXECUTABLE',['SALES/ORGANIZATIONAL_RELATIVE_PERFORMANCE'],['RELATIVE_PERFORMANCE_VALUE'],{entities:['STORE','SELLER'],measures:['VIN_SALES'],universes:['OWN_STORES'],organization_scopes:['CIDEF'],periods:['CLOSED_CALENDAR_MONTH'],comparisons:['EXPECTED'],grains:['STORE','SELLER']},['CURRENT_SNAPSHOT rules; no historical point-in-time reconstruction']),
  MARKET_POSITION:goal('PARTIALLY_EXECUTABLE',['MARKET/SHARE_POSITION'],['MARKET_POSITION_VALUE'],{entities:['BRAND'],measures:['MARKET_SHARE'],universes:['RVM_MARKET'],organization_scopes:['CIDEF'],periods:['ONE_CLOSED_CALENDAR_MONTH'],comparisons:['MARKET'],grains:['BRAND']},['CONSOLIDATED TOTAL_RVM_MARKET/CHILE only; denominator must reconcile']),
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
  'MARKET/SHARE_TRAJECTORY':['TEMPORAL_TRAJECTORY,MARKET_POSITION','MARKET/SHARE_TRAJECTORY|MARKET/SHARE_POSITION','protocol.evidence.rvm_share_trajectory.v1|protocol.evidence.rvm_market_position.v1'],
  'PRICING/HISTORY':['OBSERVED_RESULT','PRICING/HISTORY_OBSERVED','protocol.evidence.pricing_observed_condition.v1'],
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
  'MARKET/SHARE_TRAJECTORY':['competitive_share_trajectory_v01'],
  'MARKET/COMPETITIVE_RELATION':['competitive_relation_v01','INSUFFICIENT_SEMANTICS','Bounded relation output requires an explicit comparator proposition adapter; relation remains noncausal'],
  'MARKET/INVERSE_SHARE_MOVEMENT':['competitive_inverse_share_movement_v01','INSUFFICIENT_SEMANTICS','Inverse movement output is noncausal and is not yet an exact ASSOCIATED_MOVEMENT claim'],
  'MARKET/SHARE_TRANSFER':['competitive_share_transfer_v01','INSUFFICIENT_SEMANTICS','Share-transfer naming cannot be promoted to causal or exact association semantics'],
  'MARKET/GROWTH_MATRIX':['competitive_growth_matrix_v01','INSUFFICIENT_SEMANTICS','Matrix is not an exact single Goal claim'],
  'MARKET/MARKET_HISTORY':['rvm_market_history_v01','UNSUPPORTED_AUTHORITY','Motor query does not bind consolidated versus preliminary data status'],
  'CRM/CONTEXT':['crm_context_v01','STRUCTURAL_CONTEXT_ONLY','Current-state CRM context is not historical evidence'],
  'CRM/LONGITUDINAL_CONTEXT':['crm_longitudinal_context_v01','UNSUPPORTED_COVERAGE','No historical snapshot authority; event series cannot prove state'],
  'PRICING/HISTORY':['pricing_history_v01'],
  'DISCOVERY/LIST_TABLES':['list_tables','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'DISCOVERY/TABLE_SCHEMA':['table_schema','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'DISCOVERY/PROFILE_TABLE':['profile_table','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'DISCOVERY/QUERY_TABLE':['query_table','DISCOVERY_ONLY','Discovery never satisfies an EvidenceGoal'],
  'LONGITUDINAL/VENTAS':['ventas_longitudinal_context_v01'],
  'LONGITUDINAL/RVM':['rvm_longitudinal_context_v01','PARTIALLY_CONNECTED','Connected as the certified dependency behind bounded MARKET/SHARE_TRAJECTORY; generic interface not exposed independently'],
  'LONGITUDINAL/CRM':['crm_longitudinal_context_v01','UNSUPPORTED_COVERAGE','Current CRM authority cannot prove historical snapshots'],
});

const CLASSIFICATION=Object.freeze({CERTIFIABLE_WITH_TARGET_ADAPTER:'CONNECTED',STRUCTURAL_CONTEXT_ONLY:'CONTEXT_ONLY',DISCOVERY_ONLY:'CONTEXT_ONLY',INSUFFICIENT_SEMANTICS:'BLOCKED_OUTPUT_SEMANTICS',REQUIRES_NEW_BUSINESS_RULE:'BLOCKED_OUTPUT_SEMANTICS',UNSUPPORTED_AUTHORITY:'BLOCKED_SOURCE_AUTHORITY',UNSUPPORTED_COVERAGE:'BLOCKED_SOURCE_AUTHORITY'});
export const TARGET_CAPABILITY_COVERAGE=Object.freeze(Object.entries(inventory).map(([capability_id,[motor,classification='CONNECTED',blocker=null]])=>{const migratedRow=migrated[capability_id],domain=capability_id.split('/')[0],normalized=migratedRow?'CONNECTED':CLASSIFICATION[classification]??classification,authority=domain==='MARKET'||domain==='LONGITUDINAL'&&motor.includes('rvm')?'rvm_universe_v01':domain==='PRICING'?'price_episode_canonico_v01 + versiones_master_v01':domain==='CRM'?'crm_universe_v01':'ventas_universe_v01',sourceLimitations=capability_id==='PRICING/HISTORY'?['PUBLISHED_COMMERCIAL_CONDITION_ONLY','REALIZED_TRANSACTION_PRICE_UNAVAILABLE']:capability_id==='MARKET/SHARE_TRAJECTORY'?['CONSOLIDATED_TOTAL_RVM_MARKET_CHILE_ONLY']:[];return Object.freeze({capability_id,motor,domain,classification:normalized,authority,availability:domain==='MARKET'||authority==='rvm_universe_v01'?'RVM:CONSOLIDATED':domain==='PRICING'?'PRICING:AVAILABLE_VALIDITY_COVERAGE':domain==='CRM'?'CRM:CURRENT':'SALES:AVAILABLE',target_goal_types:Object.freeze(migratedRow?migratedRow[0].split(','):[]),target_contract:migratedRow?.[1]??null,projector:migratedRow?.[2]??null,claim_types:Object.freeze(migratedRow?migratedRow[0].split(',').map(goalType=>capability_id==='PRICING/HISTORY'?'OBSERVED_COMMERCIAL_CONDITION':TARGET_GOAL_COVERAGE[goalType].claim_types[0]):[]),limitations:Object.freeze(blocker?[blocker]:sourceLimitations),blocker,notes:blocker??'Native target adapter registered'});}));

export const TARGET_RVM_AUTHORITY_MATRIX=Object.freeze({
  subject_identity:{source:'marcas_master_v01/modelos_master_v01',target_representation:'UniverseResolution.subject + PRODUCT_MASTER AuthorityRef',status:'CONNECTED',blocker:null},
  product_identity:{source:'rvm_universe_v01 canonical brand/model membership',target_representation:'UniverseResolution membership authority',status:'CONNECTED',blocker:null},
  organization_membership:{source:'rvm_universe_v01 organization_bucket',target_representation:'organization_scope=CIDEF + RVM_UNIVERSE AuthorityRef',status:'CONNECTED',blocker:null},
  market_universe:{source:'rvm_universe_v01 complete analytical event base',target_representation:'commercial_universe=RVM_MARKET; market_universe=TOTAL_RVM_MARKET',status:'CONNECTED',blocker:null},
  market_denominator:{source:'rvm_longitudinal_context_v01 denominator',target_representation:'TypedClaim numerator/denominator reconciliation',status:'CONNECTED',blocker:null},
  period:{source:'rvm_universe_v01 requested/effective period',target_representation:'exact Goal period + temporal AuthorityRef',status:'CONNECTED',blocker:null},
  snapshot:{source:'rvm_universe_v01 snapshot_date for PRELIMINARY only',target_representation:'AvailabilitySnapshot.snapshot_date',status:'CONNECTED',blocker:null},
  data_status:{source:'rvm_universe_v01 data_status',target_representation:'AvailabilitySnapshot.data_status + TypedClaim.data_status',status:'CONNECTED',blocker:null},
  geography:{source:'repository RVM national market contract',target_representation:'geography=CHILE',status:'CONNECTED',blocker:null},
  grain:{source:'rvm_longitudinal_context_v01 BRAND',target_representation:'Goal/TypedClaim grain=BRAND',status:'CONNECTED',blocker:null},
  coverage:{source:'RVM temporal/dimension/organization coverage',target_representation:'AvailabilitySnapshot + EvidenceRecord coverage',status:'CONNECTED',blocker:null},
});

export const TARGET_PRICING_AUTHORITY_MATRIX=Object.freeze({
  product_identity:{source:'versiones_master_v01 joined to modelo/marca masters',target_representation:'UniverseResolution.subject entity_type=VERSION',status:'CONNECTED',blocker:null},
  price_version_identity:{source:'price_episode_canonico_v01.price_version_id',target_representation:'OBSERVED_COMMERCIAL_CONDITION.price_version_id',status:'CONNECTED',blocker:null},
  validity_start:{source:'price_episode_canonico_v01.vigencia_desde',target_representation:'claim.value.validity.date_from',status:'CONNECTED',blocker:null},
  validity_end:{source:'price_episode_canonico_v01.vigencia_hasta',target_representation:'claim.value.validity.date_to; null remains open-ended',status:'CONNECTED',blocker:null},
  published_price:{source:'precio_lista/precio_neto/precio_con_iva',target_representation:'OBSERVED_COMMERCIAL_CONDITION published fields',status:'CONNECTED',blocker:null},
  bonus_components:{source:'bono_cidef/bono_forum/bono_mes',target_representation:'OBSERVED_COMMERCIAL_CONDITION bonus fields',status:'CONNECTED',blocker:null},
  commercial_condition:{source:'pricing_history_v01 PUBLISHED_COMMERCIAL_CONDITION',target_representation:'measure=PUBLISHED_COMMERCIAL_CONDITION',status:'CONNECTED',blocker:null},
  store_scope:{source:null,target_representation:null,status:'BLOCKED_SOURCE_AUTHORITY',blocker:'Pricing source does not certify store scope'},
  dealer_scope:{source:null,target_representation:null,status:'BLOCKED_SOURCE_AUTHORITY',blocker:'Pricing source does not certify dealer scope'},
  coverage:{source:'episode overlap and source_status',target_representation:'PRICING validity coverage + exact source_status=OK',status:'CONNECTED',blocker:null},
  source_version:{source:'pricing_history_v01 v0.1 + price_episode_canonico_v01',target_representation:'CapabilityContract and authority refs',status:'CONNECTED',blocker:null},
});

export const TARGET_CROSS_SOURCE_READINESS=Object.freeze({
  PRICE_SALES_JOIN_READINESS:{pricing_product_identity:'versiones_master_v01.version_id',sales_product_identity:'ventas_universe_v01.version_id when resolved',canonical_bridge:'versiones_master_v01.version_id',pricing_date_semantics:'commercial-condition validity interval',sales_date_semantics:'VIN invoice date/closed sales period',scope_compatibility:'Product/date compatible; pricing store/dealer scope unavailable',deterministic_join_possible:'PARTIAL',blockers:['Store/dealer pricing scope absent','No certified price-sales analytical motor','Published price is not realized transaction price']},
  RVM_SALES_JOIN_READINESS:{rvm_product_identity:'canonical brand_id/model_id',sales_product_identity:'canonical brand_id/model_id',canonical_bridge:'shared MASTER brand/model identity',period_compatibility:'calendar-month compatible when both sources are closed/consolidated',universe_compatibility:'RVM total market and SALES company remain distinct explicit universes',deterministic_join_possible:'PARTIAL',blockers:['No certified cross-source association/counterfactual motor','RVM consolidated status must remain explicit']},
});

export function getTargetCertificationCoverage(){return Object.freeze({matrix_version:'target_capability_coverage.v1',goals:TARGET_GOAL_COVERAGE,capabilities:TARGET_CAPABILITY_COVERAGE,rvm_authority:TARGET_RVM_AUTHORITY_MATRIX,pricing_authority:TARGET_PRICING_AUTHORITY_MATRIX,cross_source_readiness:TARGET_CROSS_SOURCE_READINESS});}
