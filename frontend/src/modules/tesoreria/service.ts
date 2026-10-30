import type { MoneyAccount, MoneyOperation, ObligationKind, ObligationSources, OperationInput, Query, TreasuryRepository } from './types';
import { accountBalance, lockFingerprint, obligations, operationIdentity, operationMovements, queryAccounts, queryMovements, queryObligations, queryOperations, requireCancellationFunds, requireFunds, requireThat, today, validDate, validateSource } from './domain';
import { addMinor, minor } from './money';
export function createTreasuryService(repository: TreasuryRepository, sources: ObligationSources) {
  async function allObligations(kind: ObligationKind) {
    const [state,rows]=await Promise.all([repository.read(),sources.list(kind)]);
    rows.forEach(validateSource);requireThat(new Set(rows.map(r=>r.id)).size===rows.length,'Hay referencias de documentos duplicadas.');
    return obligations(state,rows,kind);
  }
  return {
    state: repository.read, accounts: repository.accounts, operations: repository.operations, movements: repository.movements,
    allObligations,
    async workspace(q: Query,kind?: ObligationKind) {
      const [state,rows]=await Promise.all([repository.read(),kind?sources.list(kind):Promise.resolve([])]);
      rows.forEach(validateSource);requireThat(new Set(rows.map(r=>r.id)).size===rows.length,'Hay referencias de documentos duplicadas.');
      const documents=kind?obligations(state,rows,kind):[];
      return {state,documents,obligations:queryObligations(documents,q),accounts:queryAccounts(state,q),operations:queryOperations(state,q),movements:queryMovements(state,q)};
    },
    async obligations(kind: ObligationKind,q: Query) {
      return queryObligations(await allObligations(kind),q);
    },
    async saveAccount(account: Omit<MoneyAccount,'revision'>, expectedRevision?: number) {
      return repository.transact(state=>{
        const old=state.accounts.find(a=>a.id===account.id);
        const proposed={...account,holderName:account.holderName??old?.holderName??'',responsibleName:account.responsibleName??old?.responsibleName??''};
        if(old) {
          const identity=(a: Omit<MoneyAccount,'revision'>)=>JSON.stringify([a.id,a.code.trim(),a.name.trim(),a.type,a.currency,a.openingMinor,a.openedAt,a.active,a.bankName,a.bankNumber,a.holderName?.trim()||'',a.responsibleName?.trim()||'']);
          if(identity(old)===identity(proposed)) return old;
          requireThat(expectedRevision===old.revision,'La cuenta cambió en otra ventana. Vuelve a abrirla.');
          if(state.movements.some(m=>m.accountId===old.id)) requireThat(account.currency===old.currency&&account.openingMinor===old.openingMinor&&account.openedAt===old.openedAt&&account.type===old.type,'La moneda, tipo y apertura de una cuenta con movimientos no se pueden modificar.');
        }
        const next={...proposed,code:account.code.trim(),name:account.name.trim(),holderName:proposed.holderName.trim(),responsibleName:proposed.responsibleName.trim(),revision:old?old.revision+1:0};
        if(old) state.accounts=state.accounts.map(a=>a.id===next.id?next:a);else state.accounts.push(next);
        return next;
      });
    },
    async record(input: OperationInput) {
      const operation: MoneyOperation={id:input.id,kind:input.kind,...(input.obligationId ? {obligationId:input.obligationId} : {}),accountId:input.accountId,...(input.targetAccountId ? {targetAccountId:input.targetAccountId} : {}),amountMinor:minor(input.amount),currency:input.currency,date:input.date,method:input.method.trim(),reference:input.reference.trim(),notes:input.notes.trim(),createdAt:new Date().toISOString()};
      requireThat(input.id&&operation.amountMinor>0&&validDate(operation.date)&&operation.method&&operation.notes.length<=4000&&operation.reference.length<=300,'Revisa fecha, importe positivo, medio y observaciones.');
      return repository.transact(async state=>{
        const previous=state.operations.find(o=>o.id===operation.id);
        if(previous) { requireThat(operationIdentity(previous)===operationIdentity(operation),'El identificador ya se usó con otros datos.'); return previous; }
        const account=state.accounts.find(a=>a.id===operation.accountId);
        requireThat(account?.active&&account.currency===operation.currency&&operation.date>=account.openedAt,'Elige una cuenta activa con la misma moneda y fecha compatible con su apertura.');
        if(operation.kind==='TRANSFERENCIA') {
          const target=state.accounts.find(a=>a.id===operation.targetAccountId);
          requireThat(target?.active&&target.id!==account.id&&target.currency===operation.currency&&operation.date>=target.openedAt,'El destino debe ser otra cuenta activa de la misma moneda.');
          requireFunds(state, account.id, operation.amountMinor, operation.currency);
        } else {
          const kind=operation.kind==='COBRO'?'COBRAR':'PAGAR';
          const rows=await sources.list(kind);rows.forEach(validateSource);
          const obligation=obligations(state,rows,kind).find(o=>o.id===operation.obligationId);
          requireThat(obligation&&!obligation.blockedReason&&!obligation.cancelled,'El documento no está disponible, está anulado o cambió de datos. Actualiza y revisa el origen.');
          requireThat(obligation.currency===operation.currency,'La moneda del documento y de la operación deben coincidir.');
          requireThat(operation.amountMinor<=obligation.balanceMinor,'El importe supera el saldo pendiente del documento.');
          if(operation.kind==='PAGO') requireFunds(state, account.id, operation.amountMinor, operation.currency);
          if(!state.locks.some(l=>l.id===obligation.id)) {
            const source=rows.find(r=>r.id===obligation.id)!;state.locks.push(structuredClone(source));
          } else requireThat(lockFingerprint(state.locks.find(l=>l.id===obligation.id)!)===lockFingerprint(rows.find(r=>r.id===obligation.id)!),'El documento cambió.');
          state.applications.push({id:`${operation.id}:application`,operationId:operation.id,obligationId:obligation.id,amountMinor:operation.amountMinor});
        }
        state.operations.push(operation);state.movements.push(...operationMovements(operation));return operation;
      });
    },
    async cancel(operationId: string, commandId: string, reason: string, date = today()) {
      requireThat(commandId&&reason.trim()&&reason.length<=1000&&validDate(date),'La anulación requiere motivo, fecha válida e identificador.');
      return repository.transact(state=>{
        const operation=state.operations.find(o=>o.id===operationId);requireThat(operation,'Operación no disponible.');
        if(operation.cancellation) return operation;
        requireThat(date>=operation.date,'La fecha de reversión no puede ser anterior a la operación.');
        requireCancellationFunds(state, operation);
        operation.cancellation={id:commandId,reason:reason.trim(),date,createdAt:new Date().toISOString()};
        state.movements.push(...operationMovements(operation).filter(m=>m.reversalId));return operation;
      });
    },
    async summary() {
      const [receivableSources,payableSources,state]=await Promise.all([sources.list('COBRAR'),sources.list('PAGAR'),repository.read()]);
      [...receivableSources,...payableSources].forEach(validateSource);
      requireThat(new Set([...receivableSources,...payableSources].map(s=>s.id)).size===receivableSources.length+payableSources.length,'Hay referencias de documentos duplicadas.');
      const receivables=obligations(state,receivableSources,'COBRAR'),payables=obligations(state,payableSources,'PAGAR');
      requireThat(![...receivables,...payables].some(o=>o.blockedReason&&!o.cancelled),'Hay documentos modificados o no disponibles. Revisa sus obligaciones antes de usar el resumen.');
      return (['PEN','USD'] as const).map(currency=>({currency,
        receivable:receivables.filter(o=>o.currency===currency&&!o.cancelled).reduce((n,o)=>addMinor(n,o.balanceMinor),0),
        payable:payables.filter(o=>o.currency===currency&&!o.cancelled).reduce((n,o)=>addMinor(n,o.balanceMinor),0),
        overdue: [...receivables,...payables].filter(o=>o.currency===currency&&!o.cancelled&&o.overdue).length,
        accounts:state.accounts.filter(a=>a.currency===currency).map(a=>({...a,balanceMinor:accountBalance(state,a.id)}))}));
    },
  };
}
