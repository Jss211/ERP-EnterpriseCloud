import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { erpModules } from '../src/config/modules.ts';
import { findDuplicates } from '../src/repositories/contracts.ts';

assert.equal(erpModules.length, 12);
assert.equal(new Set(erpModules.map(module => module.id)).size, 12);
const source = [{ id: 'a', code: ' SKU ' }, { id: 'b', code: 'sku' }];
assert.deepEqual(findDuplicates(source, record => record.code), [{ key: 'sku', ids: ['a', 'b'] }]);
assert.equal(source.length, 2);
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const artifacts = resolve(root, 'node_modules/.tmp/logistics-browser');
await mkdir(artifacts, { recursive: true });
const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!existsSync(edge)) throw new Error('Set EDGE_PATH to a Chromium/Edge executable to run browser checks.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = extname(path) ? resolve(dist, '.' + path) : resolve(dist, 'index.html');
    if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = resolve(root, `node_modules/.tmp/logistics-browser/profile-${Date.now()}`);
await mkdir(profile,{recursive:true});
const child = spawn(edge, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let i = 0; i < 150; i++) {
    try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim(); if (port) break; } catch {}
    await pause(100);
  }
  assert.ok(port, 'Edge debug port is available');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const writes = [];
  let supplierFailure = false; let salesFailure = false;
  function command(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 10000);
      timeout.unref();
      pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result); }, reject: error => { clearTimeout(timeout); reject(error); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const products = [{ id: 'product-1', codigo: 'ALVA-001', descripcion: 'Bolsa de prueba local', linea: 'Bolsas', marca: 'AlvaPlast', unidad: 'UND', precio_compra: 2, precio_venta: 3, stock: 10, stock_minimo: 2, almacen: 'Central' }];
  const party = { id: 'party-1', documento: '20123456789', tipo_persona: 'JURIDICA', nombre: 'Entidad local de prueba', email: 'local@example.test', telefono: '', direccion: 'Lima', limite_credito: 100, condicion_pago: 30, estado: 'Activo', historial: [] };
  ws.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(JSON.stringify(message.error))); else request?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception?.description ?? ''));
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      if (request.url.startsWith(origin)) { await command('Fetch.continueRequest', { requestId }); return; }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) writes.push({ method: request.method, url: request.url });
      const table = new URL(request.url).pathname.split('/').pop();

      let data = [];
      if (table === 'ventas') data=[
        {id:'sale-1',numero:'OV-2026-1',notas:'Orden de venta OV-2026-1',cliente_id:'party-1',cliente_nombre:party.nombre,fecha:'2026-10-28',moneda:'PEN',estado:'Pendiente',total:15,items:[{id:'line-1',descripcion:'Bolsa de prueba local',cantidad:10,precio_unitario:1,subtotal:10},{id:'line-2',descripcion:'Otro producto',cantidad:5,precio_unitario:1,subtotal:5}]},
        {id:'sale-2',numero:'OV-2026-2',notas:'',cliente_id:'party-1',cliente_nombre:party.nombre,fecha:'2026-10-28',moneda:'PEN',estado:'Completada',total:100,items:[{id:'line-many',descripcion:'Producto de muchas entregas',cantidad:100,precio_unitario:1,subtotal:100}]},
        {id:'sale-legacy',numero:'VENTA-ANTIGUA',notas:'',cliente_id:'party-1',cliente_nombre:party.nombre,fecha:'2026-10-28',moneda:'PEN',estado:'Pendiente',total:10,items:[{descripcion:'Sin identificador de línea',cantidad:10,precio_unitario:1,subtotal:10}]}
      ];
      if(table==='ventas'&&salesFailure){await command('Fetch.fulfillRequest',{requestId,responseCode:500,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify({message:'Simulated sales read failure'})).toString('base64')});return;}
      if (table === 'productos') data = products;
      if (table === 'ordenes_compra') data = [{id:'oc-1',codigo:'OC-001',proveedor_id:'party-1',proveedor_nombre:party.nombre,moneda:'PEN',estado:'EMITIDA',items:[{id:'oc-line-1',producto_id:'product-1',producto_codigo:'ALVA-001',producto_descripcion:'Bolsa de prueba local',unidad:'UND',cantidad:20,costo_unitario:2}]},{id:'oc-2',codigo:'OC-002',proveedor_id:'party-2',proveedor_nombre:'Segundo proveedor',moneda:'USD',estado:'EMITIDA',items:[{id:'oc-line-2',producto_id:'product-1',producto_codigo:'ALVA-001',producto_descripcion:'Bolsa de prueba local',unidad:'UND',cantidad:8,costo_unitario:4}]}];
      if (table === 'clientes' || table === 'proveedores') data = [party, {...party,id:'party-2',nombre:party.nombre,documento:'20987654321'}];
      if (table === 'lineas_categorias') data = [{ id: 'cat-1', codigo: 'BOL', nombre: 'Bolsas' }];
      if (table === 'almacenes') data = [{ id: 'alm-1', codigo: 'ALM', nombre: 'Central' }];
      if (table === 'unidades_medida') data = [{ id: 'um-1', codigo: 'NIU', nombre: 'Unidad', simbolo: 'UND' }];
      if (table === 'marcas') data = [{ id: 'brand-1', nombre: 'AlvaPlast' }];
      if (table === 'proveedores' && supplierFailure) { await command('Fetch.fulfillRequest', {requestId, responseCode: 500, responseHeaders: [{name:'Content-Type',value:'application/json'}, {name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify({message:'Simulated supplier read failure'})).toString('base64')}); return; }
      await command('Fetch.fulfillRequest', { requestId, responseCode: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? 200 : 403, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, HEAD, OPTIONS' }, { name: 'Content-Range', value: '0-0/1' }], body: Buffer.from(JSON.stringify(data)).toString('base64') });
    }
  });
  console.log('Browser connected');
  await command('Network.enable');
  await command('Network.setBypassServiceWorker', { bypass: true });
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 160; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(50); }
    console.error(await evaluate("document.body.innerText.slice(0,1500)"), errors);
    throw new Error(`Timed out: ${expression}`);
  }
  async function go(path) {
    console.log(`Checking ${path}`);
    await command('Page.navigate', { url: origin + path });
    await waitFor('document.querySelector("h1") && document.body.innerText.length > 100');
    await pause(80);
    assert.ok(!await evaluate('document.body.innerText.includes("Página no encontrada")'), path);
  }
  async function field(label, value) {
    await waitFor(`Array.from((Array.from(document.querySelectorAll('dialog[open]')).at(-1)||document).querySelectorAll('label')).some(l=>l.firstChild.textContent.trim()===${JSON.stringify(label)})`);
    await evaluate(`(() => { const root=[...document.querySelectorAll('dialog[open]')].at(-1)||document; const label=[...root.querySelectorAll('label')].find(l=>l.firstChild.textContent.trim()===${JSON.stringify(label)}); const el=label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,select,textarea'); Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true})); })()`);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command('Emulation.setTimezoneOverride',{timezoneId:'America/Lima'});
  const key='erp_logistics_v1';const catalogKey='erp_maestros_tech_data_v2';
  const routes=['/logistica','/despachos','/entregas','/rutas','/transportistas'];
  const click=text=>evaluate(`(()=>{const root=[...document.querySelectorAll('dialog[open]')].at(-1)||document.querySelector('main');const b=[...root.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click();})()`);
  const input=async(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const state=()=>evaluate(`JSON.parse(localStorage.getItem('${key}'))`);
  const detail=code=>evaluate(`[...document.querySelectorAll('main tbody tr')].find(row=>row.textContent.includes(${JSON.stringify(code)})).querySelector('button').click()`);
  const ready=()=>waitFor("!document.querySelector('main [role=status]')?.textContent.includes('Cargando')");
  const modalReady=()=>waitFor("document.querySelector('dialog[open]')&&!document.querySelector('dialog [role=status]')?.textContent.includes('Cargando')");
  for(const route of routes){await go(route);await ready();}
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#nav-logistica > a')].map(a=>a.getAttribute('href')).filter(href=>href!=='/logistica')"),['/despachos','/entregas','/rutas','/transportistas'],'implemented sidebar entries remain in the existing accordion');
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),null);
  assert.equal(await evaluate(`localStorage.getItem('${catalogKey}')`),null,'reading carriers never seeds old examples');
  const catalog={transportistas:[{id:'carrier-1',ruc:'DOC-PRUEBA',razonSocial:'Transporte local de prueba',vehiculoModelo:'Vehículo de prueba',vehiculoPlaca:'PLACA-TEST',conductor:'Conductor de prueba',brevete:'LIC-TEST',telefono:'Contacto de prueba',estado:'Activo'}]};
  await evaluate(`localStorage.setItem('${catalogKey}',${JSON.stringify(JSON.stringify(catalog))});localStorage.setItem('stock-probe','unchanged');localStorage.setItem('kardex-probe','unchanged');localStorage.setItem('ventas-probe','unchanged');localStorage.setItem('erp_treasury_v1','unchanged-probe');`);
  const protectedBefore=await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}'&&k!=='erp_theme').map(k=>[k,localStorage.getItem(k)]))`);
  await go('/despachos');await click('Nuevo despacho');await modalReady();await field('Buscar venta','VENTA-ANTIGUA');
  await waitFor("[...document.querySelectorAll('dialog button')].some(b=>b.textContent.includes('VENTA-ANTIGUA'))");
  await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('VENTA-ANTIGUA')).click()");
  await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('referencias')||document.querySelector('dialog [role=alert]')?.textContent.includes('identificadores')");
  assert.ok(await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Continuar').disabled"));await click('Cerrar ventana');
  async function dispatchEditor(amount,address){
    await go('/despachos');await ready();await click('Nuevo despacho');await modalReady();await field('Buscar venta','OV-2026-1');
    await waitFor("[...document.querySelectorAll('dialog button')].some(b=>b.textContent.includes('OV-2026-1'))");
    await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('OV-2026-1')).click()");await click('Continuar');
    await waitFor("document.querySelector('dialog input[aria-label=\"Cantidad line-1\"]')");await input('dialog input[aria-label="Cantidad line-1"]',amount);
    await field('Dirección de entrega',address);await field('Contacto','Contacto logístico de prueba');
    await field('Almacén de salida (referencia manual)','alm-1');await field('Buscar transportista activo','Transporte local');
    await waitFor("[...document.querySelectorAll('dialog button')].some(b=>b.textContent.includes('Transporte local de prueba'))");
    await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('Transporte local de prueba')).click()");
  }
  async function saveDraft(){await click('Revisar despacho');await waitFor("document.querySelector('dialog').textContent.includes('Revisa el borrador')");await evaluate("(()=>{const b=[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Guardar borrador');b.click();b.click();})()");await waitFor("document.querySelector('dialog').textContent.includes('Historial de cambios')");}
  async function transition(label,reason){await click(label);await field(reason?'Motivo obligatorio':'Observación (opcional)',reason||'');await click('Confirmar cambio');await waitFor("!document.querySelector('dialog textarea')");}
  await dispatchEditor('4','Destino de prueba 1');await saveDraft();let ledger=await state();const first=ledger.dispatches[0];assert.equal(ledger.dispatches.length,1);assert.equal(ledger.commands.length,1);
  await transition('Marcar preparado');await click('Cerrar');
  await dispatchEditor('7','Destino de prueba 2');await click('Revisar despacho');await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('supera lo pendiente')");
  assert.equal(await evaluate("document.querySelector('dialog input[aria-label=\"Cantidad line-1\"]').value"),'7');
  await input('dialog input[aria-label="Cantidad line-1"]','3');await click('Revisar despacho');
  const beforeQuota=await evaluate(`localStorage.getItem('${key}')`);
  await evaluate(`window.originalLogisticsSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='${key}')throw new DOMException('quota','QuotaExceededError');return window.originalLogisticsSet.call(this,k,v);};`);
  await click('Guardar borrador');await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('No se pudo guardar Logística')");
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),beforeQuota);assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('Destino de prueba 2')"));
  await evaluate('Storage.prototype.setItem=window.originalLogisticsSet');await click('Guardar borrador');await waitFor("document.querySelector('dialog').textContent.includes('Historial de cambios')");
  ledger=await state();const second=ledger.dispatches.find(d=>d.id!==first.id);await transition('Marcar preparado');await click('Cerrar');
  await dispatchEditor('3','Destino cancelado');await saveDraft();await transition('Marcar preparado');await transition('Cancelar despacho','Cambio de programación');await click('Cerrar');
  ledger=await state();assert.equal(ledger.dispatches.length,3);assert.equal(ledger.dispatches.filter(d=>d.status==='CANCELADO').length,1);assert.equal(ledger.deliveries.length,0);
  await dispatchEditor('3','Cantidad liberada');await click('Revisar despacho');assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('Revisa el borrador')"));await click('Cerrar ventana');
  await go('/rutas');await click('Nueva ruta');await modalReady();await field('Código de ruta','R-PRUEBA');await field('Nombre de ruta','Ruta manual de prueba');await field('Responsable de ruta','Responsable de prueba');
  for(const code of [first.code,second.code])await evaluate(`[...document.querySelectorAll('dialog li')].find(li=>li.textContent.includes(${JSON.stringify(code)}))?.querySelector('button')?.click()`);
  await click('Bajar parada 1');await click('Revisar planificación');await click('Guardar planificación');await waitFor("document.querySelector('dialog').textContent.includes('Historial de cambios')");
  ledger=await state();assert.deepEqual(ledger.routes[0].stops.map(s=>s.dispatchId),[second.id,first.id]);
  assert.ok(await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Iniciar seguimiento').disabled"));
  await click('Editar paradas');await modalReady();await click('Subir parada 2');await click('Revisar planificación');await click('Guardar planificación');await waitFor("document.querySelector('dialog').textContent.includes('Historial de cambios')");
  ledger=await state();assert.deepEqual(ledger.routes[0].stops.map(s=>s.dispatchId),[first.id,second.id]);await click('Cerrar');
  for(const code of [first.code,second.code]){await go('/despachos');await ready();await detail(code);await modalReady();await transition('Registrar salida');await click('Cerrar');}
  await go('/rutas');await ready();await click('Ver ruta y seguimiento');await modalReady();await transition('Iniciar seguimiento');
  assert.ok(await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Finalizar ruta').disabled"));await click('Cerrar');
  await evaluate("localStorage.setItem('erp_theme','dark')");await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  async function deliveryEditor(dispatchId){await go('/entregas');await ready();const d=(await state()).dispatches.find(d=>d.id===dispatchId);await evaluate(`[...document.querySelectorAll('main tbody tr')].find(row=>row.textContent.includes(${JSON.stringify(d.code)})).querySelectorAll('button')[1].click()`);await modalReady();return d;}
  async function confirmAttempt(){assert.ok(await evaluate("document.documentElement.scrollWidth<=390&&document.querySelector('dialog').getBoundingClientRect().width<=390"));await click('Revisar intento');await evaluate("(()=>{const b=[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Confirmar intento');b.click();b.click();})()");await waitFor("document.querySelector('dialog').textContent.includes('Historial de intentos')");await click('Cerrar');}
  await deliveryEditor(first.id);await field('Resultado','FALLIDA');await field('Incidencias','Destinatario ausente');await confirmAttempt();
  let d=await deliveryEditor(first.id);await field('Receptor','Receptor de prueba');await input(`dialog input[aria-label="Entregar ${d.lines[0].id}"]`,'5');await click('Revisar intento');await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('supera lo enviado')");
  await input(`dialog input[aria-label="Entregar ${d.lines[0].id}"]`,'1');await confirmAttempt();
  await deliveryEditor(first.id);await field('Receptor','Segundo receptor');await click('Completar cantidades pendientes');await confirmAttempt();
  await deliveryEditor(second.id);await field('Receptor','Receptor final');await click('Completar cantidades pendientes');await confirmAttempt();
  ledger=await state();assert.equal(ledger.deliveries.length,4,'failed and partial attempts remain separate, double click creates no duplicate');
  await go('/rutas');await ready();await click('Ver ruta y seguimiento');await modalReady();await transition('Finalizar ruta');await click('Cerrar');
  const healthy=await evaluate(`localStorage.getItem('${key}')`);ledger=await state();assert.equal(ledger.routes[0].status,'FINALIZADA');assert.equal(ledger.routes[0].history.length,4);
  await go('/despachos');await ready();assert.equal(await evaluate(`localStorage.getItem('${key}')`),healthy,'reload preserves every record');
  await field('Buscar','sin-coincidencias');await waitFor("document.querySelector('main [role=status]')?.textContent.includes('No hay coincidencias')");await click('Limpiar / actualizar');await ready();
  await evaluate(`localStorage.setItem('${key}','{broken')`);await go('/despachos');await waitFor("document.querySelector('main [role=alert]')?.textContent.includes('conservan intactos')");assert.equal(await evaluate(`localStorage.getItem('${key}')`),'{broken');
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthy)})`);await click('Reintentar');await ready();
  salesFailure=true;await click('Nuevo despacho');await waitFor("document.querySelector('dialog [role=alert]')?.textContent.includes('No se pudieron cargar las ventas')");salesFailure=false;await click('Reintentar');await waitFor("[...document.querySelectorAll('dialog button')].some(b=>b.textContent.includes('OV-2026-1'))");await click('Cerrar ventana');
  const beforeBadCatalog=await evaluate(`localStorage.getItem('${catalogKey}')`);await evaluate(`localStorage.setItem('${catalogKey}','{bad-catalog')`);await go('/transportistas');await waitFor("document.querySelector('main [role=alert]')");assert.equal(await evaluate(`localStorage.getItem('${catalogKey}')`),'{bad-catalog');await evaluate(`localStorage.setItem('${catalogKey}',${JSON.stringify(beforeBadCatalog)})`);await click('Reintentar');await ready();
  // Valid synthetic records exercise repository pagination without creating real examples.
  const many=JSON.parse(healthy);for(let n=0;n<12;n++){
    const id='page-'+n,command='page-command-'+n;const template=structuredClone(many.dispatches[0]);template.id=id;template.code='PAG-'+n;template.source.key='ventas:sale-2';template.source.id='sale-2';template.source.number='OV-2026-2';template.source.lines=[{id:'line-many',description:'Producto de muchas entregas',orderedUnits:100000000}];template.lines=[{id:id+':line:line-many',saleLineId:'line-many',description:'Producto de muchas entregas',quantityUnits:1000000}];template.status='BORRADOR';template.revision=0;template.history=[{id:command,at:template.createdAt,from:'',to:'BORRADOR',reason:'Registro simulado de prueba'}];many.dispatches.push(template);many.commands.push({id:command,kind:'dispatch',entityId:id,fingerprint:'test-fixture',at:template.createdAt});
  }
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(JSON.stringify(many))})`);await go('/despachos');await waitFor("document.querySelectorAll('main tbody tr').length===10");await click('Siguiente');await waitFor("document.querySelectorAll('main tbody tr').length===5");await click('Anterior');await waitFor("document.querySelectorAll('main tbody tr').length===10");
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthy)})`);
  for(const dark of [false,true])for(const mobile of [false,true]){
    await evaluate(`localStorage.setItem('erp_theme','${dark?'dark':'light'}')`);await command('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1,mobile});
    for(const route of routes){await go(route);await ready();assert.ok(await evaluate(`document.documentElement.scrollWidth<=${mobile?390:1440}`),route);assert.equal(await evaluate("document.documentElement.classList.contains('dark')"),dark);const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(resolve(artifacts,`${route.slice(1)}-${mobile?'mobile':'desktop'}-${dark?'dark':'light'}.png`),Buffer.from(shot.data,'base64'));}
    if(mobile){await go('/despachos');await click('Nuevo despacho');await modalReady();assert.ok(await evaluate("document.querySelector('dialog').getBoundingClientRect().width<=390"));await click('Cerrar ventana');await go('/rutas');await click('Nueva ruta');await modalReady();assert.ok(await evaluate("document.querySelector('dialog').getBoundingClientRect().width<=390&&document.documentElement.scrollWidth<=390"));await click('Cerrar ventana');}
    const image=await command('Page.captureScreenshot',{format:'png'});await writeFile(resolve(artifacts,`${mobile?'mobile':'desktop'}-${dark?'dark':'light'}.png`),Buffer.from(image.data,'base64'));
  }
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}'&&k!=='erp_theme').map(k=>[k,localStorage.getItem(k)]))`),protectedBefore,'stock/Kardex probes, legacy sources, commercial and treasury data remain unchanged');
  assert.deepEqual(writes,[],'no remote writes attempted; every external request intercepted');assert.deepEqual(errors,[],'no browser runtime exceptions');
  console.log('PASS Logistics browser: dispatch partials/cancellation/release, source limitations, quantities, quota/retry, manual route assignment/reorder, sent-only delivery attempts, failed/partial/full delivery, route completion, reload/filter/pagination/error recovery, mobile/light/dark and no stock/Kardex/sale/treasury/remote writes.');
} finally {ws?.close();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
