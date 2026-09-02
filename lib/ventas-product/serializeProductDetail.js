export function serializeProductDetail(sales = []) {
  return sales.map((sale) => ({
    source_id: sale.source_id,
    vin: sale.vin,
    fecha_venta: sale.fecha_venta,
    fecha_venta_iso: sale.fecha_venta_iso,
    mes_venta: sale.mes_venta,
    recognition_basis: sale.recognition_basis,
    nro_operacion: sale.nro_operacion,
    nro_propuesta: sale.nro_propuesta,
    factura: sale.factura,
    nro_factura: sale.nro_factura,
    producto_sku: sale.producto_sku,
    producto: sale.producto,
    modelo_id: sale.modelo_id,
    version_id: sale.version_id,
    product_identity_status: sale.product_identity_status,
  }));
}
