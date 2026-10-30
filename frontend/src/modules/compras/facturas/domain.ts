import type { InvoiceDraft, InvoiceLine } from './types';
export const normalizeDocument = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
export const duplicateKey = (draft: InvoiceDraft) => JSON.stringify([draft.supplierId, draft.documentType, normalizeDocument(draft.series), normalizeDocument(draft.number).replace(/^0+(?=\d)/, '')]);
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function lineTotals(line: InvoiceLine) {
  const base = roundMoney(line.quantity * line.price * (1 - line.discount / 100));
  const tax = roundMoney(base * line.tax / 100);
  return { base, tax, total: roundMoney(base + tax) };
}
export function calculateTotals(lines: InvoiceLine[]) {
  return lines.reduce((sum, line) => {
    const next = lineTotals(line);
    return { base: roundMoney(sum.base + next.base), tax: roundMoney(sum.tax + next.tax), total: roundMoney(sum.total + next.total) };
  }, { base: 0, tax: 0, total: 0 });
}
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export function validateInvoice(d: InvoiceDraft): string[] {
  const errors: string[] = [];
  if (d.orderDiscountAmount !== undefined && (!Number.isFinite(d.orderDiscountAmount) || d.orderDiscountAmount < 0)) errors.push('El descuento de referencia no es válido.');
  if (!d.supplierId || !d.supplierName || d.documentType !== 'FACTURA') errors.push('Selecciona un proveedor existente.');
  if (!/^[A-Z0-9-]{1,20}$/.test(normalizeDocument(d.series)) || !/^\d{1,20}$/.test(normalizeDocument(d.number))) errors.push('Ingresa serie alfanumérica y número de factura numérico (máximo 20 caracteres).');
  if (!validDate(d.issuedAt) || !validDate(d.dueAt) || d.dueAt < d.issuedAt) errors.push('Revisa las fechas: vencimiento no puede ser anterior a emisión.');
  if (!['PEN', 'USD'].includes(d.currency) || !Number.isInteger(d.paymentDays) || d.paymentDays < 0) errors.push('Revisa moneda y condición de pago.');
  if (!d.lines.length) errors.push('Agrega al menos un producto.');
  if (d.lines.some(l => !l.id || !l.productId || !l.description || ![l.quantity, l.price, l.discount, l.tax].every(Number.isFinite) || l.quantity <= 0 || l.price < 0 || l.discount < 0 || l.discount > 100 || l.tax < 0 || l.tax > 100)) errors.push('Revisa las líneas: cantidad positiva, precio no negativo y porcentajes entre 0 y 100.');
  if (!Number.isSafeInteger(Math.round(calculateTotals(d.lines).total * 100)) || calculateTotals(d.lines).total <= 0) errors.push('El total debe ser positivo y finito.');
  return errors;
}

export function validatePending(d: InvoiceDraft): string[] {
  const errors: string[] = [];
  if (!d.orderId || !d.supplierName || d.documentType !== 'FACTURA' || !['PEN', 'USD'].includes(d.currency)) errors.push('El pendiente requiere una orden, proveedor y moneda disponibles.');
  if (d.series && !/^[A-Z0-9-]{1,20}$/.test(normalizeDocument(d.series))) errors.push('Revisa la serie.');
  if (d.number && !/^\d{1,20}$/.test(normalizeDocument(d.number))) errors.push('Revisa el número.');
  if ((d.issuedAt && !validDate(d.issuedAt)) || (d.dueAt && !validDate(d.dueAt)) || (d.issuedAt && d.dueAt && d.dueAt < d.issuedAt)) errors.push('Revisa las fechas.');
  if (!Number.isInteger(d.paymentDays) || d.paymentDays < 0 || d.lines.some(l => !l.id || ![l.quantity,l.price,l.discount,l.tax].every(Number.isFinite) || l.quantity < 0 || l.price < 0 || l.discount < 0 || l.discount > 100 || l.tax < 0 || l.tax > 100)) errors.push('Revisa las cantidades, precios y descuentos del pendiente.');
  if (!Number.isSafeInteger(Math.round(calculateTotals(d.lines).total * 100))) errors.push('Los importes del pendiente no son válidos.');
  if (d.orderDiscountAmount !== undefined && (!Number.isFinite(d.orderDiscountAmount) || d.orderDiscountAmount < 0)) errors.push('El descuento de referencia no es válido.');
  return errors;
}
