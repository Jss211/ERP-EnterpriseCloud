import type { TreasuryRepository, TreasuryState } from './types';
import { emptyState, queryAccounts, queryMovements, queryOperations, validateState } from './domain';
export const TREASURY_KEY = 'erp_treasury_v1';
interface StoragePort { getItem(key: string): string | null; setItem(key: string,value: string): void }
// Pure, lossless v1 -> v2 migration. Unknown holders remain unspecified.
// Reads never write. The migrated snapshot is persisted with the next successful transaction.
export function migrateTreasuryState(value: unknown): TreasuryState {
  let next = value;
  if (value && typeof value === 'object' && 'version' in value && value.version === 1 && 'accounts' in value && Array.isArray(value.accounts)) {
    next = { ...value, version: 2, accounts: value.accounts.map(account => account && typeof account === 'object' ? { ...account, holderName: account.holderName ?? '', responsibleName: account.responsibleName ?? '' } : account) };
  }
  validateState(next as TreasuryState);
  return next as TreasuryState;
}
export function createTreasuryRepository(storage: () => StoragePort): TreasuryRepository {
  let queue = Promise.resolve();
  async function readSnapshot() {
    try { const raw=storage().getItem(TREASURY_KEY); const state=raw === null ? emptyState() : migrateTreasuryState(JSON.parse(raw)); return { raw, state }; }
    catch { throw new Error('No se puede leer Tesorería: almacenamiento no disponible o datos inválidos. Los datos se conservan intactos.'); }
  }
  async function read(): Promise<TreasuryState> { return (await readSnapshot()).state; }
  return {
    read,
    async transact(work) {
      const commit = async () => {
        const {state,raw}=await readSnapshot(); const before=JSON.stringify(state);
        const result=await work(state);
        validateState(state);
        const after=JSON.stringify(state);
        if (before !== after) {
          // Additional stale-snapshot guard; Web Locks below is the cross-tab lock
          // where supported. This check alone is not an atomic compare-and-set.
          let current: string | null;
          try { current=storage().getItem(TREASURY_KEY); }
          catch { throw new Error('No se pudo volver a comprobar Tesorería antes de guardar. Conserva el formulario y reintenta.'); }
          if(current!==raw) throw new Error('Tesorería cambió en otra ventana. No se guardó esta operación. Revisa el saldo actualizado y reintenta.');
          try { storage().setItem(TREASURY_KEY,after); }
          catch { throw new Error('No se pudo guardar Tesorería: almacenamiento lleno o no disponible. Conserva el formulario y reintenta con el mismo identificador para verificar el resultado sin duplicar la operación.'); }
        }
        return result;
      };
      if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(TREASURY_KEY,commit);
      const task=queue.then(commit);queue=task.then(()=>undefined,()=>undefined);return task;
    },
    async accounts(q) { return queryAccounts(await read(),q); },
    async operations(q) { return queryOperations(await read(),q); },
    async movements(q) { return queryMovements(await read(),q); },
  };
}
export const treasuryRepository = createTreasuryRepository(()=>window.localStorage);
