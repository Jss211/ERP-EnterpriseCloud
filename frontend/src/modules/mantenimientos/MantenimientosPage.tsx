import { useEffect, useState } from 'react';
import { inventarioService, type CatalogoItem } from '../../services/inventarioService';
import { StockProductosPage } from '../inventario/StockProductosPage';
const tabs = [{ id: 'productos', name: 'Productos' }, { id: 'lineas', name: 'Líneas / Categorías' }, { id: 'marcas', name: 'Marcas' }, { id: 'almacenes', name: 'Almacenes' }, { id: 'unidades', name: 'Unidades de medida' }] as const;
type Tab = typeof tabs[number]['id'];
export function MantenimientosPage() {
  const [tab, setTab] = useState<Tab>('productos');
  const [catalogs, setCatalogs] = useState<Record<string, CatalogoItem[]>>({});
  const [search, setSearch] = useState('');
  useEffect(() => { inventarioService.getCatalogosBase().then(setCatalogs); }, []);
  return <section className="space-y-5 text-slate-800 dark:text-slate-100">
    <header><h1 className="text-2xl font-bold">Maestros · Productos y catálogos</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Mantenimientos ahora pertenece a Maestros. Productos utiliza el mismo formulario y servicio que Inventario. Catálogos base: consulta disponible; edición pendiente.</p></header>
    <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Catálogos">{tabs.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setSearch(''); }} className={`shrink-0 rounded-xl px-4 py-2 text-sm ${tab === item.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{item.name}</button>)}</div>
    {tab === 'productos' ? <StockProductosPage masterMode /> : <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">{tabs.find(item => item.id === tab)?.name}</h2>
      <input aria-label="Filtrar catálogo" placeholder="Filtrar registros…" value={search} onChange={event => setSearch(event.target.value)} className="my-4 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700" />
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Código</th><th className="p-2">Nombre</th><th className="p-2">Detalle</th></tr></thead><tbody>{(catalogs[tab] ?? []).filter(item => JSON.stringify(item).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(item => <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{item.codigo || '—'}</td><td className="p-2">{item.nombre}</td><td className="p-2">{item.descripcion || item.direccion || item.paisOrigen || item.simbolo || '—'}</td></tr>)}</tbody></table></div>
      {(catalogs[tab] ?? []).length === 0 && <p className="py-4 text-sm text-slate-500">No hay datos disponibles del catálogo. No se sustituyen por ejemplos locales.</p>}
    </article>}
  </section>;
}
