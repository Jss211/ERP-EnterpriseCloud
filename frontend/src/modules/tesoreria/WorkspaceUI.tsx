import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { button, control } from './styles';

export function WorkspaceSearch({ label, value, onChange, children, onReset, active = false }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; onReset: () => void; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="min-w-0 border-b border-slate-200 py-3 dark:border-slate-800">
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-44"><span className="sr-only">{label}</span><Search aria-hidden="true" size={17} className="absolute left-3 top-3 text-slate-400"/><input className={`${control} pl-9`} placeholder={label} value={value} onChange={e => onChange(e.target.value)}/></label>
      <button className={button} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span className="flex items-center gap-2"><SlidersHorizontal size={16} aria-hidden="true"/>Filtros{active && <span className="sr-only"> activos</span>}</span></button>
      <button className={button} onClick={onReset}>Limpiar / actualizar</button>
    </div>
    <div id={id} hidden={!open} className="mt-3 grid gap-3 rounded-xl bg-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-4 dark:bg-slate-800/50">{children}</div>
    {active && !open && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Hay filtros activos. Abre Filtros para revisarlos.</p>}
  </div>;
}

export function WorkspaceEmpty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div role="status" className="flex max-w-2xl items-start gap-4 py-6"><span className="shrink-0 rounded-xl bg-slate-100 p-3 text-blue-600 dark:bg-slate-800 dark:text-blue-300">{icon}</span><div className="min-w-0"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{children}</p>{action && <div className="mt-3">{action}</div>}</div></div>;
}
