import type { Venta } from '../../services/ventasService';
import type { Invoice } from '../compras/facturas/types';
import type { Currency, ObligationSource } from './types';
import { documentMinor } from './money';

export interface LegacyAccount {
  id?: string; dbId?: string; nro: string; razonSocial: string; tipo: string; productos?: string;
  rawFecha?: string; fecha?: string; vencimiento?: string; moneda?: string; currency?: string;
  total: number; pagado: number; saldo: number; estado?: string; metodoPago?: string;
}
const currency = (value: unknown): Currency => { if (value !== 'PEN' && value !== 'USD') throw new Error('Moneda no soportada en un documento de Tesorería.'); return value; };
export const isoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : undefined;
const legacyIssuedDate = (item: LegacyAccount) => {
  const raw = isoDate(item.rawFecha);
  if (raw) return raw;
  const local = item.fecha?.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/);
  return local ? `${local[3]}-${local[2]}-${local[1]}` : undefined;
};
export function mapReceivables(sales: Venta[], legacy: LegacyAccount[]): ObligationSource[] {
  const rows = new Map<string, ObligationSource>();
  const usedSaleIds = new Set<string>();
  const localNumbers = new Set<string>();
  if (new Set(sales.map(s=>s.id)).size !== sales.length) throw new Error('Hay IDs de venta duplicados. Revisa el origen antes de operar.');
  for (const item of legacy) {
    if (!item || typeof item.nro !== 'string' || !item.nro || typeof item.razonSocial !== 'string') throw new Error('Una cuenta anterior no tiene referencias suficientes. Los datos se conservan.');
    const numbered = sales.filter(s => s.numero === item.nro);
    if ((!item.dbId && numbered.length > 1) || (item.dbId && numbered.some(s=>s.id!==item.dbId))) throw new Error(`Las referencias por ID y número de ${item.nro} son ambiguas. Revisa el origen antes de operar.`);
    const sale = item.dbId ? sales.find(s => s.id === item.dbId) : numbered[0];
    const sourceId = item.dbId || sale?.id;
    const id = sourceId ? `ar:venta:${sourceId}` : `ar:local:${item.id || item.nro}`;
    const originalMinor = documentMinor(item.total);
    const historicalPaidMinor = documentMinor(item.pagado);
    const balance = documentMinor(item.saldo);
    if (originalMinor < 0 || historicalPaidMinor < 0 || balance < 0 || originalMinor !== historicalPaidMinor + balance) throw new Error(`Los importes históricos de ${item.nro} no cuadran. No se pueden registrar nuevos cobros sin revisar el origen.`);
    const row: ObligationSource = { id, kind: 'COBRAR', sourceId: sourceId || item.id || item.nro, document: item.nro, documentType: item.tipo || 'Documento de venta', partyId: sale?.cliente_id || undefined, partyName: item.razonSocial,
      issuedAt: legacyIssuedDate(item), dueAt: isoDate(item.vencimiento), currency: currency(item.moneda || item.currency || sale?.moneda || 'PEN'),
      originalMinor, historicalPaidMinor, cancelled: sale?.estado === 'Anulada' || item.estado === 'ANULADA', description: item.productos || '', legacyMethod: item.metodoPago || sale?.metodo_pago || 'No disponible',
      legacyNote: 'Los cobros anteriores se conservan como importe histórico sin cuenta identificada; no generan movimientos retroactivos.' };
    const previous = rows.get(id);
    if (localNumbers.has(item.nro) && !previous) throw new Error(`Hay documentos con número ${item.nro} e IDs distintos. Los datos se conservan; revisa su relación.`);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error(`Hay cuentas anteriores incompatibles vinculadas a ${item.nro}. Revisa sus referencias antes de operar.`);
    rows.set(id, row); if (sourceId) usedSaleIds.add(sourceId); localNumbers.add(item.nro);
  }
  for (const sale of sales) {
    if (usedSaleIds.has(sale.id) || localNumbers.has(sale.numero)) continue;
    if (!sale.id) throw new Error('Una venta no tiene ID estable.');
    const total = documentMinor(sale.total);
    if (total < 0) throw new Error('La venta tiene un total negativo.');
    rows.set(`ar:venta:${sale.id}`, { id: `ar:venta:${sale.id}`, kind: 'COBRAR', sourceId: sale.id, document: sale.numero || sale.id, documentType: 'Documento de venta', partyId: sale.cliente_id || undefined, partyName: sale.cliente_nombre,
      issuedAt: isoDate(sale.fecha), currency: currency(sale.moneda), originalMinor: total, historicalPaidMinor: sale.estado === 'Completada' ? total : 0,
      cancelled: sale.estado === 'Anulada', description: sale.items.map(l => `${l.cantidad}x ${l.descripcion}`).join(', '), legacyMethod: sale.metodo_pago || 'No disponible',
      legacyNote: sale.estado === 'Completada' ? 'El estado de cuenta anterior consideraba cobrada esta venta completada. Se conserva ese importe histórico sin atribuirlo a una caja.' : undefined });
  }
  return [...rows.values()];
}
export function mapPayables(invoices: Invoice[]): ObligationSource[] {
  return invoices.filter(i => i.status === 'REGISTRADA').map(i => ({ id: `ap:invoice:${i.id}`, kind: 'PAGAR', sourceId: i.id, document: `${i.series}-${i.number}`, documentType: 'Factura de proveedor', partyId: i.supplierId, partyName: i.supplierName, partyDocument: i.supplierDocument,
    issuedAt: isoDate(i.issuedAt), dueAt: isoDate(i.dueAt), currency: currency(i.currency), originalMinor: documentMinor(i.totals.total), historicalPaidMinor: 0, cancelled: false,
    description: i.lines.map(l => `${l.quantity}x ${l.description}`).join(', ') }));
}
