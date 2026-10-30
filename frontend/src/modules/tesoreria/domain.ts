import type { Currency, MoneyOperation, Movement, Obligation, ObligationSource, Page, Query, TreasuryState } from './types';
import { addMinor, money } from './money';
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
export function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export const text = (s: unknown) => typeof s === 'string';
const id = (s: unknown) => text(s) && !!String(s).trim();
const cents = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n);
const currency = (c: unknown) => c === 'PEN' || c === 'USD';
export const emptyState = (): TreasuryState => ({ version: 2, accounts: [], operations: [], applications: [], movements: [], locks: [] });
export const lockFingerprint = (s: ObligationSource) => JSON.stringify([s.id,s.kind,s.sourceId,s.partyId || s.partyName,s.partyDocument||'',s.currency,s.originalMinor,s.historicalPaidMinor,s.cancelled]);
export const operationIdentity = (o: MoneyOperation) => JSON.stringify([o.id,o.kind,o.obligationId || '',o.accountId,o.targetAccountId || '',o.amountMinor,o.currency,o.date,o.method,o.reference,o.notes]);
export function operationMovements(op: MoneyOperation): Movement[] {
  const first: Movement = { id: `${op.id}:movement:1`, operationId: op.id, accountId: op.accountId, currency: op.currency, date: op.date, direction: op.kind === 'COBRO' ? 'INGRESO' : 'EGRESO', amountMinor: op.amountMinor };
  const originals = op.kind === 'TRANSFERENCIA' ? [first, { ...first, id: `${op.id}:movement:2`, accountId: op.targetAccountId!, direction: 'INGRESO' as const }] : [first];
  return op.cancellation ? [...originals, ...originals.map(m => ({ ...m, id: `${m.id}:reversal`, reversalId: op.cancellation!.id, date: op.cancellation!.date, direction: m.direction === 'INGRESO' ? 'EGRESO' as const : 'INGRESO' as const }))] : originals;
}
export function paidFor(state: TreasuryState, source: ObligationSource) {
  return state.applications.filter(a => a.obligationId === source.id && !state.operations.find(o => o.id === a.operationId)!.cancellation).reduce((sum,a) => addMinor(sum,a.amountMinor), source.historicalPaidMinor);
}
export function accountBalance(state: TreasuryState, accountId: string) {
  const account = state.accounts.find(a => a.id === accountId);
  requireThat(account, 'Cuenta no disponible.');
  return state.movements.filter(m => m.accountId === accountId).reduce((sum,m) => addMinor(sum,m.direction === 'INGRESO' ? m.amountMinor : -m.amountMinor),account.openingMinor);
}
export const fundsMoney = (amount: number, currency: Currency) => money(amount, currency).replace(/^PEN /, 'S/ ').replace(/^USD /, 'US$ ');

// Balance and affordability always use integer minor units, including reversals.
// Eligibility (active account/date) is checked separately for new operations;
// corrections to an inactive account must remain possible.
export function requireFunds(state: TreasuryState, accountId: string, requestedMinor: number, currency: Currency) {
  const account = state.accounts.find(a => a.id === accountId);
  requireThat(account && account.currency === currency, 'La cuenta de origen debe tener la misma moneda.');
  requireThat(cents(requestedMinor) && requestedMinor > 0, 'Ingresa un importe positivo válido.');
  const availableMinor = accountBalance(state, accountId);
  requireThat(availableMinor > 0 && requestedMinor <= availableMinor,
    `Saldo insuficiente. Disponible: ${fundsMoney(availableMinor, currency)}. Importe solicitado: ${fundsMoney(requestedMinor, currency)}`);
  return availableMinor;
}

export function requireCancellationFunds(state: TreasuryState, operation: MoneyOperation) {
  if (operation.cancellation || operation.kind === 'PAGO') return;
  // Undoing a receipt debits its account; undoing a transfer debits its destination.
  const accountId = operation.kind === 'TRANSFERENCIA' ? operation.targetAccountId! : operation.accountId;
  try { requireFunds(state, accountId, operation.amountMinor, operation.currency); }
  catch (error) {
    const name = state.accounts.find(a => a.id === accountId)?.name || 'Cuenta no disponible';
    throw new Error(`No se puede anular: la reversión retiraría fondos de «${name}». ${error instanceof Error ? error.message : 'No se pudo comprobar el saldo.'} El ingreso puede haberse utilizado en pagos o transferencias posteriores, o existir un saldo negativo previo. Revisa el historial y corrige primero los egresos equivocados mediante sus anulaciones. No se ha anulado esta operación.`);
  }
}
export function obligations(state: TreasuryState, sources: ObligationSource[], kind: ObligationSource['kind'], date = today()): Obligation[] {
  const all = [...sources, ...state.locks.filter(l => l.kind === kind && !sources.some(s => s.id === l.id))];
  return all.map(current => {
    const frozen = state.locks.find(l => l.id === current.id);
    const live = sources.find(s => s.id === current.id);
    const source = frozen && (!live || lockFingerprint(frozen) !== lockFingerprint(live)) ? frozen : current;
    const blockedReason = !live ? 'El documento de origen ya no está disponible. Se conserva el historial; no se admiten nuevas aplicaciones.' : frozen && lockFingerprint(frozen) !== lockFingerprint(live) ? 'El origen cambió de proveedor/cliente, moneda, importe o evidencia histórica. Operación bloqueada: revisa el documento original antes de aplicar más dinero.' : current.cancelled ? 'El documento de origen está anulado.' : undefined;
    const paidMinor = paidFor(state,source);
    const balanceMinor = addMinor(source.originalMinor,-paidMinor);
    return { ...source, paidMinor, balanceMinor, paymentStatus: balanceMinor === 0 ? 'PAGADA' as const : paidMinor ? 'PARCIAL' as const : 'PENDIENTE' as const, overdue: !!source.dueAt && source.dueAt < date && balanceMinor > 0, blockedReason };
  });
}
export function paginate<T>(items: T[], q: Query): Page<T> {
  const size = Math.max(1,Math.min(100,Math.trunc(q.pageSize)||10));
  const start = (Math.max(1,Math.trunc(q.page)||1)-1)*size;
  return { items: items.slice(start,start+size), total: items.length };
}
export const matches = (value: string, search = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').includes(search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es'));
export const dateMatches = (date: string | undefined, q: Query) => (!q.from || (!!date && date >= q.from)) && (!q.to || (!!date && date <= q.to));
export const queryAccounts = (state: TreasuryState,q: Query) => paginate(state.accounts.filter(a=>matches(`${a.code} ${a.name}`,q.search)&&(!q.currency||a.currency===q.currency)&&(!q.status||(q.status==='ACTIVA')===a.active)),q);
export const queryOperations = (state: TreasuryState,q: Query) => paginate(state.operations.filter(o=>matches(`${o.id} ${o.reference} ${o.notes}`,q.search)&&dateMatches(o.date,q)&&(!q.kind||o.kind===q.kind)&&(!q.currency||o.currency===q.currency)&&(!q.accountId||o.accountId===q.accountId||o.targetAccountId===q.accountId)&&(!q.obligationId||o.obligationId===q.obligationId)&&(!q.status||(q.status==='ANULADA')===!!o.cancellation)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),q);
export const queryMovements = (state: TreasuryState,q: Query) => paginate(state.movements.filter(m=>matches(`${m.id} ${m.operationId}`,q.search)&&dateMatches(m.date,q)&&(!q.accountId||m.accountId===q.accountId)&&(!q.kind||m.direction===q.kind)&&(!q.currency||m.currency===q.currency)).sort((a,b)=>b.date.localeCompare(a.date)),q);
export const queryObligations = (rows: Obligation[],q: Query) => paginate(rows.filter(o=>matches(`${o.document} ${o.partyName} ${o.partyId||''} ${o.partyDocument||''} ${o.id} ${o.description}`,q.search)&&dateMatches(o.issuedAt,q)&&(!q.currency||o.currency===q.currency)&&(!q.status||o.paymentStatus===q.status)),q);
export function validateSource(s: ObligationSource) {
  requireThat([s?.partyDocument,s?.legacyNote,s?.legacyMethod].every(value=>value===undefined||text(value)),'Los datos históricos del documento no son válidos.');
  requireThat(s && id(s.id) && id(s.sourceId) && text(s.document) && text(s.documentType) && text(s.partyName) && (s.partyId === undefined || id(s.partyId)) && ['COBRAR','PAGAR'].includes(s.kind) && currency(s.currency) && cents(s.originalMinor) && s.originalMinor >= 0 && cents(s.historicalPaidMinor) && s.historicalPaidMinor >= 0 && s.historicalPaidMinor <= s.originalMinor && typeof s.cancelled === 'boolean' && text(s.description) && (s.issuedAt === undefined || validDate(s.issuedAt)) && (s.dueAt === undefined || validDate(s.dueAt)), 'Un documento tiene referencias o importes inválidos.');
}
export function validateState(state: TreasuryState) {
  requireThat(state?.version === 2 && ['accounts','operations','applications','movements','locks'].every(k => Array.isArray(state[k as keyof TreasuryState])), 'Formato de Tesorería no compatible.');
  for (const collection of [state.accounts,state.operations,state.applications,state.movements,state.locks]) requireThat(new Set(collection.map(r=>r?.id)).size === collection.length && collection.every(r=>r && id(r.id)), 'Identificadores duplicados o inválidos.');
  requireThat(new Set(state.accounts.map(a=>a.code.toLocaleUpperCase())).size === state.accounts.length,'Códigos de cuenta duplicados.');
  for (const a of state.accounts) requireThat(id(a.code) && id(a.name) && ['CAJA','BANCO'].includes(a.type) && currency(a.currency) && cents(a.openingMinor) && validDate(a.openedAt) && typeof a.active === 'boolean' && text(a.bankName) && text(a.bankNumber) && Number.isSafeInteger(a.revision) && a.revision >= 0,'Cuenta inválida.');
  state.locks.forEach(validateSource);
  for (const a of state.accounts) requireThat([a.holderName, a.responsibleName].every(value => value === undefined || (text(value) && value.length <= 200)), 'El titular o responsable de la cuenta no es válido.');
  const cancellations = state.operations.filter(o=>o.cancellation).map(o=>o.cancellation!.id);
  requireThat(new Set(cancellations).size === cancellations.length,'Identificadores de reversión duplicados.');
  for (const op of state.operations) {
    const account = state.accounts.find(a=>a.id===op.accountId);
    const target = state.accounts.find(a=>a.id===op.targetAccountId);
    const source = state.locks.find(l=>l.id===op.obligationId);
    requireThat(['COBRO','PAGO','TRANSFERENCIA'].includes(op.kind) && account && account.currency === op.currency && cents(op.amountMinor) && op.amountMinor > 0 && validDate(op.date) && op.date >= account.openedAt && id(op.method) && text(op.reference) && op.reference.length<=300 && text(op.notes) && op.notes.length<=4000 && Number.isFinite(Date.parse(op.createdAt)), 'Operación financiera inválida.');
    if (op.kind === 'TRANSFERENCIA') requireThat(!op.obligationId && target && target.id !== account.id && target.currency === op.currency && op.date >= target.openedAt, 'Transferencia inválida.');
    else requireThat(!op.targetAccountId && source && source.currency === op.currency && source.kind === (op.kind === 'COBRO' ? 'COBRAR' : 'PAGAR'), 'Aplicación sin documento compatible.');
    if (op.cancellation) requireThat(id(op.cancellation.id) && id(op.cancellation.reason) && validDate(op.cancellation.date) && op.cancellation.date >= op.date && Number.isFinite(Date.parse(op.cancellation.createdAt)), 'Anulación inválida.');
    const applications = state.applications.filter(a=>a.operationId===op.id);
    requireThat(op.kind === 'TRANSFERENCIA' ? !applications.length : applications.length === 1 && applications[0].id === `${op.id}:application` && applications[0].obligationId === op.obligationId && applications[0].amountMinor === op.amountMinor, 'Aplicaciones de dinero inconsistentes.');
  }
  requireThat(state.applications.every(a=>state.operations.some(o=>o.id===a.operationId)),'Aplicación huérfana.');
  const expected = state.operations.flatMap(operationMovements);
  const movementKey = (m: Movement) => JSON.stringify([m.id,m.accountId,m.operationId,m.reversalId||'',m.currency,m.date,m.direction,m.amountMinor]);
  requireThat(expected.length === state.movements.length && state.movements.every(m=>expected.some(e=>movementKey(e)===movementKey(m))), 'Movimientos duplicados, ausentes o sin origen verificable.');
  for (const lock of state.locks) { const paid=paidFor(state,lock); requireThat(paid >= 0 && paid <= lock.originalMinor,'Las aplicaciones exceden el documento.'); }
  state.accounts.forEach(a=>accountBalance(state,a.id));
}
