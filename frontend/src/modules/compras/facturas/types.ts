export const INVOICE_STATUSES: readonly { value: Invoice['status']; label: string }[] = [{ value: 'PENDIENTE', label: 'Pendiente de completar' }, { value: 'REGISTRADA', label: 'Registrada' }];
export const invoiceInternalId = (invoice: Pick<Invoice, 'id' | 'internalId'>) => invoice.internalId || `FP-${invoice.id}`;
export interface InvoiceLine {
  id: string; productId: string; code: string; description: string; unit: string;
  orderLineId?: string; orderedQuantity?: number; orderedPrice?: number;
  quantity: number; price: number; discount: number; tax: number;
}
export interface InvoiceDraft {
  supplierId: string; supplierName: string; supplierDocument: string;
  documentType: 'FACTURA'; series: string; number: string;
  issuedAt: string; dueAt: string; currency: 'PEN' | 'USD'; paymentDays: number;
  orderId?: string; orderCode?: string; notes: string; lines: InvoiceLine[];
  orderDiscountAmount?: number;
}
export interface Invoice extends InvoiceDraft {
  id: string; createdAt: string; status: 'PENDIENTE' | 'REGISTRADA';
  internalId?: string; automaticOrderId?: string; revision?: number;
  totals: { base: number; tax: number; total: number };
}
export interface InvoiceQuery { search: string; supplierId: string; currency: string; status: string; from: string; to: string; page: number; pageSize: number; orderId?: string }
export interface InvoiceRepository {
  list(query: InvoiceQuery): Promise<{ items: Invoice[]; total: number }>;
  get(id: string): Promise<Invoice>;
  save(invoice: Invoice, expectedRevision?: number): Promise<Invoice>;
  ensurePending(invoice: Invoice): Promise<Invoice>;
}
