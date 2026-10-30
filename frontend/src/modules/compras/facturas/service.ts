import { supplierRepository, productRepository } from '../../../repositories/masterRepositories';
import { comprasService, readCachedPurchaseOrders, type OrdenCompra } from '../../../services/comprasService';
import type { Invoice, InvoiceDraft, InvoiceRepository } from './types';
import { calculateTotals, normalizeDocument, validateInvoice, validatePending } from './domain';
import { localInvoiceRepository } from './localRepository';
import { calculateOrderProgress } from './orderRules';
export const invoiceMasters = {
  suppliers: () => supplierRepository.listStrict(), products: () => productRepository.list(),
  orders: async () => {
    const orders = await comprasService.getOrdenesCompra();
    const localOrders = readCachedPurchaseOrders();
    return [...orders.map(order => ({ ...order, descuento_global: order.descuento_global ?? localOrders.find(local => local.id === order.id)?.descuento_global })), ...localOrders.filter(local => !orders.some(order => order.id === local.id || order.codigo === local.codigo))];
  },
};
export function createInvoiceService(repository: InvoiceRepository) {
  return {
    list: repository.list, get: repository.get,
    async orderProgress(order: OrdenCompra) {
      const invoices = new Map<string, Invoice>();
      let page = 1;
      while (true) {
        const result = await repository.list({ search: '', supplierId: '', currency: '', status: '', from: '', to: '', orderId: order.id, page, pageSize: 100 });
        for (const invoice of result.items) {
          if (invoices.has(invoice.id)) throw new Error('Los registros cambiaron durante la consulta. Actualiza para revisar el acumulado.');
          invoices.set(invoice.id, invoice);
        }
        if (invoices.size === result.total) break;
        if (!result.items.length || invoices.size > result.total) throw new Error('No se pudo obtener el historial completo de la orden.');
        page++;
      }
      return calculateOrderProgress(order, [...invoices.values()]);
    },
    async save(draft: InvoiceDraft, id: string, options?: { pending?: boolean; expectedRevision: number }) {
      const previous = options ? await repository.get(id) : undefined;
      const metadata = previous ? { internalId: previous.internalId, automaticOrderId: previous.automaticOrderId, revision: previous.revision } : {};
      if (options?.pending) {
        const errors = validatePending(draft); if (errors.length) throw new Error(errors.join(' '));
        return repository.save({ ...draft, ...metadata, id, createdAt: previous!.createdAt, status: 'PENDIENTE', totals: calculateTotals(draft.lines) }, options.expectedRevision);
      }
      const errors = validateInvoice(draft); if (errors.length) throw new Error(errors.join(' '));
      const suppliers = await invoiceMasters.suppliers();
      const supplier = suppliers.find(s => s.id === draft.supplierId);
      if (!supplier) throw new Error('El proveedor ya no está disponible.');
      const products = await invoiceMasters.products();
      if (draft.lines.some(l => !products.some(p => p.id === l.productId))) throw new Error('Hay productos que no están disponibles en el maestro.');
      if (draft.orderId) {
        const order = (await invoiceMasters.orders()).find(o => o.id === draft.orderId);
        if (!order || order.proveedor_id !== supplier.id || order.estado === 'ANULADA') throw new Error('La orden no es compatible con el proveedor.');
        if (draft.lines.some(line => line.orderLineId && !(order.items ?? []).some(item => item.id === line.orderLineId && item.producto_id === line.productId && (!item.unidad || item.unidad === line.unit)))) throw new Error('Revisa las referencias de las líneas: la orden cambió o no corresponde al producto y unidad seleccionados.');
      }
      return repository.save({ ...draft, ...metadata, supplierName: supplier.nombre, supplierDocument: supplier.documento, series: normalizeDocument(draft.series), number: normalizeDocument(draft.number), id, createdAt: previous?.createdAt ?? new Date().toISOString(), status: 'REGISTRADA', totals: calculateTotals(draft.lines) }, options?.expectedRevision);
    },
  };
}
export const invoiceService = createInvoiceService(localInvoiceRepository);
