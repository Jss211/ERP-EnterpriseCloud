import { useEffect, useState, type SelectHTMLAttributes } from 'react';
import { inventarioService } from '../../services/inventarioService';

type Option = { id: string; label: string };
export function MasterSelect({ options, placeholder = 'Seleccionar registro', ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }) {
  return <select {...props} className={props.className ?? 'w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white'}>
    <option value="">{placeholder}</option>
    {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>;
}

export function CatalogValueSelect({ kind, value, onChange }: { kind: 'lineas' | 'unidades' | 'almacenes'; value: string; onChange: (value: string) => void }) {
  const [options, setOptions] = useState<Option[]>([]);
  useEffect(() => {
    let mounted = true;
    inventarioService.getCatalogosBase().then(catalogs => {
      if (mounted) setOptions(catalogs[kind].map(item => ({ id: kind === 'unidades' ? ('simbolo' in item ? item.simbolo : '') || item.codigo || item.nombre : item.nombre, label: item.nombre })));
    });
    return () => { mounted = false; };
  }, [kind]);
  // Existing schema stores names/symbols for catalog fields. Preserve historic values.
  const available = value && !options.some(option => option.id === value) ? [{ id: value, label: `${value} (valor existente)` }, ...options] : options;
  return <MasterSelect required value={value} options={available} onChange={event => onChange(event.target.value)} placeholder="Seleccionar catálogo existente" />;
}
