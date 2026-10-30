import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import type { CustomerReturn } from './types';
import { button } from './ReturnLines';
import { ReturnStatus } from './ReturnUI';

const available = (value: unknown) => typeof value === 'string' && value.trim() ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : 'No disponible';
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const amount = (value: unknown, currency: unknown) => numeric(value) ? `${typeof currency === 'string' && currency.trim() ? `${currency} ` : ''}${value.toFixed(2)}` : 'No disponible';

export function ReturnDetailContent({ request }: { request: CustomerReturn }) {
  const source = request?.source;
  const lines = Array.isArray(request?.lines) ? request.lines : [];
  const references = lines.some(l => numeric(l?.unitPrice) || numeric(l?.originalSubtotal));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Identificador de solicitud</p><p className="break-all font-mono text-sm font-medium">{available(request?.id)}</p></div><div><p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Estado</p>{request?.status === 'SOLICITADA' || request?.status === 'CONFIRMADA' ? <ReturnStatus status={request.status} /> : <p className="text-sm">No disponible</p>}</div></div>
    <dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><dt className="text-xs text-slate-500 dark:text-slate-400">Venta relacionada</dt><dd className="mt-1 break-words font-semibold">{available(source?.number)}</dd><dt className="mt-3 text-xs text-slate-500 dark:text-slate-400">Comprobante relacionado</dt><dd className="mt-1 break-words text-sm">{available(request?.receipt?.number)}</dd></div><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><dt className="text-xs text-slate-500 dark:text-slate-400">Cliente</dt><dd className="mt-1 break-words font-semibold">{available(source?.customerName)}</dd><dt className="mt-3 text-xs text-slate-500 dark:text-slate-400">Documento del cliente</dt><dd className="mt-1 text-sm">{available(source?.customerDocument)}</dd></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><dt className="text-xs text-slate-500 dark:text-slate-400">Fecha de solicitud</dt><dd className="mt-1 text-sm font-medium">{available(request?.date)}</dd></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><dt className="text-xs text-slate-500 dark:text-slate-400">Moneda de referencia</dt><dd className="mt-1 text-sm font-medium">{available(source?.currency)}</dd></div></dl>
    <div><h3 className="mb-3 font-semibold">Productos y cantidades solicitadas</h3>{lines.length ? <div className="space-y-3">{lines.map((line,index) => <article key={index} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><h4 className="min-w-0 flex-1 break-words text-sm font-semibold">{available(line?.description)}</h4><p className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">Cantidad solicitada: <strong>{available(line?.quantity)}</strong></p></div><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500 dark:text-slate-400">Cantidad vendida</dt><dd className="mt-1">{available(line?.soldQuantity)}</dd></div>{references && <><div><dt className="text-xs text-slate-500 dark:text-slate-400">Precio original de referencia</dt><dd className="mt-1">{amount(line?.unitPrice, source?.currency)}</dd></div><div><dt className="text-xs text-slate-500 dark:text-slate-400">Importe original de referencia</dt><dd className="mt-1">{amount(line?.originalSubtotal, source?.currency)}</dd></div></>}<div><dt className="text-xs text-slate-500 dark:text-slate-400">Motivo de la línea</dt><dd className="mt-1 whitespace-pre-wrap break-words">{available(line?.reason)}</dd></div><div><dt className="text-xs text-slate-500 dark:text-slate-400">Observaciones de la línea</dt><dd className="mt-1 whitespace-pre-wrap break-words">{available(line?.notes)}</dd></div></dl></article>)}</div> : <p className="text-sm text-slate-500 dark:text-slate-400">No disponible</p>}{!references && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Importes de referencia: No disponible</p>}</div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><h3 className="mb-2 text-sm font-semibold">Motivo</h3><p className="whitespace-pre-wrap break-words text-sm">{available(request?.reason)}</p></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><h3 className="mb-2 text-sm font-semibold">Observaciones</h3><p className="whitespace-pre-wrap break-words text-sm">{available(request?.notes)}</p></div></div>
    {references && <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Los importes corresponden a las referencias guardadas del documento original. No representan un abono ni un reembolso.</p>}
  </div>;
}

export function ReturnDetailModal({ request, trigger, onClose }: { request: CustomerReturn; trigger: HTMLElement | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const scrollContainer = document.querySelector<HTMLElement>('main > div');
    const scrollTop = scrollContainer?.scrollTop;
    const scrollLeft = scrollContainer?.scrollLeft;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      if (scrollContainer) { scrollContainer.scrollTop = scrollTop ?? 0; scrollContainer.scrollLeft = scrollLeft ?? 0; }
    };
  }, [trigger]);
  return createPortal(<dialog ref={dialogRef} aria-labelledby={titleId} aria-modal="true" onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => el.tabIndex >= 0 && el.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }} className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm open:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6"><h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold"><FileText aria-hidden="true" size={20} className="shrink-0 text-blue-500" />Detalle de devolución</h2><button type="button" autoFocus aria-label="Cerrar detalle" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-400 dark:hover:bg-slate-800"><X aria-hidden="true" size={20} /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"><ReturnDetailContent request={request} /></div>
    <footer className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6"><button className={button} onClick={onClose}>Cerrar</button></footer>
  </dialog>, document.body);
}
