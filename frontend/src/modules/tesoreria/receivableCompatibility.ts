import type { ItemEstadoCuenta } from '../ventas/EstadoCuentaPage';
import type { Obligation } from './types';
export function toStatementItem(o: Obligation, lastMethod?: string): ItemEstadoCuenta {
  return { id:o.id,dbId:o.sourceId,tipo:o.documentType,fecha:o.issuedAt||'No disponible',rawFecha:o.issuedAt,nro:o.document,razonSocial:o.partyName,productos:o.description,
    metodoPago:lastMethod||o.legacyMethod||'No disponible',estado:o.paymentStatus,total:o.originalMinor/100,saldo:o.balanceMinor/100,pagado:o.paidMinor/100,
    moneda:o.currency,vencimiento:o.dueAt,vencido:o.overdue,bloqueo:o.blockedReason,documentoAnulado:o.cancelled,obligation:o };
}
