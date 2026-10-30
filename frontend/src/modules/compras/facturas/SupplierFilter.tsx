import { useEffect, useId, useState } from 'react';
import type { Proveedor } from '../../../services/proveedoresService';
import { button, control } from './InvoiceLines';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
export function SupplierFilter({ suppliers, value, onChange, loading, error, retry }: {
  suppliers: readonly Proveedor[]; value: string; onChange: (id: string) => void;
  loading: boolean; error: string; retry: () => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, id]);
  const selected = suppliers.find(s => s.id === value);
  const matches = suppliers.filter(s => normalize(`${s.nombre} ${s.documento}`).includes(normalize(text)));
  const choose = (supplier: Proveedor) => { onChange(supplier.id); setText(''); setOpen(false); setActive(-1); };
  return <div className="relative min-w-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <label htmlFor={id}>Proveedor</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open && !loading && !error ? `${id}-list` : undefined} aria-activedescendant={open && !loading && !error && active >= 0 ? `${id}-${active}` : undefined} className={control}
      placeholder="Nombre o documento" value={selected ? `${selected.nombre}${selected.documento ? ` · ${selected.documento}` : ''}` : text}
      onFocus={() => setOpen(true)} onChange={e => { onChange(''); setText(e.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={e => {
        if (e.key === 'Escape') { setOpen(false); setActive(-1); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(i => matches.length ? (e.key === 'ArrowDown' ? (i + 1) % matches.length : (i <= 0 ? matches.length - 1 : i - 1)) : -1); }
        if (e.key === 'Enter' && open && active >= 0 && matches[active]) { e.preventDefault(); choose(matches[active]); }
      }} />
    {(value || text) && <button type="button" className={button} onClick={() => { onChange(''); setText(''); setActive(-1); }}>Quitar proveedor</button>}
    {loading && <p role="status">Cargando proveedores…</p>}
    {error && <div role="alert">{error} <button className={button} onClick={retry}>Reintentar proveedores</button></div>}
    {open && !loading && !error && <><ul id={`${id}-list`} role="listbox" aria-label="Proveedores" className="absolute z-20 max-h-60 w-full overflow-auto rounded-lg border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
      {matches.map((s, i) => <li key={s.id} id={`${id}-${i}`} role="option" aria-selected={s.id === value} className={`cursor-pointer p-2 ${i === active ? 'bg-blue-100 dark:bg-blue-900' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => choose(s)}>{s.nombre}{s.documento ? ` · ${s.documento}` : ''}</li>)}
    </ul>{!matches.length && <p role="status">No se encontraron proveedores</p>}</>}
  </div>;
}
