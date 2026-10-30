import { findDuplicates } from '../../repositories/contracts';
export function DuplicateNotice({ records }: { records: { id: string; key: string }[] }) {
  const duplicates = findDuplicates(records, record => record.key);
  if (duplicates.length === 0) return null;
  return <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Posibles duplicados por documento o código: {duplicates.map(group => `${group.key} (${group.ids.length} registros)`).join('; ')}. Revisa los registros; no se eliminaron ni fusionaron datos.</p>;
}
