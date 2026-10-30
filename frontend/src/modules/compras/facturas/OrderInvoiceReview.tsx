import { useEffect, useState } from 'react';
import type { OrdenCompra } from '../../../services/comprasService';
import type { InvoiceLine } from './types';
import type { OrderProgress } from './orderRules';
import { invoiceService } from './service';

export function OrderInvoiceReview({ orderId, order, lines, revision, editing }: { orderId: string; order?: OrdenCompra; lines: InvoiceLine[]; revision: number; editing: boolean }) {
  const [state, setState] = useState<{ order: OrdenCompra; revision: number; progress?: OrderProgress; error?: string }>();
  useEffect(() => {
    let active = true;
    if (order) invoiceService.orderProgress(order).then(progress => { if (active) setState({ order, revision, progress }); }).catch(() => {
      if (active) setState({ order, revision, error: 'No se pudo consultar el historial completo. El acumulado y el pendiente no están disponibles; puedes continuar el registro.' });
    });
    return () => { active = false; };
  }, [order, revision]);
  const current = state?.order === order && state?.revision === revision ? state : undefined;
  return <div className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700" aria-label="Revisión de la orden">
    <h3 className="font-semibold">Revisión de facturación de la orden</h3>
    <p className="text-slate-500 dark:text-slate-400">Solo facturas guardadas en este navegador. El pendiente compara lo pedido con lo facturado; no representa mercadería recibida ni un saldo de pago. {editing && 'La factura en edición todavía no se incluye en el acumulado.'}</p>
    {!order ? <p>No se encuentra la orden {orderId}. No se pueden calcular cantidades fiables; se conservan las referencias históricas.</p> : !current ? <p role="status">Consultando acumulado…</p> : current.error ? <p role="status">{current.error}</p> : current.progress && <>
      <p>{current.progress.invoiceCount} factura(s) vinculada(s). {current.progress.warning}</p>
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Línea de orden', 'Pedido', 'Acumulado facturado', 'Pendiente de facturar'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{current.progress.lines.map((line, index) => <tr key={`${line.lineId}-${index}`} className="border-t border-slate-200 dark:border-slate-700"><td className="min-w-40 p-2">{line.description} · {line.unit}</td><td className="p-2">{Number.isFinite(line.ordered) ? line.ordered : 'No disponible'}</td>{line.reason ? <td colSpan={2} className="min-w-52 p-2">{line.reason}</td> : <><td className="p-2">{line.billed}</td><td className="p-2">{line.pending}{line.pending! < 0 && ' (exceso)'}</td></>}</tr>)}</tbody></table></div>
    </>}
    {editing && <div className="space-y-1" aria-label="Diferencias para revisión">{lines.map(line => {
      const quantityChanged = line.orderedQuantity !== undefined && Number.isFinite(line.quantity) && line.quantity !== line.orderedQuantity;
      const priceChanged = line.orderedPrice !== undefined && Number.isFinite(line.price) && line.price !== line.orderedPrice;
      const pending = current?.progress?.lines.find(item => item.lineId && item.lineId === line.orderLineId)?.pending;
      const excess = pending !== undefined && Number.isFinite(line.quantity) && lines.filter(l => l.orderLineId === line.orderLineId).reduce((sum, l) => sum + l.quantity, 0) > pending;
      return quantityChanged || priceChanged || excess || !line.orderLineId ? <p key={line.id} className="text-amber-700 dark:text-amber-300">{line.description}: {quantityChanged && `cantidad de esta factura ${line.quantity} frente a ${line.orderedQuantity} pedida. `}{priceChanged && `Precio ${line.price} frente a ${line.orderedPrice} en la orden. `}{excess && 'La cantidad de esta factura supera el pendiente local. '}{!line.orderLineId && 'Sin referencia única de línea de orden; no se asignará por producto automáticamente. '}Revisa la diferencia; no bloquea el guardado.</p> : null;
    })}</div>}
  </div>;
}
