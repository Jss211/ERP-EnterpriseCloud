import type { CustomerReturn, ReturnRepository } from './types';
import { draftIdentity, normalize, sameSource, validateAvailability, validateRecord } from './domain';

export const RETURN_STORAGE_KEY = 'erp_customer_returns_v1';
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function createLocalReturnRepository(storage: () => StoragePort): ReturnRepository {
  function read(): CustomerReturn[] {
    try {
      const raw = storage().getItem(RETURN_STORAGE_KEY);
      if (raw === null) return [];
      const envelope = JSON.parse(raw);
      if (envelope?.version !== 1 || !Array.isArray(envelope.records)) throw new Error();
      const ids = new Set<string>();
      for (const row of envelope.records) {
        if (!validateRecord(row) || ids.has(row.id)) throw new Error();
        ids.add(row.id);
      }
      return envelope.records;
    } catch { throw new Error('No se pueden leer las devoluciones: almacenamiento no disponible o contenido inválido. Los datos se conservan intactos.'); }
  }
  return {
    async list(q) {
      const search = normalize(q.search);
      const customer = normalize(q.customer);
      const rows = read().filter(r => (!search || normalize(`${r.id} ${r.source.number} ${r.receipt?.number ?? ''}`).includes(search)) && (!customer || normalize(`${r.source.customerName} ${r.source.customerDocument} ${r.source.customerId ?? ''}`).includes(customer)) && (!q.status || r.status === q.status) && (!q.from || r.date >= q.from) && (!q.to || r.date <= q.to) && (!q.source || sameSource(q.source, r.source))).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      const size = Math.max(1, Math.min(100, Math.trunc(q.pageSize) || 10));
      const start = (Math.max(1, Math.trunc(q.page) || 1) - 1) * size;
      return { items: rows.slice(start, start + size), total: rows.length };
    },
    async get(id) { return read().find(r => r.id === id) ?? null; },
    async save(request) {
      const write = () => {
        const records = read(); // Validate storage before any write, including retries.
        if (!validateRecord(request) || request.status !== 'SOLICITADA') throw new Error('La solicitud de devolución no es válida.');
        const previous = records.find(r => r.id === request.id);
        if (previous) {
          if (previous.status === 'SOLICITADA' && draftIdentity(previous) === draftIdentity(request)) return previous;
          throw new Error('El identificador ya está registrado con otro contenido.');
        }
        const errors = validateAvailability(request, records);
        if (errors.length) throw new Error(errors.join(' '));
        try { storage().setItem(RETURN_STORAGE_KEY, JSON.stringify({ version: 1, records: [request, ...records] })); }
        catch { throw new Error('No se pudo guardar la solicitud: almacenamiento lleno o no disponible. El formulario se conserva; puedes reintentar.'); }
        return request;
      };
      if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(RETURN_STORAGE_KEY, write);
      return write();
    },
  };
}
export const localReturnRepository = createLocalReturnRepository(() => window.localStorage);
