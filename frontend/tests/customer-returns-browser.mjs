import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
const artifacts = resolve(root, 'node_modules/.tmp/customer-returns-browser');
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
const profile = resolve(artifacts, `profile-${Date.now()}`);
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
  let supplierFailure = false;
  let salesFailure = false;
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
      if (table === 'ventas') {
        if(salesFailure) {await command('Fetch.fulfillRequest',{requestId,responseCode:500,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify({message:'Simulated sale read failure'})).toString('base64')});return;}
        data=[{id:'sale-1',numero:'VEN-001',cliente_id:'party-1',cliente_nombre:party.nombre,fecha:'2026-10-01',moneda:'PEN',estado:'Completada',items:[{id:'sold-line-1',descripcion:'Bolsa de prueba local',cantidad:10,precio_unitario:4,subtotal:40},{id:'sold-line-2',descripcion:'Segundo producto vendido',cantidad:5,precio_unitario:8,subtotal:40}]}];
      }
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
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const key = 'erp_customer_returns_v1';
  const click = text => evaluate(`window.confirm=()=>true; [...document.querySelectorAll('button')].find(b=>(b.textContent.trim()===${JSON.stringify(text)} || b.getAttribute('aria-label')===${JSON.stringify(text)})).click()`);
  async function field(label, value) {
    await evaluate(`(() => { const label=[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent.trim()===${JSON.stringify(label)}); const el=label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,select,textarea'); Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true})); })()`);
  }
  await go('/ventas');
  assert.ok(await evaluate("!!document.querySelector('#nav-ventas a[href=\"/devoluciones\"]')"));
  await evaluate("document.querySelector('#nav-ventas a[href=\"/devoluciones\"]').click()");
  await waitFor("document.querySelector('h1')?.textContent==='Devoluciones de clientes'");
  await waitFor("document.body.innerText.includes('Aún no hay solicitudes de devolución')");
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),null);
  assert.ok(await evaluate("document.body.innerText.includes('Consulta y registra solicitudes de devoluci\u00f3n')"));
  assert.equal(await evaluate("[...document.querySelectorAll('label')].some(l=>l.firstChild.textContent==='Estado')"),false,'hide status filter when only requested state exists');
  assert.ok(!await evaluate("document.body.innerText.includes('SUNAT')"),'technical scope is collapsed by default');
  await evaluate("[...document.querySelectorAll('summary')].find(s=>s.textContent.includes('M\u00e1s informaci\u00f3n')).click()");
  assert.ok(await evaluate("document.body.innerText.includes('SUNAT')"));
  await evaluate("[...document.querySelectorAll('summary')].find(s=>s.textContent.includes('M\u00e1s informaci\u00f3n')).click()");
  async function shot(name) {const capture=await command('Page.captureScreenshot',{format:'png'});await (await import('node:fs/promises')).writeFile(resolve(artifacts,name+'.png'),Buffer.from(capture.data,'base64'));}
  for(const mobile of [false,true]) {
    await command('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1,mobile});
    for(const dark of [false,true]) {
      if(await evaluate("document.documentElement.classList.contains('dark')")!==dark) await evaluate("document.querySelector('header button[aria-pressed]').click()");
      await pause(250);
      assert.ok(await evaluate(`document.documentElement.scrollWidth<=${mobile?390:1440}`));
      await shot(`empty-${mobile?'mobile':'desktop'}-${dark?'dark':'light'}`);
    }
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelector('header button[aria-pressed]').click()");

  await evaluate(`localStorage.setItem('erp_ordenes_venta',JSON.stringify([{id:'OV-old',cliente:'Cliente histórico',ruc:'20999999999',fecha:'01 oct 2026',total:12,items:[{productoId:'product-1',desc:'Producto histórico',cant:3,pUnitario:4,total:12}]}]));localStorage.setItem('erp_estado_cuenta',JSON.stringify([{dbId:'sale-1',nro:'F001-linked',saldo:80,pagado:0},{dbId:'unrelated',nro:'F001-other',saldo:80}]));localStorage.setItem('stock-integrity-probe','unchanged');localStorage.setItem('kardex-integrity-probe','unchanged');localStorage.setItem('payments-integrity-probe','unchanged');`);
  await go('/devoluciones');
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='Nueva solicitud'&&!b.disabled)");
  const storageBefore=await evaluate(`Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))`);
  const input = (label,value) => evaluate(`(() => {const el=document.querySelector('[aria-label="'+${JSON.stringify(label)}+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const selectLine = i => evaluate(`document.querySelectorAll('input[type=checkbox]')[${i}].click()`);
  let firstEntry=true;
  async function start(source='ventas:sale-1') {
    await click(firstEntry ? 'Registrar primera solicitud' : 'Nueva solicitud'); firstEntry=false;await field('Venta u orden de origen',source);
    await waitFor("!document.querySelector('button[type=submit]').disabled || !!document.querySelector('[role=alert]')");
    await field('Fecha de solicitud','2026-10-26');await field('Motivo general','Revisión de productos');
  }
  await start();
  await shot('form-desktop-light');
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Cliente').querySelector('input').value"),party.nombre+' '+party.documento);
  assert.ok(await evaluate("[...document.querySelectorAll('select')].some(s=>s.textContent.includes('F001-linked')&&!s.textContent.includes('F001-other'))"));
  await selectLine(0);await selectLine(1);
  await input('Cantidad línea 1','0');await input('Motivo línea 1','Embalaje dañado');
  await input('Cantidad línea 2','1');await input('Motivo línea 2','Producto incorrecto');
  await click('Revisar solicitud');
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('mayor a cero')");
  await input('Cantidad línea 1','2');await field('Observaciones generales','No mover existencias');
  await click('Revisar solicitud');
  await waitFor("document.body.innerText.includes('Importe de referencia: PEN 16.00')");
  assert.ok(await evaluate("document.body.innerText.includes('No mover existencias')"));
  await shot('review-desktop-light');
  await evaluate(`window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='${key}')throw new DOMException('quota','QuotaExceededError');return window.originalSetItem.call(this,k,v)}`);
  await click('Guardar solicitud');
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('formulario se conserva')");
  assert.ok(await evaluate("document.body.innerText.includes('PEN 16.00')"));
  await evaluate("Storage.prototype.setItem=window.originalSetItem;const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Guardar solicitud');b.click();b.click()");
  await waitFor("document.querySelector('main section h2')?.textContent==='Detalle de devolución'");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.length`),1);
  const first=await evaluate(`JSON.parse(localStorage.getItem('${key}')).records[0]`);
  assert.equal(first.source.id,'sale-1');assert.equal(first.receipt.number,'F001-linked');assert.equal(first.lines[0].originalLineId,'sold-line-1');assert.equal(first.lines[0].productId,undefined);
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}').map(k=>[k,localStorage.getItem(k)]))`),storageBefore,'save changes only the return storage key');
  await go('/devoluciones');await waitFor("document.body.innerText.includes('1 solicitudes')");
  assert.equal(await evaluate("[...document.querySelectorAll('label')].some(l=>l.firstChild.textContent==='Estado')"),false,'one effective state stays hidden after registration');
  await click('Ver detalle');await waitFor("document.querySelector('dialog[open]')");assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('No mover existencias')"));
  await shot('detail-desktop-light');
  await click('Cerrar');await start();
  assert.ok(await evaluate("[...document.querySelectorAll('dt')].some(dt=>dt.textContent==='Disponible para solicitar' && dt.nextElementSibling.textContent==='10')"),'pending requests do not consume capacity');
  await selectLine(0);await input('Cantidad línea 1','10');await input('Motivo línea 1','Segunda solicitud');
  await click('Revisar solicitud');await click('Guardar solicitud');
  await waitFor("document.querySelector('main section h2')?.textContent==='Detalle de devolución'");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.length`),2);
  await click('Volver al listado');await start('orden-local:OV-old');
  await waitFor("document.body.innerText.includes('No podemos comprobar cuánto se devolvió antes')");
  await evaluate("[...document.querySelectorAll('summary')].find(s=>s.textContent==='Ver referencias del producto').click()");
  assert.ok(await evaluate("document.body.innerText.includes('Sin ID estable') && document.body.innerText.includes('product-1')"));
  await selectLine(0);await input('Motivo línea 1','Solicitud histórica');
  await click('Revisar solicitud');await click('Guardar solicitud');
  await waitFor("document.querySelector('main section h2')?.textContent==='Detalle de devolución'");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.length`),3);
  // Seed a confirmed historical record only in this disposable browser profile.
  await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('${key}'));data.records.push({...${JSON.stringify(first)},id:'confirmed-fixture',status:'CONFIRMADA',lines:[{...${JSON.stringify(first.lines[0])},quantity:8}]});localStorage.setItem('${key}',JSON.stringify(data));})()`);
  await click('Volver al listado');await click('Limpiar filtros');await start();
  await waitFor("[...document.querySelectorAll('dt')].some(dt=>dt.textContent==='Disponible para solicitar' && dt.nextElementSibling.textContent==='2')");
  await selectLine(0);await input('Cantidad línea 1','3');await input('Motivo línea 1','Cantidad revisada');
  await evaluate("document.querySelector('form').noValidate=true");
  await click('Revisar solicitud');await waitFor("document.querySelector('[role=alert]')?.textContent.includes('supera lo disponible')");
  await input('Cantidad línea 1','2');await click('Revisar solicitud');await click('Guardar solicitud');
  await waitFor("document.querySelector('main section h2')?.textContent==='Detalle de devolución'");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.length`),5);
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}').map(k=>[k,localStorage.getItem(k)]))`),storageBefore,'all saves preserve sales, account balances, stock, Kardex, payments and legacy sources');
  await click('Volver al listado');
  await field('Venta o comprobante','VEN-001');await field('Cliente','201234');await field('Estado','SOLICITADA');await field('Fecha desde','2026-10-26');await field('Fecha hasta','2026-10-26');
  await waitFor("document.body.innerText.includes('3 solicitudes')");
  await field('Cliente','absent');await waitFor("document.body.innerText.includes('No hay solicitudes que coincidan')");
  assert.ok(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Limpiar filtros').length===2"));
  await shot('no-results-desktop-light');
  await field('Fecha desde','2026-10-27');await waitFor("document.body.innerText.includes('no puede ser posterior')");
  await click('Limpiar filtros');await waitFor("document.body.innerText.includes('5 solicitudes')");
  await waitFor("document.body.innerText.includes('Filtros limpiados.')");
  await field('Estado','CONFIRMADA');await waitFor("document.body.innerText.includes('1 solicitudes')");
  await click('Limpiar filtros');
  await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('${key}'));for(let i=0;i<11;i++)data.records.push({...${JSON.stringify(first)},id:'page-'+i});localStorage.setItem('${key}',JSON.stringify(data));})()`);
  await click('Limpiar filtros');await waitFor("document.body.innerText.includes('16 solicitudes')");
  await click('Siguiente');await waitFor("document.body.innerText.includes('Página 2 de 2')");
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),6);
  await field('Por página','25');await click('Limpiar filtros');await waitFor("document.body.innerText.includes('Página 1 de 1')");
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),16);
  // Opening a detail never replaces the list, its page, filters or scroll position.
  await field('Por p\u00e1gina','10');await click('Siguiente');await waitFor("document.body.innerText.includes('P\u00e1gina 2 de 2')");
  await field('Cliente','Entidad');
  await click('Siguiente');await waitFor("document.body.innerText.includes('P\u00e1gina 2 de 2')");
  await evaluate("document.querySelector('main > div').scrollTop=300;window.detailTrigger=[...document.querySelectorAll('tbody button')][1];window.detailTrigger.focus({preventScroll:true});window.listScroll=document.querySelector('main > div').scrollTop;window.selectedId=window.detailTrigger.closest('tr').querySelector('td').textContent;window.detailTrigger.click()");
  await waitFor("document.querySelector('dialog[open]')");
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes(window.selectedId)"));
  assert.ok(await evaluate("document.querySelector('dialog').contains(document.activeElement)"));
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',modifiers:8});
  assert.ok(await evaluate("document.querySelector('dialog').contains(document.activeElement)"),'focus stays inside modal');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  await waitFor("!document.querySelector('dialog')");
  assert.ok(await evaluate("document.activeElement===window.detailTrigger"));
  assert.equal(await evaluate("document.querySelector('main > div').scrollTop"),await evaluate('window.listScroll'));
  assert.ok(await evaluate("document.body.innerText.includes('P\u00e1gina 2 de 2')"));
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Cliente').querySelector('input').value"),'Entidad');
  await evaluate("window.otherTrigger=document.querySelector('tbody button');window.otherId=window.otherTrigger.closest('tr').querySelector('td').textContent;window.otherTrigger.click()");
  await waitFor("document.querySelector('dialog[open]')");
  assert.notEqual(await evaluate('window.otherId'),await evaluate('window.selectedId'));
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes(window.otherId)"));
  await evaluate("document.querySelector('dialog [aria-label=\"Cerrar detalle\"]').click()");
  await waitFor("!document.querySelector('dialog')");
  assert.ok(await evaluate("document.activeElement===window.otherTrigger"));
  await evaluate("window.otherTrigger.click()");await waitFor("document.querySelector('dialog[open]')");await click('Cerrar');
  await click('Limpiar filtros');await waitFor("document.body.innerText.includes('16 solicitudes')");
  const healthy=await evaluate(`localStorage.getItem('${key}')`);
  await evaluate(`localStorage.setItem('${key}','{damaged')`);await click('Limpiar filtros');
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('intactos')");
  assert.ok(!await evaluate("document.body.innerText.includes('No hay solicitudes que coincidan')"));
  await start();await waitFor("document.querySelector('[role=alert]')?.textContent.includes('intactos')");
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),'{damaged');
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthy)})`);await click('Reintentar historial');
  await waitFor("!document.querySelector('button[type=submit]').disabled");
  await click('Volver al listado');await click('Reintentar lectura');await waitFor("document.body.innerText.includes('16 solicitudes')");
  salesFailure=true;await go('/devoluciones');await waitFor("document.body.innerText.includes('No se pudieron cargar las ventas')");
  assert.ok(await evaluate("document.body.innerText.includes('16 solicitudes')"));
  salesFailure=false;await click('Reintentar documentos');await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='Nueva solicitud'&&!b.disabled)");
  await evaluate("document.querySelector('header button[aria-pressed]').click()");
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await go('/devoluciones');await waitFor("document.body.innerText.includes('16 solicitudes')");
  assert.ok(await evaluate("document.documentElement.classList.contains('dark') && document.documentElement.scrollWidth<=390"),await evaluate("JSON.stringify({dark:document.documentElement.classList.contains('dark'),width:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>392).slice(0,8).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right])})"));
  await shot('list-mobile-dark');
  await click('Ver detalle');await waitFor("document.querySelector('dialog[open]')");
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390 && document.querySelector('dialog').getBoundingClientRect().right<=390"));
  assert.ok(await evaluate("document.querySelector('dialog > div').scrollHeight>document.querySelector('dialog > div').clientHeight"),'long detail scrolls inside modal');
  await shot('detail-mobile-dark');await click('Cerrar');

  await start();await selectLine(0);await input('Motivo línea 1','Móvil');
  await shot('form-mobile-dark');
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390"));
  await click('Revisar solicitud');
  assert.ok(await evaluate("document.body.innerText.includes('Registrar esta solicitud no modifica el inventario ni registra un reembolso')"));
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390"));
  const screenshot=await command('Page.captureScreenshot',{format:'png'});
  await (await import('node:fs/promises')).writeFile(resolve(artifacts,'customer-return-mobile-dark.png'),Buffer.from(screenshot.data,'base64'));
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS customer returns browser: navigation, real sale/receipt IDs, partial and multi-product requests, two requests per sale, legacy warning, confirmed capacity, invalid quantities, quota retains draft, double click, reload/detail, empty-state registration, effective status visibility, clear confirmation, scope disclosure, combined filters/pagination, corrupt storage/read retry, sale read retry, mobile/dark, unchanged stock/Kardex/sales/payments and zero remote writes.');
} finally {
  ws?.close();
  child.kill();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
