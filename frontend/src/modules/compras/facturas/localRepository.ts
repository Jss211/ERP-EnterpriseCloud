import type { Invoice, InvoiceRepository } from './types';
import { invoiceInternalId } from './types';
import { calculateTotals, duplicateKey, validateInvoice, validatePending } from './domain';
export const INVOICE_STORAGE_KEY = 'erp_supplier_invoices_v1';
function hasStoredShape(row: Invoice): boolean {
  const text = (value: unknown) => typeof value === 'string';
  const optionalText = (value: unknown) => value === undefined || text(value);
  return ['supplierId', 'supplierName', 'supplierDocument', 'series', 'number', 'issuedAt', 'dueAt', 'notes'].every(key => text(row[key as keyof Invoice]))
    && optionalText(row.internalId) && optionalText(row.automaticOrderId)
    && (row.revision === undefined || (Number.isInteger(row.revision) && row.revision >= 0))
    && (row.orderDiscountAmount === undefined || (Number.isFinite(row.orderDiscountAmount) && row.orderDiscountAmount >= 0))
    && optionalText(row.orderId) && optionalText(row.orderCode)
    && Array.isArray(row.lines) && new Set(row.lines.map(line => line?.id)).size === row.lines.length
    && row.lines.every(line => line && ['id', 'productId', 'code', 'description', 'unit'].every(key => text(line[key as keyof typeof line]))
      && optionalText(line.orderLineId) && (line.orderedQuantity === undefined || (Number.isFinite(line.orderedQuantity) && line.orderedQuantity >= 0))
      && (line.orderedPrice === undefined || (Number.isFinite(line.orderedPrice) && line.orderedPrice >= 0)));
}
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function createLocalInvoiceRepository(storage: () => StoragePort): InvoiceRepository {
  function read(): Invoice[] {
    try {
      const raw = storage().getItem(INVOICE_STORAGE_KEY);
      if (raw === null) return [];
      const envelope = JSON.parse(raw);
      return verify(envelope);
    } catch { throw new Error('No se puede leer el almacenamiento de facturas o su contenido es inválido. Los datos se conservan intactos; revisa el almacenamiento del navegador.'); }
  }
  function verify(envelope: { version: number; records: Invoice[] }): Invoice[] {
      if (![1, 2].includes(envelope?.version) || !Array.isArray(envelope.records)) throw new Error();
      const ids = new Set<string>(); const keys = new Set<string>(); const automaticOrders = new Set<string>(); const internalIds = new Set<string>();
      for (const row of envelope.records) {
        if (!row || !hasStoredShape(row) || typeof row.id !== 'string' || !row.id || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) || !['PENDIENTE', 'REGISTRADA'].includes(row.status) || (envelope.version === 1 && row.status !== 'REGISTRADA') || typeof row.notes !== 'string' || typeof row.supplierDocument !== 'string' || !Array.isArray(row.lines) || (row.status === 'REGISTRADA' ? validateInvoice(row) : validatePending(row)).length || JSON.stringify(calculateTotals(row.lines)) !== JSON.stringify(row.totals) || ids.has(row.id) || (row.status === 'REGISTRADA' && keys.has(duplicateKey(row))) || internalIds.has(invoiceInternalId(row)) || (row.automaticOrderId && (row.automaticOrderId !== row.orderId || automaticOrders.has(row.automaticOrderId))) || (row.status === 'PENDIENTE' && !row.automaticOrderId)) throw new Error();
        ids.add(row.id); internalIds.add(invoiceInternalId(row)); if (row.status === 'REGISTRADA') keys.add(duplicateKey(row)); if (row.automaticOrderId) automaticOrders.add(row.automaticOrderId);
      }
      return envelope.records;
  }
  return {
    async list(q) {
      const search = q.search.trim().toLocaleLowerCase('es');
      const records = read().filter(r => (!search || `${invoiceInternalId(r)} ${r.orderId ?? ''} ${r.orderCode ?? ''} ${r.supplierName} ${r.supplierDocument} ${r.series}-${r.number}`.toLocaleLowerCase('es').includes(search)) && (!q.orderId || r.orderId === q.orderId) && (!q.supplierId || r.supplierId === q.supplierId) && (!q.currency || r.currency === q.currency) && (!q.status || r.status === q.status) && (!q.from || r.issuedAt >= q.from) && (!q.to || (!!r.issuedAt && r.issuedAt <= q.to))).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      const size = Math.max(1, Math.min(100, q.pageSize));
      return { items: records.slice((Math.max(1, q.page) - 1) * size, Math.max(1, q.page) * size), total: records.length };
    },
    async get(id) { const row = read().find(r => r.id === id); if (!row) throw new Error('Factura no encontrada.'); return row; },
    async save(invoice, expectedRevision) {
      return locked(() => {
        const records = read();
        const previous = records.find(r => r.id === invoice.id);
        const errors = invoice.status === 'REGISTRADA' ? validateInvoice(invoice) : validatePending(invoice);
        if (errors.length || !hasStoredShape(invoice)) throw new Error(errors.join(' ') || 'Datos de factura no válidos.');
        if (previous?.status === 'REGISTRADA') {
          const comparable = (r: Invoice) => JSON.stringify({ ...r, createdAt: '', revision: 0 });
          if (comparable(previous) === comparable(invoice)) return previous;
          throw new Error('La factura ya está registrada y no se puede sobrescribir.');
        }
        if (previous && (expectedRevision !== (previous.revision ?? 0) || invoice.orderId !== previous.orderId)) throw new Error('El pendiente cambió en otra ventana. Vuelve a abrirlo antes de guardar; tu formulario se conserva.');
        if (!previous && invoice.status !== 'REGISTRADA') throw new Error('Genera el pendiente desde su orden.');
        if (invoice.status === 'REGISTRADA' && records.some(r => r.id !== invoice.id && r.status === 'REGISTRADA' && duplicateKey(r) === duplicateKey(invoice))) throw new Error('Ya existe una factura con este proveedor, tipo, serie y número.');
        const saved: Invoice = previous ? { ...invoice, createdAt: previous.createdAt, internalId: invoiceInternalId(previous), automaticOrderId: previous.automaticOrderId, revision: (previous.revision ?? 0) + 1 } : invoice;
        persist(previous ? records.map(r => r.id === saved.id ? saved : r) : [saved, ...records]);
        return saved;
      });
    },
    async ensurePending(invoice) {
      return locked(() => {
        const records = read();
        const previous = records.find(r => r.automaticOrderId === invoice.orderId);
        if (previous) return previous; // Never refresh a user's edited snapshot or a registered invoice.
        const errors = validatePending(invoice);
        if (errors.length || invoice.status !== 'PENDIENTE' || invoice.automaticOrderId !== invoice.orderId || !hasStoredShape(invoice) || records.some(r => r.id === invoice.id || invoiceInternalId(r) === invoiceInternalId(invoice))) throw new Error(errors.join(' ') || 'No se puede crear esta referencia pendiente.');
        persist([invoice, ...records]);
        return invoice;
      });
    },
  };
  function persist(records: Invoice[]) {
    verify({ version: 2, records });
    try { storage().setItem(INVOICE_STORAGE_KEY, JSON.stringify({ version: 2, records })); }
    catch { throw new Error('No se pudo guardar: almacenamiento lleno o no disponible. El formulario se conserva.'); }
  }
  function locked<T>(write: () => T): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(INVOICE_STORAGE_KEY, write);
    return Promise.resolve().then(write);
  }
}
export const localInvoiceRepository = createLocalInvoiceRepository(() => window.localStorage);
