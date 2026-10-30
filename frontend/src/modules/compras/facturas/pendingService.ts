import type { OrdenCompra } from '../../../services/comprasService';
import type { Invoice, InvoiceRepository } from './types';
import { calculateTotals } from './domain';

export function createPendingInvoiceService(repository: InvoiceRepository) {
  return {
    async ensureFromOrder(order: OrdenCompra): Promise<Invoice> {
      if (!order.id || order.estado === 'ANULADA') throw new Error('Selecciona una orden guardada y no anulada.');
      if (order.moneda !== 'PEN' && order.moneda !== 'USD') throw new Error('La moneda de la orden no está soportada.');
      const id = `auto-invoice:${order.id}`;
      const lines = (order.items ?? []).map((item, index) => ({
        id: `${id}:line:${index}`, productId: item.producto_id ?? '', code: item.producto_codigo ?? '', description: item.producto_descripcion ?? '', unit: item.unidad ?? '',
        orderLineId: item.id || undefined, orderedQuantity: item.cantidad, orderedPrice: item.costo_unitario,
        quantity: item.cantidad, price: item.costo_unitario, discount: item.descuento_porcentaje ?? 0, tax: 18,
      }));
      return repository.ensurePending({
        id, internalId: `FP-OC-${order.id}`, automaticOrderId: order.id, revision: 0, createdAt: new Date().toISOString(), status: 'PENDIENTE',
        supplierId: order.proveedor_id ?? '', supplierName: order.proveedor_nombre, supplierDocument: order.proveedor_documento ?? '',
        orderId: order.id, orderCode: order.codigo, orderDiscountAmount: order.descuento_global,
        documentType: 'FACTURA', series: '', number: '', issuedAt: '', dueAt: '', currency: order.moneda, paymentDays: 0,
        notes: '', lines, totals: calculateTotals(lines),
      });
    },
  };
}
