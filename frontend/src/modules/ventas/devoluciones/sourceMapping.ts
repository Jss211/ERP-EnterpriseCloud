import type { Venta } from '../../../services/ventasService';
import type { Cliente } from '../../../services/clientesService';
import type { SaleSource } from './types';

type Legacy = Record<string, unknown>;
const string = (value: unknown) => typeof value === 'string' ? value : '';
const optionalId = (value: unknown) => string(value) || undefined;
const object = (value: unknown): Legacy => value && typeof value === 'object' && !Array.isArray(value) ? value as Legacy : {};
export function mapSaleSources(sales: Venta[], localOrders: unknown[], accounts: unknown[], customers: readonly Cliente[]): SaleSource[] {
  const remote: SaleSource[] = sales.filter(s => s.id && s.estado !== 'Anulada').map(s => {
    const customer = customers.find(c => c.id === s.cliente_id);
    const receipts: SaleSource['receipts'] = [];
    // This is a document number in ventas, not proof of electronic issuance.
    if (/^[FB]\d{3}-/i.test(s.numero)) receipts.push({ origin: 'venta', saleId: s.id, number: s.numero });
    for (const raw of accounts) {
      const account = object(raw);
      if (account.dbId === s.id && string(account.nro) && !receipts.some(r => r.number === account.nro)) receipts.push({ origin: 'estado-cuenta', saleId: s.id, number: string(account.nro) });
    }
    return {
      origin: 'ventas', id: s.id, number: s.numero || s.id, customerId: optionalId(s.cliente_id), customerName: s.cliente_nombre,
      customerDocument: customer?.documento ?? '', date: s.fecha, currency: s.moneda,
      lines: s.items.map((l, position) => ({ position, originalLineId: optionalId(l.id), description: l.descripcion, soldQuantity: l.cantidad, unitPrice: l.precio_unitario, originalSubtotal: l.subtotal })), receipts,
    };
  });
  // A local mirror with the same document number is not offered a second time.
  // No line/product/client relationship is inferred from names or descriptions.
  const numbers = new Set(sales.map(s => s.numero));
  const local: SaleSource[] = localOrders.map(object).filter(o => string(o.id) && !numbers.has(string(o.id)) && !['Anulada', 'ANULADA'].includes(string(o.estado))).map(o => ({
    origin: 'orden-local', id: string(o.id), number: string(o.id), customerId: optionalId(o.cliente_id), customerName: string(o.cliente), customerDocument: string(o.ruc ?? o.documento), date: string(o.fecha),
    currency: (o.moneda === undefined ? 'PEN' : string(o.moneda)) as SaleSource['currency'],
    lines: (Array.isArray(o.items) ? o.items : []).map((raw, position) => {
      const line = object(raw);
      return { position, originalLineId: optionalId(line.id), productId: optionalId(line.productoId), description: string(line.desc ?? line.descripcion), soldQuantity: Number(line.cant ?? line.cantidad), unitPrice: Number(line.pUnitario ?? line.precioUnitario), originalSubtotal: Number(line.total ?? line.importe) };
    }), receipts: [],
  }));
  return [...remote, ...local];
}
