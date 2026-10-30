import type { OrdenCompra } from '../../../services/comprasService';
import type { Producto } from '../../../services/inventarioService';
import type { Proveedor } from '../../../services/proveedoresService';
import type { Invoice, InvoiceDraft, InvoiceLine } from './types';

export function draftFromOrder(draft: InvoiceDraft, order: OrdenCompra, suppliers: readonly Proveedor[], products: readonly Producto[]) {
  const supplier = suppliers.find(s => s.id === order.proveedor_id);
  if (!supplier || order.estado === 'ANULADA') throw new Error('La orden no tiene un proveedor disponible por ID o está anulada.');
  if (order.moneda !== 'PEN' && order.moneda !== 'USD') throw new Error('La moneda de esta orden no está soportada.');
  const lines: InvoiceLine[] = [];
  for (const item of order.items ?? []) {
    const product = products.find(p => p.id === item.producto_id);
    if (!product) continue;
    const quantity = Number.isFinite(item.cantidad) && item.cantidad >= 0 ? item.cantidad : undefined;
    const price = Number.isFinite(item.costo_unitario) && item.costo_unitario >= 0 ? item.costo_unitario : undefined;
    lines.push({ id: crypto.randomUUID(), productId: product.id, code: item.producto_codigo || product.codigo,
      description: item.producto_descripcion || product.descripcion, unit: item.unidad || product.unidad,
      orderLineId: item.id || undefined, orderedQuantity: quantity, orderedPrice: price,
      quantity: quantity ?? 0, price: price ?? NaN, discount: item.descuento_porcentaje ?? 0, tax: 18 });
  }
  const next: InvoiceDraft = { ...draft, supplierId: supplier.id, supplierName: supplier.nombre, supplierDocument: supplier.documento,
    paymentDays: supplier.condicion_pago, orderId: order.id, orderCode: order.codigo, currency: order.moneda, orderDiscountAmount: order.descuento_global, lines };
  const omitted = (order.items?.length ?? 0) - lines.length;
  return { draft: next, warning: omitted ? `${omitted} línea(s) no se cargaron porque no tienen un producto disponible por ID. Revisa la factura y agrega los productos existentes que correspondan.` : !lines.length ? 'La orden no tiene líneas disponibles. Agrega los productos de la factura manualmente.' : '' };
}

export interface OrderLineProgress {
  lineId?: string; productId?: string; description: string; unit: string; ordered: number;
  billed?: number; pending?: number; reason?: string;
}
export interface OrderProgress { orderId: string; invoiceCount: number; lines: OrderLineProgress[]; warning: string }

// A product match alone cannot identify a line: an order can repeat the same product.
export function calculateOrderProgress(order: OrdenCompra, invoices: readonly Invoice[]): OrderProgress {
  const related = invoices.filter(invoice => invoice.orderId === order.id && invoice.status === 'REGISTRADA');
  const items = order.items ?? [];
  const uncertain = related.some(invoice => invoice.supplierId !== order.proveedor_id || invoice.lines.some(line => {
    const matches = items.filter(item => item.id && item.id === line.orderLineId);
    return matches.length !== 1 || matches[0].producto_id !== line.productId || matches[0].unidad !== line.unit;
  }));
  const lines = items.map(item => {
    const row: OrderLineProgress = { lineId: item.id, productId: item.producto_id, description: item.producto_descripcion, unit: item.unidad, ordered: item.cantidad };
    if (uncertain || !order.proveedor_id || !item.id || items.filter(i => i.id === item.id).length !== 1 || !item.producto_id || !item.unidad || !Number.isFinite(item.cantidad) || item.cantidad < 0) {
      return { ...row, reason: 'No calculable de forma fiable: faltan referencias únicas o hay líneas históricas sin correspondencia.' };
    }
    const billed = related.reduce((sum, invoice) => sum + invoice.lines.filter(line => line.orderLineId === item.id).reduce((n, line) => n + line.quantity, 0), 0);
    if (!Number.isFinite(billed) || !Number.isFinite(item.cantidad - billed)) return { ...row, reason: 'No calculable de forma fiable: las cantidades exceden la precisión admitida.' };
    const clean = (value: number) => Number(value.toPrecision(12));
    return { ...row, billed: clean(billed), pending: clean(item.cantidad - billed) };
  });
  return { orderId: order.id, invoiceCount: related.length, lines, warning: !items.length ? 'La orden no tiene líneas identificables; no se puede calcular el acumulado.' : uncertain ? 'Hay facturas vinculadas con referencias insuficientes. No se infieren cantidades por código o nombre.' : '' };
}
