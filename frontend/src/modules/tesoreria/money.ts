import { roundMoney } from '../compras/facturas/domain';
import type { Currency } from './types';
export function minor(value: string): number {
  const text = value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new Error('Ingresa un importe válido con hasta dos decimales.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('El importe excede la precisión admitida.');
  return negative ? -result : result;
}
// Compatibility boundary: existing document totals retain their existing cent rounding.
export function documentMinor(value: number): number {
  if (!Number.isFinite(value)) throw new Error('El documento tiene un importe no disponible.');
  return minor(roundMoney(value).toFixed(2));
}
export function addMinor(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error('El saldo excede la precisión admitida.');
  return sum;
}
export const money = (value: number, currency: Currency) => `${currency} ${(value / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const amountText = (value: number) => (value / 100).toFixed(2);
