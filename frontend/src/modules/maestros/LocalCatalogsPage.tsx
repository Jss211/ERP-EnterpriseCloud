import { useEffect, useState } from 'react';
import { legacyCatalogRepository, type LegacyCatalog } from '../../repositories/legacyCatalogRepository';
import { findDuplicates } from '../../repositories/contracts';

export function LocalCatalogsPage() {
  const [catalogs, setCatalogs] = useState<readonly LegacyCatalog[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { legacyCatalogRepository.list().then(setCatalogs).catch(error => setError(String(error))); }, []);
  return <section className="space-y-5 text-slate-800 dark:text-slate-100">
    <h1 className="text-2xl font-bold">Catálogos locales anteriores</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Solo consulta · Datos locales de este navegador, de origen no verificado. No se combinan con los maestros operativos ni se usan para calcular comisiones, metas o tipos de cambio oficiales. Su consolidación requiere revisión.</p>
    {error && <p role="alert">{error}</p>}
    {!error && catalogs.length === 0 && <p>No hay catálogos anteriores guardados en este navegador.</p>}
    {catalogs.map(catalog => {
      const duplicates = findDuplicates<Record<string, unknown> & { id: string }>(catalog.records.map((record, index) => ({ ...record, id: String(record.id ?? index) })), record => String(record.codigo ?? record.ruc ?? record.codigoIso ?? ''));
      const columns = [...new Set(catalog.records.flatMap(record => Object.keys(record)))];
      return <article key={catalog.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold capitalize">{catalog.id} · {catalog.records.length} registros</h2>
        {duplicates.length > 0 && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Posibles duplicados sin modificar: {duplicates.map(group => `${group.key} (${group.ids.join(', ')})`).join('; ')}</p>}
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{columns.map(column => <th key={column} className="whitespace-nowrap p-2">{column}</th>)}</tr></thead><tbody>{catalog.records.map((record, index) => <tr key={index} className="border-t border-slate-100 dark:border-slate-800">{columns.map(column => <td key={column} className="p-2">{String(record[column] ?? '')}</td>)}</tr>)}</tbody></table></div>
      </article>;
    })}
  </section>;
}
