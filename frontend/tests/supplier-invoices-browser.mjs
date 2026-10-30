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
const artifacts = resolve(root, 'node_modules/.tmp/invoice-browser');
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

  const key = 'erp_supplier_invoices_v1';
  const click = text => evaluate(`window.confirm=()=>true; [...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  async function field(label, value) {
    await evaluate(`(() => { const label=[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent.trim()===${JSON.stringify(label)}); const el=label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,select,textarea'); Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true})); })()`);
  }
  await go('/compras');
  assert.ok(await evaluate("!!document.querySelector('#nav-compras a[href=\"/facturas-proveedores\"]')"));
  await evaluate("document.querySelector('#nav-compras a[href=\"/facturas-proveedores\"]').click()");
  await waitFor("document.querySelector('h1')?.textContent==='Facturas de proveedores'");
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='Registrar desde una orden'&&!b.disabled)");
  assert.equal(await evaluate(`localStorage.getItem('${key}')`), null);
  await click('Limpiar / actualizar');
  await waitFor("document.body.innerText.includes('Listado actualizado.')");
  assert.ok(await evaluate("document.body.innerText.includes('A\u00fan no hay facturas registradas.')"));
  assert.equal(await evaluate("[...document.querySelectorAll('label')].some(l=>l.textContent.startsWith('Estado documental'))"),true);
  supplierFailure = true;
  await go('/facturas-proveedores');
  await waitFor("document.body.innerText.includes('No se pudieron cargar los proveedores')");
  supplierFailure = false;
  await click('Reintentar proveedores');
  await waitFor("!document.body.innerText.includes('No se pudieron cargar los proveedores') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Registrar sin orden'&&!b.disabled)");

  await evaluate("localStorage.setItem('erp_ordenes_compra','[]'); localStorage.setItem('stock-integrity-probe','unchanged')");
  const storageBefore = await evaluate(`Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))`);
  await click('Registrar desde una orden');
  await field('Orden de compra *','oc-1');
  assert.equal(await evaluate("document.querySelector('input[type=date]').value"),'');
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Proveedor *').querySelector('select').value"),'party-1');
  assert.equal(await evaluate("document.querySelector('input[aria-label^=\"Cantidad facturada\"]').value"),'20');
  await field('Serie *',' f001 '); await field('Número *','000123');
  await field('Emisión *','2026-10-01'); await field('Vencimiento *','2026-10-30');
  await evaluate(`(() => { const e=document.querySelector('input[aria-label^="Cantidad facturada"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3'); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await field('Observaciones','Formulario conservado');
  // Decline replacement after editing.
  await evaluate("window.confirm=()=>false");
  await field('Orden de compra *','oc-2');
  assert.equal(await evaluate("document.querySelector('input[aria-label^=\"Cantidad facturada\"]').value"),'3');
  await evaluate("window.confirm=()=>true");
  await field('Orden de compra *','oc-2');
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Proveedor *').querySelector('select').value"),'party-2');
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Moneda *').querySelector('select').value"),'USD');
  await field('Orden de compra *','oc-1');
  await evaluate(`(() => { const e=document.querySelector('input[aria-label^="Cantidad facturada"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3'); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await evaluate(`(() => { const e=document.querySelector('input[aria-label^="Precio "]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3'); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  assert.ok(await evaluate("document.querySelector('[aria-label=\"Diferencias para revisión\"]').textContent.includes('Precio 3 frente a 2')"));
  await evaluate("window.confirm=()=>true; window.originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k==='erp_supplier_invoices_v1') throw new DOMException('quota','QuotaExceededError'); return window.originalSetItem.call(this,k,v)}");
  await click('Guardar factura');
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('almacenamiento lleno')");
  assert.equal(await evaluate("document.querySelector('textarea').value"),'Formulario conservado');
  await evaluate("Storage.prototype.setItem=window.originalSetItem");
  await evaluate("const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Guardar factura'); b.click(); b.click()");
  await waitFor("document.querySelector('main section h2')?.textContent.includes('REGISTRADA')");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.length`),1);
  assert.ok(await evaluate("document.body.innerText.includes('10.62')"));
  assert.equal(await evaluate("localStorage.getItem('erp_ordenes_compra')"),'[]');
  const first = await evaluate(`JSON.parse(localStorage.getItem('${key}')).records[0]`);
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}').map(k=>[k,localStorage.getItem(k)]))`),storageBefore,'saving changes only the invoice key');
  assert.equal(first.lines[0].orderedQuantity,20); assert.equal(first.lines[0].quantity,3);
  await go('/facturas-proveedores');
  await waitFor("document.body.innerText.includes('F001-000123')");
  await click('Ver detalle');
  assert.ok(await evaluate("document.body.innerText.includes('Formulario conservado')"));
  await click('Volver al listado'); await click('Registrar desde una orden');
  await field('Orden de compra *','oc-1');
  await waitFor("document.querySelector('[aria-label=\"Revisión de la orden\"]')?.textContent.includes('1 factura(s)')");
  assert.ok(await evaluate("document.querySelector('[aria-label=\"Revisión de la orden\"] tbody tr').textContent.includes('17')"));
  await field('Serie *','F001'); await field('Número *','124');
  await field('Emisión *','2026-10-02'); await field('Vencimiento *','2026-10-30');
  await evaluate(`(() => { const e=document.querySelector('input[aria-label^="Cantidad facturada"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'5'); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await click('Guardar factura');
  await waitFor("document.querySelector('main section h2')?.textContent.includes('REGISTRADA')");
  await waitFor("document.querySelector('[aria-label=\"Revisión de la orden\"]')?.textContent.includes('2 factura(s)')");
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.map(r=>r.orderId)`),['oc-1','oc-1']);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Revisión de la orden\"] tbody tr td:last-child').textContent"),'12');
  await click('Volver al listado'); await click('Registrar sin orden');
  await field('Proveedor *','party-1'); await field('Agregar producto','product-1');
  await field('Serie *','F002'); await field('Número *','1');
  await field('Emisión *','2026-10-03'); await field('Vencimiento *','2026-10-30');
  await click('Guardar factura');
  await waitFor("document.querySelector('main section h2')?.textContent.includes('REGISTRADA')");
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records[0].orderId`),undefined);
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}').map(k=>[k,localStorage.getItem(k)]))`),storageBefore,'all three saves leave stock, orders and payments untouched');
  await click('Volver al listado'); await click('Registrar sin orden');
  await field('Proveedor *','party-1'); await field('Serie *','f001'); await field('Número *','123'); await field('Agregar producto','product-1');
  await field('Emisión *','2026-10-01'); await field('Vencimiento *','2026-10-30');
  await click('Guardar factura');
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Ya existe')");
  assert.ok(await evaluate("!!document.querySelector('#supplier-invoice-form')"));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.length`),3);
  await click('Volver al listado');
  await field('Buscar','inexistente'); await waitFor("document.body.innerText.includes('0 registros')");
  await click('Limpiar / actualizar'); await waitFor("document.body.innerText.includes('3 registros')");
  await field('Proveedor','201234');
  await waitFor("document.querySelectorAll('[role=option]').length===1");
  assert.ok(await evaluate("document.querySelector('[role=option]').textContent.includes('20123456789')"));
  await evaluate("document.querySelector('[role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); document.querySelector('[role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await waitFor("document.body.innerText.includes('3 registros')");
  await click('Quitar proveedor');
  await field('Proveedor','Entidad local');
  await waitFor("document.querySelectorAll('[role=option]').length===2");
  await evaluate("document.querySelectorAll('[role=option]')[1].click()");
  await waitFor("document.body.innerText.includes('0 registros')");
  assert.ok(await evaluate("document.body.innerText.includes('No hay facturas que coincidan')"));
  await click('Quitar proveedor');
  await field('Proveedor','209876');
  await waitFor("document.querySelectorAll('[role=option]').length===1");
  await field('Proveedor','zzzzzz');
  await waitFor("document.body.innerText.includes('No se encontraron proveedores')");
  await click('Limpiar / actualizar');
  assert.equal(await evaluate("document.querySelector('[role=combobox]').value"),'');
  await field('Buscar','F001'); await field('Moneda','PEN');
  await field('Emisi\u00f3n desde','2026-10-02'); await field('Emisi\u00f3n hasta','2026-10-02');
  await waitFor("document.body.innerText.includes('1 registros')");
  await field('Emisi\u00f3n desde','2026-10-03');
  await waitFor("document.body.innerText.includes('no puede ser posterior')");
  await field('Por p\u00e1gina','25');
  await click('Limpiar / actualizar');
  await waitFor("document.body.innerText.includes('Listado actualizado.')");
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Por p\u00e1gina').querySelector('select').value"),'25');
  assert.ok(await evaluate("[...document.querySelectorAll('label')].filter(l=>['Buscar','Moneda','Emisi\u00f3n desde','Emisi\u00f3n hasta'].includes(l.firstChild.textContent)).every(l=>l.querySelector('input,select').value==='')"));
  await field('Por p\u00e1gina','10');
  // Populate only this isolated browser profile with synthetic records to exercise pagination.
  await evaluate(`(() => {const data=JSON.parse(localStorage.getItem('${key}')); for(let i=4;i<=12;i++) data.records.push({...data.records[0],id:'test-'+i,number:String(i)});localStorage.setItem('${key}',JSON.stringify(data));})()`);
  await click('Limpiar / actualizar'); await waitFor("document.body.innerText.includes('12 registros')");
  await click('Siguiente'); await waitFor("document.body.innerText.includes('Página 2 de 2')");
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),2);
  await field('Moneda','USD'); await waitFor("document.body.innerText.includes('0 registros')");
  await click('Limpiar / actualizar');
  await evaluate("document.querySelector('header button[aria-pressed]').click()");
  await command('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await go('/facturas-proveedores');
  await waitFor("document.body.innerText.includes('12 registros')");
  await pause(350);
  assert.ok(await evaluate("document.documentElement.classList.contains('dark')"));
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390"));
  await click('Registrar sin orden');
  await field('Proveedor *','party-1'); await field('Agregar producto','product-1');
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390"));
  assert.ok(await evaluate("[...document.querySelectorAll('fieldset > div label input, fieldset > div label select')].every(e=>e.getBoundingClientRect().right<=390)"),'form controls fit mobile viewport');
  const screenshot=await command('Page.captureScreenshot',{format:'png'});
  await (await import('node:fs/promises')).writeFile(resolve(artifacts,'invoice-mobile-dark.png'),Buffer.from(screenshot.data,'base64'));
  await click('Volver al listado');
  await click('Registrar desde una orden'); await field('Orden de compra *','oc-1');
  await waitFor("document.querySelector('[aria-label=\"Revisión de la orden\"]')?.textContent.includes('2 factura(s)')");
  assert.ok(await evaluate("document.documentElement.scrollWidth<=390"),'order review fits mobile');
  await evaluate("document.querySelector('main > div').scrollTop=10000");
  const orderScreenshot=await command('Page.captureScreenshot',{format:'png'});
  await (await import('node:fs/promises')).writeFile(resolve(artifacts,'invoice-order-mobile-dark.png'),Buffer.from(orderScreenshot.data,'base64'));
  await click('Volver al listado');
  const healthyInvoices = await evaluate(`localStorage.getItem('${key}')`);
  await evaluate(`localStorage.setItem('${key}','{damaged')`);
  await click('Limpiar / actualizar');
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('inválido')");
  assert.ok(!await evaluate("document.body.innerText.includes('Listado actualizado.')"));
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(healthyInvoices)})`);
  await click('Reintentar lectura');
  await waitFor("document.body.innerText.includes('Listado actualizado.')");
  await evaluate(`localStorage.setItem('${key}','{damaged')`);
  await click('Registrar sin orden'); await field('Proveedor *','party-1'); await field('Serie *','F002'); await field('Número *','99'); await field('Agregar producto','product-1');
  await field('Emisión *','2026-10-01'); await field('Vencimiento *','2026-10-30');
  await click('Guardar factura'); await waitFor("document.querySelector('[role=alert]')?.textContent.includes('inválido')");
  assert.equal(await evaluate(`localStorage.getItem('${key}')`),'{damaged');
  assert.ok(await evaluate("!!document.querySelector('#supplier-invoice-form')"));
  assert.equal(await evaluate("localStorage.getItem('stock-integrity-probe')"),'unchanged');
  assert.deepEqual(writes,[]); assert.deepEqual(errors,[]);
  console.log('PASS invoices browser: navigation, auto supplier/currency/lines, two partial invoices per order, manual invoice, order references, independent quantities, replacement warning, quota retains draft, double click, reload/detail, duplicates, supplier name/document autocomplete and keyboard, same-name supplier IDs, combined filters/date validation, refresh confirmation/page size, supplier and invoice read retries, filters/pagination, mobile/dark, corrupt data preserved, zero remote writes.');
} finally {
  ws?.close();
  child.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

