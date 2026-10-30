// Compile and run the existing compatibility suite before the new regressions.
import './treasury-unit.mjs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const compiled=resolve(import.meta.dirname,'../node_modules/.tmp/treasury-unit');
const load=name=>import(pathToFileURL(resolve(compiled,name+'.mjs')));
const {createTreasuryService}=await load('service');
const {createTreasuryRepository,migrateTreasuryState}=await load('localRepository');
const {accountBalance,operationMovements,validateState}=await load('domain');
const source=(id,kind='PAGAR')=>({id,kind,sourceId:id,document:id,documentType:'FACTURA',partyName:'Entidad de prueba',currency:'PEN',originalMinor:100000,historicalPaidMinor:0,cancelled:false,description:''});
const documents=[source('debt'),source('other-debt'),source('receipt','COBRAR')];
const account=(id,currency='PEN',openingMinor=10000)=>({id,code:id,name:id,type:'BANCO',currency,openingMinor,openedAt:'2026-01-01',active:true,bankName:'Banco',bankNumber:'12345678'});
const payment=(id,amount='10',accountId='bank')=>({id,kind:'PAGO',obligationId:'debt',accountId,amount,currency:'PEN',date:'2026-10-28',method:'Transferencia',reference:id,notes:''});
const transfer=(id,amount='10')=>({...payment(id,amount),kind:'TRANSFERENCIA',obligationId:undefined,targetAccountId:'target'});
async function harness(opening=10000) {
  const port={raw:null,writes:0,quota:false,ackLost:false};
  const storage=()=>({getItem:()=>port.raw,setItem:(_,value)=>{if(port.quota)throw Error('quota');port.raw=value;port.writes++;if(port.ackLost)throw Error('lost acknowledgement');}});
  const repo=createTreasuryRepository(storage);
  const svc=createTreasuryService(repo,{list:async kind=>structuredClone(documents.filter(d=>d.kind===kind))});
  await svc.saveAccount(account('bank','PEN',opening));await svc.saveAccount(account('target','PEN',0));await svc.saveAccount(account('usd','USD',10000));
  const unchanged=async(work,pattern)=>{const before=port.raw,writes=port.writes;await assert.rejects(work,pattern);assert.equal(port.raw,before);assert.equal(port.writes,writes,'rejection never persists an operation, application, lock or movement');};
  return {port,repo,svc,storage,unchanged};
}

{
  const h=await harness();
  await h.unchanged(h.svc.record(payment('too-much','100.01')),/Saldo insuficiente\. Disponible: S\/ 100\.00\. Importe solicitado: S\/ 100\.01/);
  await h.svc.record(payment('less','40'));assert.equal(accountBalance(await h.svc.state(),'bank'),6000);
  const exact=payment('exact','60');await Promise.all([h.svc.record(exact),h.svc.record(exact)]);
  assert.equal(accountBalance(await h.svc.state(),'bank'),0);const writes=h.port.writes;
  await h.svc.record(exact);assert.equal(h.port.writes,writes,'retry succeeds even when its first commit exhausted funds');
  await h.unchanged(h.svc.record(payment('zero-funds','0.01')),/Disponible: S\/ 0\.00/);
  const state=await h.svc.state();assert.equal(state.operations.length,2);assert.equal(state.movements.length,2);assert.equal(state.applications.length,2);
  assert.equal((await h.svc.obligations('PAGAR',{page:1,pageSize:10})).items.find(d=>d.id==='debt').balanceMinor,90000);
}
for(const opening of [0,-1000]) {
  const h=await harness(opening);
  await h.unchanged(h.svc.record(payment('no-funds')),/Saldo insuficiente/);
  await h.unchanged(h.svc.record(transfer('no-transfer')),/Saldo insuficiente/);
  assert.equal(accountBalance(await h.svc.state(),'bank'),opening,'existing negative balance remains intact');
}
{
  const h=await harness();const bank=(await h.svc.state()).accounts.find(a=>a.id==='bank');
  await h.svc.saveAccount({...bank,active:false},bank.revision);
  await h.unchanged(h.svc.record(payment('inactive')),/cuenta activa/);
  await h.unchanged(h.svc.record({...payment('wrong-account-currency'),accountId:'usd'}),/misma moneda/);
  await h.unchanged(h.svc.record({...payment('wrong-document-currency'),accountId:'usd',currency:'USD'}),/moneda del documento/);
}
{
  const h=await harness();await h.unchanged(h.svc.record(transfer('too-large','100.01')),/Saldo insuficiente/);
  const exact=transfer('exact-transfer','100');await Promise.all([h.svc.record(exact),h.svc.record(exact)]);
  assert.equal(accountBalance(await h.svc.state(),'bank'),0);assert.equal(accountBalance(await h.svc.state(),'target'),10000);
  await h.svc.record(payment('spent-target','100','target'));
  await h.unchanged(h.svc.cancel(exact.id,'reverse-transfer','Destino incorrecto','2026-10-28'),/reversión retiraría fondos de «target».*Saldo insuficiente/);
  await h.svc.cancel('spent-target','reverse-spend','Pago equivocado','2026-10-28');
  await h.svc.cancel(exact.id,'reverse-transfer','Destino incorrecto','2026-10-28');
  const writes=h.port.writes;await h.svc.cancel(exact.id,'repeat','Reintento','2026-10-28');assert.equal(h.port.writes,writes);
  assert.equal(accountBalance(await h.svc.state(),'bank'),10000);assert.equal(accountBalance(await h.svc.state(),'target'),0);
}
{
  const h=await harness(0);const receipt={...payment('incoming','100'),kind:'COBRO',obligationId:'receipt'};
  await h.svc.record(receipt);await h.svc.record(payment('spent','60'));
  await h.unchanged(h.svc.cancel('incoming','reverse-income','Cobro equivocado','2026-10-28'),/Disponible: S\/ 40\.00.*Importe solicitado: S\/ 100\.00/);
  await h.svc.cancel('spent','reverse-spent','Pago equivocado','2026-10-28');
  const bank=(await h.svc.state()).accounts.find(a=>a.id==='bank');await h.svc.saveAccount({...bank,active:false},bank.revision);
  await h.svc.cancel('incoming','reverse-income','Cobro equivocado','2026-10-28');assert.equal(accountBalance(await h.svc.state(),'bank'),0,'funded corrections remain available for inactive accounts');
}
{
  const h=await harness();const before=h.port.raw;
  h.port.quota=true;await h.unchanged(h.svc.record(payment('quota-payment')),/No se pudo guardar/);await h.unchanged(h.svc.record(transfer('quota-transfer')),/No se pudo guardar/);assert.equal(h.port.raw,before);
  h.port.quota=false;await h.svc.record(payment('quota-payment'));
  h.port.quota=true;await h.unchanged(h.svc.cancel('quota-payment','quota-cancel','Error','2026-10-28'),/No se pudo guardar/);
  h.port.quota=false;await h.svc.cancel('quota-payment','quota-cancel','Error','2026-10-28');
  h.port.ackLost=true;await assert.rejects(h.svc.record(payment('ack-lost','100')),/No se pudo guardar/);
  h.port.ackLost=false;const writes=h.port.writes;await h.svc.record(payment('ack-lost','100'));assert.equal(h.port.writes,writes);
}
{
  const h=await harness();
  const race=await Promise.allSettled([h.svc.record(payment('race-one','70')),h.svc.record({...payment('race-two','70'),obligationId:'other-debt'})]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'different debts cannot jointly overspend one account');
  assert.match(race.find(r=>r.status==='rejected').reason.message,/Saldo insuficiente/);
  assert.equal(accountBalance(await h.svc.state(),'bank'),3000);
}
{
  const h=await harness();let started,release;
  const waiting=new Promise(resolve=>{release=resolve;});const ready=new Promise(resolve=>{started=resolve;});
  const stale=createTreasuryService(createTreasuryRepository(h.storage),{list:async()=>{started();await waiting;return documents.filter(d=>d.kind==='PAGAR');}});
  const pending=stale.record(payment('stale','70'));await ready;
  await h.svc.record({...payment('other-window','70'),obligationId:'other-debt'});
  const committed=h.port.raw;release();await assert.rejects(pending,/cambió en otra ventana/);
  assert.equal(h.port.raw,committed,'a changed snapshot cannot overwrite another window');assert.equal(accountBalance(await h.svc.state(),'bank'),3000);
}
{
  // Old negatives, operations, IDs and debt applications survive the version migration.
  const h=await harness();const oldOp={...payment('legacy-payment','15'),amountMinor:1500,createdAt:'2026-10-28T12:00:00Z'};delete oldOp.amount;
  const legacy={version:1,accounts:[{...account('bank','PEN',0),revision:0}],operations:[oldOp],applications:[{id:'legacy-payment:application',operationId:oldOp.id,obligationId:'debt',amountMinor:1500}],movements:operationMovements(oldOp),locks:[documents[0]]};
  h.port.raw=JSON.stringify(legacy);const original=h.port.raw,writes=h.port.writes;
  const migrated=await h.svc.state();assert.equal(migrated.version,2);assert.equal(migrated.accounts[0].holderName,'');assert.equal(migrated.accounts[0].responsibleName,'');
  for(const key of ['operations','applications','movements','locks'])assert.deepEqual(migrated[key],legacy[key]);
  assert.equal(accountBalance(migrated,'bank'),-1500);assert.equal(h.port.raw,original);assert.equal(h.port.writes,writes,'migration reads do not mutate storage');
  await h.unchanged(h.svc.record(payment('legacy-no-egress','1')),/Saldo insuficiente/);
  h.port.quota=true;await h.unchanged(h.svc.saveAccount({...migrated.accounts[0],holderName:'Empresa de prueba',responsibleName:'Tesorería'},0),/No se pudo guardar/);h.port.quota=false;
  await h.svc.saveAccount({...migrated.accounts[0],holderName:' Empresa de prueba ',responsibleName:' Tesorería '},0);
  const saved=await h.svc.state();assert.equal(saved.version,2);assert.equal(saved.accounts[0].holderName,'Empresa de prueba');assert.equal(saved.accounts[0].responsibleName,'Tesorería');
  assert.equal(saved.accounts[0].openingMinor,0);assert.deepEqual(saved.movements,legacy.movements);assert.equal(accountBalance(saved,'bank'),-1500);
  await h.svc.saveAccount({...account('bank','PEN',0),active:false},saved.accounts[0].revision);assert.equal((await h.svc.state()).accounts[0].holderName,'Empresa de prueba','older callers cannot silently erase ownership');
  await h.svc.cancel('legacy-payment','correct-legacy','Pago equivocado','2026-10-28');assert.equal(accountBalance(await h.svc.state(),'bank'),0);
  assert.equal((await h.svc.state()).operations.length,1,'correction retains the original operation');
  assert.throws(()=>migrateTreasuryState({...legacy,version:3}),/no compatible/);
  assert.throws(()=>migrateTreasuryState({...legacy,movements:[...legacy.movements,...legacy.movements]}),/duplicados/);
  validateState(await h.svc.state());
}
console.log('PASS funds: less/equal/greater, zero/negative/inactive/currency, funded transfers and dependent reversals, atomic failures, retries, stale snapshots, versioned legacy preservation and account identity.');
