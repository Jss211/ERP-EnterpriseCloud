import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');const dir=resolve(root,'node_modules/.tmp/logistics-unit');await mkdir(dir,{recursive:true});
for(const name of ['domain','localRepository','service','sourceRepository','return-sourceMapping']) {
  const path=name==='return-sourceMapping'?'src/modules/ventas/devoluciones/sourceMapping.ts':`src/modules/logistica/${name}.ts`;
  let output=ts.transpileModule(await readFile(resolve(root,path),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  output=output.replaceAll("'./domain'","'./domain.mjs'").replaceAll("'../ventas/devoluciones/sourceMapping'","'./return-sourceMapping.mjs'");
  for(const dependency of ['../../services/ventasService','../../services/clientesService','../../services/inventarioService','../../repositories/legacyCatalogRepository'])output=output.replaceAll(`'${dependency}'`,"'./sourceFixture.mjs'");
  await writeFile(resolve(dir,name+'.mjs'),output);
}
await writeFile(resolve(dir,'sourceFixture.mjs'),`export const ventasService={getVentas:async(strict,financial,all)=>{if(!strict||financial||!all)throw Error('strict all-pages read required');return globalThis.fixture.sales;}};export const clientesService={getClientes:async(strict)=>{if(!strict)throw Error('strict customer read required');return globalThis.fixture.customers;}};export const inventarioService={getCatalogosBase:async(strict)=>{if(!strict)throw Error('strict catalog read required');return {almacenes:globalThis.fixture.warehouses};}};export const legacyCatalogRepository={list:async()=>globalThis.fixture.catalogs,listStrict:async()=>globalThis.fixture.catalogs};`);
const load=name=>import(pathToFileURL(resolve(dir,name+'.mjs')));
const {createLogisticsRepository,LOGISTICS_KEY}=await load('localRepository');const {createLogisticsService}=await load('service');
const {units,quantity,calendarDay,emptyState,validateState,deliveryView,pendingForSale,paginate}=await load('domain');
Object.defineProperty(globalThis,'navigator',{value:undefined,configurable:true});
assert.equal(calendarDay('2026-10-29T02:00:00Z'),'2026-10-28','delivery dates use the Lima business day');
assert.equal(units('0.1')+units('0.2'),units('0.3'));assert.equal(units('1,123456'),1123456);assert.equal(quantity(1000000),'1');
for(const invalid of ['-1','NaN','1.0000001','1e5','999999999999999999'])assert.throws(()=>units(invalid));
const source=(id='sale-1')=>({key:'ventas:'+id,id,origin:'ventas',number:'OV-'+id,date:'2026-10-01',customer:{id:'customer-1',name:'Cliente histórico',document:'20111111111',address:'Destino original',contact:'Contacto original'},documents:[{number:'F001-1',origin:'venta'}],lines:[{id:'line-1',description:'Producto con nombre compartido',orderedUnits:units('10')},{id:'line-2',description:'Producto con nombre compartido',orderedUnits:units('5')}]});
const carrier={id:'carrier-1',document:'20999999999',name:'Transportista existente',phone:'555555',active:true,vehicle:{model:'Modelo registrado',plate:'PLACA-REAL'},driver:{name:'Conductor registrado',license:'LIC-REAL'}};
const clock=()=> '2026-10-28T15:00:00Z';
function harness(){
  const port={raw:null,writes:0,quota:false,ack:false};let sales=[source()];let carriers=[structuredClone(carrier)];
  const storage=()=>({getItem:key=>{assert.equal(key,LOGISTICS_KEY);return port.raw;},setItem:(key,value)=>{assert.equal(key,LOGISTICS_KEY);if(port.quota)throw Error('quota');port.raw=value;port.writes++;if(port.ack)throw Error('ack lost');}});
  const repo=createLogisticsRepository(storage);
  const sources={sales:async q=>paginate(sales,q),sale:async key=>structuredClone(sales.find(s=>s.key===key)),carriers:async q=>paginate(carriers,q),carrier:async id=>structuredClone(carriers.find(c=>c.id===id)),warehouses:async()=>[{id:'warehouse-1',name:'Almacén real'}]};
  const service=createLogisticsService(repo,sources,clock);
  const unchanged=async(work,pattern)=>{const before=port.raw,writes=port.writes;await assert.rejects(work,pattern);assert.equal(port.raw,before);assert.equal(port.writes,writes);};
  return {port,repo,service,sources,storage,unchanged,setSales:value=>{sales=value;},setCarriers:value=>{carriers=value;}};
}
const draft=(id,amount='6',more={})=>({id,saleKey:'ventas:sale-1',lines:[{saleLineId:'line-1',quantityUnits:units(amount)}],address:'Dirección histórica',contact:'Receptor de referencia',scheduledDate:'2026-10-28',warehouseId:'warehouse-1',carrierId:'carrier-1',notes:'Observación original',...more});
async function change(h,d,to,cmd=to+'-'+d.id,reason='Cambio de prueba'){return h.service.changeDispatch(d.id,to,d.revision,reason,cmd);}
async function sent(h,id,amount='6'){let d=await h.service.saveDispatch(draft(id,amount),'create-'+id);d=await change(h,d,'PREPARADO');return change(h,d,'DESPACHADO');}
const attempt=(d,id,amount,outcome='ENTREGA')=>({id,dispatchId:d.id,date:'2026-10-28',receiver:outcome==='ENTREGA'?'Persona receptora':'',outcome,incidents:outcome==='ENTREGA'?'':'Cliente ausente',lines:[{dispatchLineId:d.lines[0].id,quantityUnits:units(amount)}]});

{
  const h=harness();assert.deepEqual(await h.service.state(),emptyState());assert.equal(h.port.raw,null,'reading never initializes examples');
  let d=await h.service.saveDispatch(draft('d1'),'create-d1');assert.equal(pendingForSale(await h.service.state(),source())[0].pendingUnits,units('4'));
  const d2=await h.service.saveDispatch(draft('d2','4'),'create-d2');
  await h.unchanged(h.service.saveDispatch(draft('over','0.000001'),'over'),/supera/);
  await h.unchanged(h.service.saveDispatch(draft('names','1',{lines:[{saleLineId:'Producto con nombre compartido',quantityUnits:units('1')}]}),'names'),/no es válida/);
  await h.unchanged(h.service.saveDispatch(draft('duplicate','1',{lines:[{saleLineId:'line-1',quantityUnits:units('1')},{saleLineId:'line-1',quantityUnits:units('1')}]}),'duplicate'),/distintas/);
  await h.unchanged(change(h,d,'DESPACHADO'),/no está permitida/);
  d=await change(h,d,'PREPARADO');await h.unchanged(change(h,d,'CANCELADO','no-reason',''),/motivo/);
  d=await change(h,d,'CANCELADO');assert.equal(pendingForSale(await h.service.state(),source())[0].pendingUnits,units('6'));
  const next=await h.service.saveDispatch(draft('d3','6'),'create-d3');assert.equal(next.status,'BORRADOR');
  assert.equal((await h.service.state()).dispatches.length,3,'cancelled records remain stored');assert.equal(d2.source.customer.name,'Cliente histórico');
  await h.unchanged(h.service.saveDispatch({...draft('d3','6'),expectedRevision:999},'stale-edit'),/revisión/);
}
{
  const h=harness();const total=await sent(h,'total','10');assert.equal(total.status,'DESPACHADO');
  await h.unchanged(change(h,total,'CANCELADO'),/no está permitida/);
  const first=attempt(total,'first','3');const before=h.port.writes;
  await Promise.all([h.service.registerDelivery(first,'attempt-first'),h.service.registerDelivery(first,'attempt-first')]);assert.equal(h.port.writes,before+1);
  assert.equal(deliveryView(await h.service.state(),total).status,'PARCIAL');
  await h.service.registerDelivery(attempt(total,'failed','0','FALLIDA'),'failed');await h.service.registerDelivery(attempt(total,'rejected','0','RECHAZADA'),'rejected');
  await h.unchanged(h.service.registerDelivery(attempt(total,'too-much','7.000001'),'too-much'),/supera/);
  await h.unchanged(h.service.registerDelivery(attempt(total,'bad-failed','1','FALLIDA'),'bad-failed'),/cantidades cero/);
  await h.unchanged(h.service.registerDelivery({...attempt(total,'too-early','1'),date:'2026-10-27'},'too-early'),/fecha/);
  await h.unchanged(h.service.registerDelivery({...first,receiver:'Otro'},'attempt-first'),/otros datos/);
  await h.service.registerDelivery(attempt(total,'remaining','7'),'remaining');
  const state=await h.service.state();assert.equal(deliveryView(state,total).status,'ENTREGADO');assert.equal(state.deliveries.length,4);assert.equal(state.dispatches.length,1);
  await h.unchanged(h.service.registerDelivery(attempt(total,'after-complete','0','FALLIDA'),'after-complete'),/completamente/);
  await h.service.registerDelivery(first,'attempt-first');assert.equal((await h.service.state()).deliveries.length,4,'retry after total delivery remains idempotent');
}
{
  const h=harness();let a=await h.service.saveDispatch(draft('a','4'),'create-a');let b=await h.service.saveDispatch(draft('b','6'),'create-b');
  const input={id:'route',code:'R-001',name:'Ruta manual',date:'2026-10-28',responsible:'Responsable existente',dispatchIds:[a.id,b.id]};
  let r=await h.service.saveRoute(input,'route-create');assert.deepEqual(r.stops.map(s=>s.dispatchId),['a','b']);
  await h.unchanged(h.service.saveRoute({...input,id:'other',code:'R-002'},'other-route'),/ya está asignado/);
  await h.unchanged(change(h,a,'CANCELADO'),/Retira primero/);
  await h.unchanged(h.service.saveDispatch({...draft('a','4'),expectedRevision:0,address:'Cambiar destino'},'assigned-edit'),/Retira primero/);
  r=await h.service.saveRoute({...input,expectedRevision:r.revision,dispatchIds:[b.id,a.id]},'reorder');assert.deepEqual(r.stops.map(s=>s.dispatchId),['b','a']);assert.equal(r.stops[1].id,'route:stop:a');
  await h.unchanged(h.service.changeRoute(r.id,'EN_CURSO',r.revision,'','start-early'),/deben estar enviados/);
  a=await change(h,a,'PREPARADO');b=await change(h,b,'PREPARADO');a=await change(h,a,'DESPACHADO');b=await change(h,b,'DESPACHADO');
  r=await h.service.changeRoute(r.id,'EN_CURSO',r.revision,'','start');
  await h.unchanged(h.service.changeRoute(r.id,'FINALIZADA',r.revision,'','finish-early'),/cantidades/);
  await h.unchanged(h.service.saveRoute({...input,expectedRevision:r.revision},'edit-running'),/planificada/);
  await h.service.registerDelivery(attempt(a,'a-delivery','4'),'a-delivery');await h.service.registerDelivery(attempt(b,'b-delivery','6'),'b-delivery');
  r=await h.service.changeRoute(r.id,'FINALIZADA',r.revision,'','finish');assert.equal(r.status,'FINALIZADA');
  const writes=h.port.writes;await h.service.changeRoute(r.id,'FINALIZADA',r.revision-1,'','finish');assert.equal(h.port.writes,writes);
  await h.unchanged(h.service.saveRoute({...input,id:'reuse-delivered',code:'R-003'},'reuse-delivered'),/no está disponible/);
}
{
  const h=harness();let d=await h.service.saveDispatch(draft('cancel-route'),'cancel-route-dispatch');d=await change(h,d,'PREPARADO');
  let r=await h.service.saveRoute({id:'plan',code:'R',name:'Plan',date:'2026-10-28',responsible:'Responsable',dispatchIds:[d.id]},'plan');
  r=await h.service.changeRoute(r.id,'CANCELADA',r.revision,'Cambio de planificación','cancel-plan');d=await change(h,d,'CANCELADO');
  assert.equal((await h.service.state()).routes[0].status,'CANCELADA');assert.equal((await h.service.state()).dispatches[0].status,'CANCELADO');
}
{
  const h=harness();const d=await h.service.saveDispatch(draft('historical'),'historical');const altered=source();altered.customer.name='Nombre actualizado';altered.customer.address='Otra dirección';h.setSales([altered]);
  await change(h,d,'PREPARADO');assert.equal((await h.service.state()).dispatches[0].source.customer.name,'Cliente histórico');
  altered.lines[0].orderedUnits=units('11');h.setSales([altered]);const current=(await h.service.state()).dispatches[0];
  await h.unchanged(change(h,current,'DESPACHADO'),/cambiaron/);await h.unchanged(h.service.saveDispatch(draft('changed','1'),'changed'),/cambiaron/);
  h.setSales([]);await h.unchanged(change(h,current,'DESPACHADO'),/no está disponible/);await change(h,current,'CANCELADO');
  const legacy=source();legacy.lines[0].id='';legacy.limitation='Referencias insuficientes';h.setSales([legacy]);await h.unchanged(h.service.saveDispatch(draft('legacy'),'legacy'),/Referencias insuficientes/);
}
{
  const h=harness();h.setCarriers([{...carrier,active:false}]);await h.unchanged(h.service.saveDispatch(draft('inactive'),'inactive'),/transportista activo/);
  const d=await h.service.saveDispatch(draft('no-carrier','2',{carrierId:''}),'no-carrier');await h.unchanged(change(h,d,'PREPARADO'),/Asigna/);
  h.setCarriers([carrier]);const edited=await h.service.saveDispatch({...draft(d.id,'2'),expectedRevision:d.revision},'assign-carrier');
  h.setCarriers([{...carrier,vehicle:{...carrier.vehicle,plate:'OTRA'}}]);await h.unchanged(change(h,edited,'PREPARADO'),/datos cambiaron/);
}
{
  const h=harness();h.port.quota=true;await h.unchanged(h.service.saveDispatch(draft('quota'),'quota'),/No se pudo guardar/);h.port.quota=false;
  const d=await h.service.saveDispatch(draft('quota'),'quota');assert.equal((await h.service.state()).commands.length,1);
  h.port.quota=true;await h.unchanged(change(h,d,'PREPARADO','quota-prepare'),/No se pudo guardar/);h.port.quota=false;
  const prepared=await change(h,d,'PREPARADO','quota-prepare');const dispatched=await change(h,prepared,'DESPACHADO');
  h.port.quota=true;await h.unchanged(h.service.registerDelivery(attempt(dispatched,'quota-attempt','1'),'quota-attempt'),/No se pudo guardar/);h.port.quota=false;
  h.port.ack=true;await assert.rejects(h.service.registerDelivery(attempt(dispatched,'ack-attempt','1'),'ack-attempt'),/No se pudo guardar/);h.port.ack=false;const writes=h.port.writes;
  await h.service.registerDelivery(attempt(dispatched,'ack-attempt','1'),'ack-attempt');assert.equal(h.port.writes,writes);
  const reloaded=createLogisticsService(createLogisticsRepository(h.storage),h.sources,clock);assert.equal((await reloaded.state()).deliveries.length,1);
  const healthy=h.port.raw;
  for(const invalid of ['{broken',JSON.stringify({version:999}),JSON.stringify({...JSON.parse(healthy),dispatches:[]}),JSON.stringify({...JSON.parse(healthy),deliveries:[...JSON.parse(healthy).deliveries,...JSON.parse(healthy).deliveries]})]){h.port.raw=invalid;await h.unchanged(h.service.saveDispatch(draft('blocked'),'blocked'),/intactos/);}
  h.port.raw=healthy;validateState(await h.service.state());
}
{
  const h=harness();const same=draft('same','6');const before=h.port.writes;await Promise.all([h.service.saveDispatch(same,'same'),h.service.saveDispatch(same,'same')]);assert.equal(h.port.writes,before+1);
  const race=await Promise.allSettled([h.service.saveDispatch(draft('race-a','3'),'race-a'),h.service.saveDispatch(draft('race-b','3'),'race-b')]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  const h2=harness();let release,started;const wait=new Promise(r=>{release=r;});const ready=new Promise(r=>{started=r;});
  const stale=createLogisticsService(createLogisticsRepository(h2.storage),{...h2.sources,sale:async key=>{started();await wait;return h2.sources.sale(key);}},clock);
  const pending=stale.saveDispatch(draft('stale','4'),'stale');await ready;await h2.service.saveDispatch(draft('other-window','7'),'other-window');const committed=h2.port.raw;release();await assert.rejects(pending,/otra ventana/);assert.equal(h2.port.raw,committed);
}
{
  const rawByKey=new Map([['erp_ordenes_venta',JSON.stringify([{id:'OV-2026-1',cliente:'Espejo',items:[{desc:'Nombre igual',cant:10}]}])],['erp_estado_cuenta',JSON.stringify([{dbId:'sale',nro:'F001-9'}])]]);
  globalThis.localStorage={getItem:key=>rawByKey.get(key)??null,setItem:()=>{throw Error('Source writes are forbidden');}};
  globalThis.fixture={sales:[{id:'sale',numero:'F001-9',notas:'Orden de venta OV-2026-1',cliente_id:'customer',cliente_nombre:'Cliente',fecha:'2026-10-28',moneda:'PEN',estado:'Completada',items:[{id:'db-line-1',descripcion:'Nombre igual',cantidad:10,precio_unitario:1,subtotal:10},{id:'db-line-2',descripcion:'Nombre igual',cantidad:5,precio_unitario:1,subtotal:5}]}],customers:[{id:'customer',documento:'DOC',direccion:'Dirección del maestro',telefono:'Contacto del maestro'}],warehouses:[{id:'warehouse',nombre:'Almacén del maestro'}],catalogs:[]};
  const {logisticsSources}=await load('sourceRepository');const q={page:1,pageSize:10};
  const page=await logisticsSources.sales(q);assert.equal(page.total,1,'explicit original OV reference suppresses the local mirror');assert.deepEqual(page.items[0].lines.map(l=>l.id),['db-line-1','db-line-2']);assert.equal(page.items[0].lines[0].productId,undefined,'description is never matched to a product');
  assert.equal(page.items[0].customer.address,'Dirección del maestro');assert.equal((await logisticsSources.carriers(q)).total,0,'no seeded examples');
  fixture.catalogs=[{id:'transportistas',records:[{id:'carrier',ruc:'DOCUMENTO REAL',razonSocial:'Nombre real',telefono:'Contacto real',estado:'Activo',vehiculoPlaca:'PLACA REAL',vehiculoModelo:'Modelo',conductor:'Conductor',brevete:'LICENCIA REAL'}]}];
  const c=await logisticsSources.carrier('carrier');assert.equal(c.vehicle.plate,'PLACA REAL');assert.equal(c.driver.license,'LICENCIA REAL');
  fixture.sales[0].items[0].id='';const legacy=await logisticsSources.sale('ventas:sale');assert.match(legacy.limitation,/no tiene identificadores/);
  rawByKey.set('erp_estado_cuenta','{broken');await assert.rejects(logisticsSources.sales(q),/conservan intactos/);assert.equal(rawByKey.get('erp_estado_cuenta'),'{broken');
}
{
  const h=harness();const local={...source('old-order'),key:'orden-local:OV-2026-42',id:'OV-2026-42',origin:'orden-local'};h.setSales([local]);
  await h.service.saveDispatch(draft('local-before-remote','4',{saleKey:local.key}),'local-before-remote');
  const remote={...source(),orderReferences:['OV-2026-42']};h.setSales([remote]);
  await h.unchanged(h.service.saveDispatch(draft('remote-after-local','1'),'remote-after-local'),/cambiaron/);
}
console.log('PASS Logistics: partial/total dispatches, stable line reservations, cancellation release, delivery attempts, overdelivery, manual route assignment/order and state constraints, history, retries/double click, quota/acknowledgement, stale snapshots, reload/corruption and read-only canonical sources.');
