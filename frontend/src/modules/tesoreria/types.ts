export type Currency = 'PEN' | 'USD';
export type ObligationKind = 'COBRAR' | 'PAGAR';
export interface ObligationSource {
  id: string; kind: ObligationKind; sourceId: string; document: string; documentType: string;
  partyId?: string; partyName: string; partyDocument?: string; issuedAt?: string; dueAt?: string; currency: Currency;
  originalMinor: number; historicalPaidMinor: number; cancelled: boolean; description: string; legacyNote?: string; legacyMethod?: string;
}
export interface Obligation extends ObligationSource {
  paidMinor: number; balanceMinor: number; paymentStatus: 'PENDIENTE' | 'PARCIAL' | 'PAGADA'; overdue: boolean; blockedReason?: string;
}
export interface MoneyAccount {
  id: string; code: string; name: string; type: 'CAJA' | 'BANCO'; currency: Currency; active: boolean;
  openingMinor: number; openedAt: string; bankName: string; bankNumber: string; revision: number;
  holderName?: string; responsibleName?: string;
}
export type OperationKind = 'COBRO' | 'PAGO' | 'TRANSFERENCIA';
export interface MoneyOperation {
  id: string; kind: OperationKind; obligationId?: string; accountId: string; targetAccountId?: string;
  amountMinor: number; currency: Currency; date: string; method: string; reference: string; notes: string; createdAt: string;
  cancellation?: { id: string; reason: string; date: string; createdAt: string };
}
export interface Application { id: string; operationId: string; obligationId: string; amountMinor: number }
export interface Movement {
  id: string; accountId: string; operationId: string; reversalId?: string; currency: Currency; date: string;
  direction: 'INGRESO' | 'EGRESO'; amountMinor: number;
}
export interface TreasuryState {
  version: 2; accounts: MoneyAccount[]; operations: MoneyOperation[]; applications: Application[]; movements: Movement[];
  locks: ObligationSource[];
}
export interface Query {
  search?: string; from?: string; to?: string; page: number; pageSize: number;
  accountId?: string; kind?: string; currency?: string; status?: string; obligationId?: string;
}
export interface Page<T> { items: T[]; total: number }
export interface TreasuryRepository {
  read(): Promise<TreasuryState>;
  transact<T>(work: (state: TreasuryState) => Promise<T> | T): Promise<T>;
  accounts(q: Query): Promise<Page<MoneyAccount>>;
  operations(q: Query): Promise<Page<MoneyOperation>>;
  movements(q: Query): Promise<Page<Movement>>;
}
export interface ObligationSources { list(kind: ObligationKind): Promise<ObligationSource[]> }
export interface OperationInput {
  id: string; kind: OperationKind; obligationId?: string; accountId: string; targetAccountId?: string;
  amount: string; currency: Currency; date: string; method: string; reference: string; notes: string;
}
