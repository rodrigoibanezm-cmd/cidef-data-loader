export const vinRows = [
  { vin_chasis:'VIN1', fecha_nv:'01/15/26 10:00', fecha_ingreso_stk:'12/01/25 09:00', vendedor:'Ana', marca:'DFM', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', etapa:'VENTA' },
  { vin_chasis:'VIN2', fecha_nv:'02/15/26 10:00', fecha_ingreso_stk:'01/01/26 09:00', vendedor:'Ana', marca:'DFM', dealer_venta:'Dealer Dos', es_dealer:true, vigente:'1', etapa:'VENTA' },
  { vin_chasis:'VIN3', fecha_nv:'03/20/26 10:00', fecha_ingreso_stk:'02/15/26 09:00', vendedor:'Beto', marca:'FOTON', dealer_venta:'Dealer Tres', es_dealer:true, vigente:'1', etapa:'VENTA' },
  { vin_chasis:'VIN4', fecha_nv:null, fecha_ingreso_stk:'03/01/26 09:00', vendedor:'Beto', marca:'FOTON', dealer_venta:null, es_dealer:false, vigente:'0', etapa:'STOCK' },
  { vin_chasis:'VIN5', fecha_nv:'13/40/26 10:00', fecha_ingreso_stk:'invalid', vendedor:'Ana', marca:'DFM', dealer_venta:'Dealer Uno', es_dealer:true, vigente:'1', etapa:'STOCK' },
];

export const boundaryQuery = (extra = {}) => ({
  cube:'VIN_SEMANTIC_CUBE_V0.1',
  operation:'TEMPORAL_BOUNDARY',
  universe:{type:'EVENT_POPULATION',event:'NV'},
  time:{role:'NV',grain:'month'},
  boundary:'MAX',
  filters:[],
  options:{include_coverage:true,include_lineage:true},
  ...extra,
});

export const aggregateQuery = (extra = {}) => ({
  cube:'VIN_SEMANTIC_CUBE_V0.1',
  universe:{type:'ALL_VIN'},
  measures:[{name:'unit_count',aggregation:'SUM',as:'units'}],
  derived_metrics:[],
  dimensions:[],
  filters:[],
  options:{include_totals:true,include_coverage:true,include_lineage:true,limit:300,offset:0},
  ...extra,
});

export const errorCode = (result) => result.audit.checks[0].name;
