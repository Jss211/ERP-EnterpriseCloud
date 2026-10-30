import type { ReadRepository } from './contracts';
export const LEGACY_MASTERS_KEY = 'erp_maestros_tech_data_v2';
export interface LegacyCatalog { id: string; records: Record<string, unknown>[] }
// Read-only adapter. Never initializes, merges or overwrites historical browser data.
async function readCatalogs(strict = false): Promise<LegacyCatalog[]> {
    const stored = localStorage.getItem(LEGACY_MASTERS_KEY);
    if (!stored) return [];
    const data: unknown = JSON.parse(stored);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('El archivo local tiene un formato no reconocido. Se conserva intacto.');
    return Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([id, value]) => {
      const rows=value as unknown[];
      const valid=(record:unknown):record is Record<string, unknown>=>!!record&&typeof record==='object'&&!Array.isArray(record);
      if(strict&&rows.some(record=>!valid(record)))throw new Error('El catálogo anterior tiene registros dañados. Se conserva intacto.');
      return {id,records:rows.filter(valid)};
    });
}
export const legacyCatalogRepository: ReadRepository<LegacyCatalog> & { listStrict():Promise<LegacyCatalog[]> } = {
  source: 'local-legacy',
  list:()=>readCatalogs(),
  listStrict:()=>readCatalogs(true),
};
