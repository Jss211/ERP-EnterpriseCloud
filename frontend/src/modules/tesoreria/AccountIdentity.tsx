import type { MoneyAccount, TreasuryState } from './types';
import { accountBalance, fundsMoney } from './domain';
import { minor } from './money';

export function AccountIdentity({account}: {account: MoneyAccount}) {
  return <div className="mt-2 space-y-1 break-words text-xs text-slate-500 dark:text-slate-400"><p>Empresa / titular: <span className="font-medium text-slate-700 dark:text-slate-200">{account.holderName?.trim()||'Titular no especificado'}</span></p>{account.responsibleName&&<p>Responsable interno: {account.responsibleName}</p>}</div>;
}

export function FundsSummary({state,accountId,amount}: {state:TreasuryState;accountId:string;amount:string}) {
  const account=state.accounts.find(a=>a.id===accountId);
  if(!account) return null;
  const available=accountBalance(state,account.id);
  let requested: number | undefined;
  try { if(amount.trim()) requested=minor(amount); } catch { /* The amount input reports invalid formats when reviewed. */ }
  return <div className="rounded-xl border border-slate-200 p-4 text-sm sm:col-span-2 dark:border-slate-700">
    <p className="font-semibold">Cuenta de origen: {account.name}</p><AccountIdentity account={account}/>
    <dl className="mt-3 grid gap-3 sm:grid-cols-3"><div><dt className="text-xs text-slate-500 dark:text-slate-400">Moneda</dt><dd>{account.currency} · {account.active?'Activa':'Inactiva'}</dd></div><div><dt className="text-xs text-slate-500 dark:text-slate-400">Saldo disponible</dt><dd className={`font-semibold tabular-nums ${available<=0?'text-red-700 dark:text-red-300':''}`}>{fundsMoney(available,account.currency)}</dd></div><div><dt className="text-xs text-slate-500 dark:text-slate-400">Importe solicitado</dt><dd className="tabular-nums">{requested===undefined?'Ingresa el importe':fundsMoney(requested,account.currency)}</dd></div></dl>
    {available<=0&&<p className="mt-2 text-xs text-red-700 dark:text-red-300">Esta cuenta no tiene fondos disponibles para nuevos pagos o transferencias.</p>}
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">El saldo se vuelve a comprobar al guardar.</p>
  </div>;
}
