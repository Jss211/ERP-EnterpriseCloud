import { Info } from 'lucide-react';
import type { CustomerReturn } from './types';
import { statusLabel } from './domain';

export function ReturnStatus({ status }: { status: CustomerReturn['status'] }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status === 'SOLICITADA' ? 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{statusLabel(status)}</span>;
}
export function ReturnScopeInfo() {
  return <details className="group rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-800 dark:bg-slate-900">
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300"><Info aria-hidden="true" size={15} className="mr-2 inline-block text-blue-500" />Más información</summary>
    <div className="space-y-2 border-t border-slate-100 px-4 py-3 leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400"><p>Esta pantalla registra solicitudes. La aceptación física, la nota de crédito y el reembolso están pendientes de integración.</p><p>No se modifica stock, Kardex, ventas, pagos ni cuentas por cobrar. Una solicitud tampoco acredita la emisión o validación de un documento ante SUNAT.</p><p>Las solicitudes no reservan cantidades. Solo se descuentan devoluciones confirmadas con referencias verificables en este navegador; no se incluyen otros navegadores ni ingresos manuales de Kardex.</p></div>
  </details>;
}
export function ReturnSteps({ step }: { step: number }) {
  return <ol aria-label="Secciones de la solicitud" className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-5 dark:border-slate-800">{['Venta', 'Productos y motivo', 'Revisión'].map((label,i) => <li key={label} aria-current={step === i+1 ? 'step' : undefined} className={`flex min-w-0 items-center gap-2 text-xs sm:text-sm ${step >= i+1 ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-slate-400 dark:text-slate-500'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step >= i+1 ? 'bg-blue-100 dark:bg-blue-500/15' : 'bg-slate-100 dark:bg-slate-800'}`}>{i+1}</span>{label}</li>)}</ol>;
}
export function SectionTitle({ number, title, description }: { number: number; title: string; description: string }) {
  return <div className="mb-4 flex items-start gap-3"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p></div></div>;
}
