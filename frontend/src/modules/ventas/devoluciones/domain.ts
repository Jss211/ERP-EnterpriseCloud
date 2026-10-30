import type { CustomerReturn, LineAvailability, ReturnDraft, SaleSource } from './types';

export const statusLabel = (status: CustomerReturn['status']) => status === 'SOLICITADA' ? 'Solicitud registrada' : 'Confirmada';
export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
export const sameSource = (a: Pick<SaleSource, 'origin' | 'id'>, b: Pick<SaleSource, 'origin' | 'id'>) => a.origin === b.origin && a.id === b.id;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown) => typeof value === 'string';
const optionalText = (value: unknown) => value === undefined || (text(value) && !!value);
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export const referenceAmount = (draft: ReturnDraft) => Math.round(draft.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) * 100) / 100;

export function validateDraft(draft: ReturnDraft): string[] {
  const errors: string[] = [];
  const source = draft?.source;
  if (!source || !['ventas', 'orden-local'].includes(source.origin) || !text(source.id) || !source.id || !text(source.number) || !source.number || !text(source.customerName) || !text(source.customerDocument) || !optionalText(source.customerId) || !text(source.date) || !['PEN', 'USD'].includes(source.currency) || !Array.isArray(source.lines) || !source.lines.length || !Array.isArray(source.receipts)) return ['Selecciona un documento de origen válido.'];
  const positions = new Set<number>();
  for (const line of source.lines) {
    if (!line || !Number.isInteger(line.position) || line.position < 0 || positions.has(line.position) || !optionalText(line.originalLineId) || !optionalText(line.productId) || !text(line.description) || !line.description.trim() || !number(line.soldQuantity) || line.soldQuantity <= 0 || !number(line.unitPrice) || line.unitPrice < 0 || !number(line.originalSubtotal) || line.originalSubtotal < 0) errors.push('El documento contiene líneas incompletas o inválidas.');
    positions.add(line?.position);
  }
  const receiptValid = (r: ReturnDraft['receipt']) => !!r && ['venta', 'estado-cuenta'].includes(r.origin) && text(r.saleId) && r.saleId === source.id && text(r.number) && !!r.number.trim() && source.origin === 'ventas';
  if (source.receipts.some(r => !receiptValid(r)) || (draft.receipt && (!receiptValid(draft.receipt) || !source.receipts.some(r => JSON.stringify(r) === JSON.stringify(draft.receipt))))) errors.push('El comprobante no está relacionado por ID con la venta.');
  if (!text(draft.date) || !validDate(draft.date)) errors.push('Ingresa una fecha válida.');
  if (!text(draft.reason) || !draft.reason.trim() || draft.reason.length > 1000) errors.push('Ingresa un motivo de hasta 1000 caracteres.');
  if (!text(draft.notes) || draft.notes.length > 4000) errors.push('Las observaciones admiten hasta 4000 caracteres.');
  if (!Array.isArray(draft.lines) || !draft.lines.length) return [...errors, 'Selecciona al menos un producto.'];
  const selected = new Set<number>();
  for (const line of draft.lines) {
    const original = source.lines.find(l => l.position === line?.position);
    if (!line || !original || selected.has(line.position) || ['originalLineId', 'productId', 'description', 'soldQuantity', 'unitPrice', 'originalSubtotal'].some(k => line[k as keyof typeof line] !== original[k as keyof typeof original])) errors.push('Las líneas deben pertenecer al documento de origen, sin duplicados ni alteraciones.');
    if (!number(line?.quantity) || line.quantity <= 0 || line.quantity > (original?.soldQuantity ?? 0)) errors.push('La cantidad debe ser mayor a cero y no superar lo vendido.');
    if (!text(line?.reason) || !line.reason.trim() || line.reason.length > 1000 || !text(line?.notes) || line.notes.length > 4000) errors.push('Cada línea requiere un motivo y observaciones de hasta 4000 caracteres.');
    selected.add(line?.position);
  }
  if (!Number.isFinite(referenceAmount(draft))) errors.push('El importe de referencia no es válido.');
  return [...new Set(errors)];
}

export function availability(source: SaleSource, records: CustomerReturn[]): LineAvailability[] {
  const confirmed = records.filter(r => r.status === 'CONFIRMADA' && sameSource(r.source, source));
  // Missing or stale IDs on a confirmed document prevent claiming a safe balance.
  const ambiguous = confirmed.some(r => r.lines.some(l => !l.originalLineId || source.lines.filter(s => s.originalLineId === l.originalLineId).length !== 1 || r.source.lines.filter(s => s.originalLineId === l.originalLineId).length !== 1));
  return source.lines.map(line => {
    const identified = !!line.originalLineId && source.lines.filter(l => l.originalLineId === line.originalLineId).length === 1;
    const matching = confirmed.flatMap(r => r.lines.filter(l => identified && l.originalLineId === line.originalLineId));
    const compatible = matching.every(l => l.soldQuantity === line.soldQuantity && l.unitPrice === line.unitPrice && l.productId === line.productId);
    const quantity = compatible ? matching.reduce((sum, l) => sum + l.quantity, 0) : 0;
    return { position: line.position, confirmed: quantity, maximum: Math.max(0, Number((line.soldQuantity - quantity).toFixed(10))), reliable: identified && compatible && !ambiguous };
  });
}

export function validateAvailability(draft: ReturnDraft, records: CustomerReturn[]): string[] {
  const balances = availability(draft.source, records);
  return draft.lines.some(l => l.quantity > balances.find(b => b.position === l.position)!.maximum) ? ['La cantidad supera lo disponible después de las devoluciones confirmadas verificables. Actualiza el documento y revisa las cantidades.'] : [];
}

export function sourceErrors(source: SaleSource): string[] {
  return validateDraft({ source, date: '2000-01-01', reason: 'Revisión del origen', notes: '', lines: Array.isArray(source.lines) ? source.lines.map(l => ({ ...l, quantity: l.soldQuantity, reason: 'Revisión del origen', notes: '' })) : [] });
}

export function validateRecord(row: CustomerReturn): boolean {
  return !!row && text(row.id) && !!row.id && text(row.createdAt) && Number.isFinite(Date.parse(row.createdAt)) && ['SOLICITADA', 'CONFIRMADA'].includes(row.status) && validateDraft(row).length === 0;
}

// Stable semantic representation: no timestamp and no property-order dependency.
export function draftIdentity(draft: ReturnDraft): string {
  return JSON.stringify([draft.source.origin, draft.source.id, draft.receipt?.origin ?? '', draft.receipt?.saleId ?? '', draft.receipt?.number ?? '', draft.date, draft.reason.trim(), draft.notes.trim(), [...draft.lines].sort((a,b) => a.position - b.position).map(l => [l.position, l.quantity, l.reason.trim(), l.notes.trim()])]);
}
