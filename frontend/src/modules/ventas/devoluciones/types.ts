export interface ReceiptReference {
  origin: 'venta' | 'estado-cuenta';
  saleId: string;
  number: string;
}
export interface SaleLineSnapshot {
  position: number;
  originalLineId?: string;
  productId?: string;
  description: string;
  soldQuantity: number;
  unitPrice: number;
  originalSubtotal: number;
}
export interface SaleSource {
  origin: 'ventas' | 'orden-local';
  id: string;
  number: string;
  customerId?: string;
  customerName: string;
  customerDocument: string;
  date: string;
  currency: 'PEN' | 'USD';
  lines: SaleLineSnapshot[];
  receipts: ReceiptReference[];
}
export interface ReturnLine extends SaleLineSnapshot {
  quantity: number;
  reason: string;
  notes: string;
}
export interface ReturnDraft {
  source: SaleSource;
  receipt?: ReceiptReference;
  date: string;
  reason: string;
  notes: string;
  lines: ReturnLine[];
}
// Only SOLICITADA can be created in this stage. CONFIRMADA supports historical
// confirmed records and a future adapter; there is no confirmation action here.
export type ReturnStatus = 'SOLICITADA' | 'CONFIRMADA';
export interface CustomerReturn extends ReturnDraft {
  id: string;
  createdAt: string;
  status: ReturnStatus;
}
export interface ReturnQuery {
  search: string;
  customer: string;
  from: string;
  to: string;
  status: '' | ReturnStatus;
  page: number;
  pageSize: number;
  source?: { origin: SaleSource['origin']; id: string };
}
export interface ReturnRepository {
  list(query: ReturnQuery): Promise<{ items: CustomerReturn[]; total: number }>;
  get(id: string): Promise<CustomerReturn | null>;
  save(request: CustomerReturn): Promise<CustomerReturn>;
}
export interface ReturnSources {
  list(): Promise<SaleSource[]>;
}
export interface LineAvailability {
  position: number;
  confirmed: number;
  maximum: number;
  reliable: boolean;
}
