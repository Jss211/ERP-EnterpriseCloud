import { AccountIdentity } from './AccountIdentity';
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ListFilter } from 'lucide-react';
import type { Query } from './types';
import { treasuryService } from './runtime';
import { useTreasuryLoad } from './useTreasuryLoad';
import { FinancialDetail } from './FinancialDetail';
import { Loading, TreasuryError, TreasuryHeader } from './TreasuryUI';
import { MovementFilters, MovementList } from './MovementWorkspace';
import { button } from './styles';

export function CashBankMovementsPage() {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState('');
  const query = useMemo<Query>(() => {
    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    return {
      page: Number.isSafeInteger(page) && page > 0 ? page : 1,
      pageSize: [10, 25, 50].includes(pageSize) ? pageSize : 10,
      search: params.get('search') || '', accountId: params.get('accountId') || '',
      from: params.get('from') || '', to: params.get('to') || '',
      kind: params.get('kind') || '', currency: params.get('currency') || '',
    };
  }, [params]);
  const patch = (changes: Partial<Query>) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries({ ...changes, page: changes.page ?? 1 })) {
        if (value === '' || value === undefined || (key === 'page' && value === 1)) next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    });
  };
  const reload = () => setRevision(n => n + 1);
  const resource = useTreasuryLoad(useCallback(() => treasuryService.workspace(query), [query]), revision);
  const account = resource.data?.state.accounts.find(a => a.id === query.accountId);
  const invalid = !!(query.from && query.to && query.from > query.to);

  return <section className="min-w-0 space-y-4 text-slate-800 dark:text-slate-100">
    <Link className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400" to="/caja-bancos"><ArrowLeft size={16} aria-hidden="true"/>Volver a Caja/Bancos</Link>
    <TreasuryHeader title="Movimientos de Caja/Bancos" description="Consulta los ingresos, egresos y reversiones registrados."/>
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="flex min-w-0 items-center gap-2 font-semibold"><ListFilter size={18} className="shrink-0 text-teal-600 dark:text-teal-300" aria-hidden="true"/><span className="break-words">{query.accountId ? account ? `${account.name} · ${account.currency}` : resource.loading ? 'Cargando cuenta seleccionada…' : resource.error ? 'Cuenta seleccionada' : 'Cuenta no disponible' : 'Todas las cuentas'}</span></h2>
      {query.accountId && <button className={button} onClick={() => patch({ accountId: '' })}>Ver todas las cuentas</button>}
    </div>
    {account&&<AccountIdentity account={account}/>}
    <MovementFilters query={query} data={resource.data} patch={patch} reset={() => { setParams(query.pageSize === 10 ? {} : { pageSize: String(query.pageSize) }); reload(); }}/>
    {invalid && <p role="alert" className="text-amber-700 dark:text-amber-300">La fecha inicial no puede superar la final.</p>}
    {resource.loading ? <Loading/> : resource.error ? <TreasuryError error={resource.error} retry={reload}/> : resource.data && !invalid && <MovementList query={query} data={resource.data} patch={patch} onDetail={setDetail}/>}
    {detail && <FinancialDetail operationId={detail} onClose={() => setDetail('')} onChange={reload}/>}
  </section>;
}
