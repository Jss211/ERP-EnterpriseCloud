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
const artifacts = resolve(root, 'node_modules/.tmp/pending-invoice-browser');
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
  const setInput=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  async function prepareOrder() {
    await go('/orden-compra');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Seleccionar un proveedor'))");
    await setInput('input[placeholder="Seleccionar o buscar producto..."]','ALVA');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('ALVA-001')&&b.textContent.includes('Stock:'))");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ALVA-001')&&b.textContent.includes('Stock:')).click()");
    await setInput('input[placeholder="0.00"]','6');
    await click('Agregar');
    await evaluate("(()=>{const e=document.querySelectorAll('input[placeholder=\"0.00\"]')[2];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Seleccionar un proveedor')).click()");
    await waitFor("document.querySelector('input[placeholder=\"Proveedor / RUC / DNI / Correo\"]')");
    await evaluate("[...document.querySelectorAll('tr')].find(tr=>tr.textContent.includes('20123456789')).click()");
  }
  await prepareOrder();
  await evaluate("localStorage.setItem('stock-probe','unchanged');localStorage.setItem('payments-probe','unchanged');localStorage.setItem('kardex-probe','unchanged')");
  await evaluate("const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Grabar orden');b.click();b.click()");
  await waitFor(`JSON.parse(localStorage.getItem('${key}')||'null')?.records.length===1`);
  assert.equal(writes.length,1,'one existing purchase POST intercepted and rejected; no real remote writes');
  const first=await evaluate(`JSON.parse(localStorage.getItem('${key}')).records[0]`);
  assert.equal(first.status,'PENDIENTE');assert.equal(first.supplierId,'party-1');assert.equal(first.lines[0].quantity,6);assert.equal(first.orderDiscountAmount,1);
  assert.equal(first.orderId,await evaluate("JSON.parse(localStorage.getItem('erp_ordenes_compra'))[0].id"));
  assert.equal(first.series,'');assert.equal(first.number,'');assert.equal(first.issuedAt,'');
  await go('/facturas-proveedores');await waitFor("document.body.innerText.includes('Pendiente de completar')");
  for(const search of [first.internalId,first.orderId,first.orderCode,party.nombre]) {await field('Buscar',search);await waitFor("document.body.innerText.includes('1 registros')");}
  await click('Limpiar / actualizar');
  await prepareOrder();
  await evaluate(`window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='${key}')throw new DOMException('quota','QuotaExceededError');return window.originalSetItem.call(this,k,v)}`);
  await click('Grabar orden');
  await waitFor("document.body.innerText.includes('No se pudo generar la referencia pendiente de factura')");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('erp_ordenes_compra')).length"),2,'order remains saved when pending creation fails');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.length`),1);
  const postsBeforeRecovery=writes.length;
  await evaluate("Storage.prototype.setItem=window.originalSetItem");
  await click('Generar pendiente sin volver a guardar la orden');
  await waitFor(`JSON.parse(localStorage.getItem('${key}')).records.length===2`);
  assert.equal(writes.length,postsBeforeRecovery,'recovery does not save the purchase again');
  await go('/facturas-proveedores');await field('Buscar',first.internalId);await waitFor("document.body.innerText.includes('1 registros')");
  await click('Completar');
  await evaluate("(()=>{const e=document.querySelector('input[aria-label^=\"Cantidad facturada\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await field('Observaciones','Pendiente editado por usuario');await click('Guardar pendiente');
  await waitFor("document.body.innerText.includes('Pendiente guardado.')");
  const edited=await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.find(r=>r.id===${JSON.stringify(first.id)})`);
  await go('/orden-compra');
  await evaluate(`[...document.querySelectorAll('tbody tr')].find(tr=>tr.textContent.includes(${JSON.stringify(first.orderCode)})).querySelector('button').click()`);
  await waitFor("document.body.innerText.includes('Referencia interna:')");
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.find(r=>r.id===${JSON.stringify(first.id)})`),edited,'history recovery preserves edits');
  await go('/facturas-proveedores');await field('Buscar',first.internalId);await waitFor("document.body.innerText.includes('1 registros')");await click('Completar');
  assert.equal(await evaluate("document.querySelector('input[aria-label^=\"Cantidad facturada\"]').value"),'3');
  await field('Serie *','P001');await field('Número *','1');await field('Emisión *','2026-10-01');await field('Vencimiento *','2026-10-30');
  const immutableBefore=await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}').map(k=>[k,localStorage.getItem(k)]))`);
  await click('Guardar factura');await waitFor("document.querySelector('main section h2')?.textContent.includes('REGISTRADA')");
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}').map(k=>[k,localStorage.getItem(k)]))`),immutableBefore);
  const completed=await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.find(r=>r.id===${JSON.stringify(first.id)})`);
  assert.equal(completed.status,'REGISTRADA');assert.equal(completed.internalId,first.internalId);
  await click('Volver al listado');await click('Registrar desde una orden');
  await field('Orden de compra *',first.orderId);await field('Serie *','P001');await field('Número *','2');await field('Emisión *','2026-10-02');await field('Vencimiento *','2026-10-30');
  await click('Guardar factura');await waitFor("document.querySelector('main section h2')?.textContent.includes('REGISTRADA')");
  await click('Volver al listado');await click('Registrar sin orden');await field('Proveedor *','party-1');await field('Agregar producto','product-1');await field('Serie *','M001');await field('Número *','1');await field('Emisión *','2026-10-03');await field('Vencimiento *','2026-10-30');
  await click('Guardar factura');await waitFor("document.querySelector('main section h2')?.textContent.includes('REGISTRADA')");
  assert.deepEqual(await evaluate(`Object.fromEntries(Object.keys(localStorage).filter(k=>k!=='${key}').map(k=>[k,localStorage.getItem(k)]))`),immutableBefore,'completing and adding partial/manual invoices changes no orders, stock, Kardex or payments');
  await go('/facturas-proveedores');await waitFor("document.body.innerText.includes('4 registros')");
  await field('Buscar','P001-1');await waitFor("document.body.innerText.includes('1 registros')");
  await field('Buscar',first.internalId);await waitFor("document.body.innerText.includes('1 registros')");
  await go('/orden-compra');await evaluate(`[...document.querySelectorAll('tbody tr')].find(tr=>tr.textContent.includes(${JSON.stringify(first.orderCode)})).querySelector('button').click()`);await waitFor("document.body.innerText.includes('Referencia interna:')");
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('${key}')).records.find(r=>r.id===${JSON.stringify(first.id)})`),completed,'retry never overwrites a completed automatic invoice');
  assert.ok(writes.every(w=>w.method==='POST'&&new URL(w.url).pathname.endsWith('/ordenes_compra')));
  assert.equal(writes.length,2,'only the two original purchase saves attempted a mocked POST; none reached a remote service');
  assert.deepEqual(errors,[]);
  console.log('PASS automatic pending invoices: purchase double click, immediate listing, internal/order/supplier/document search, quota failure and recovery without resaving, edited snapshots, completion, second partial, manual invoice, reload, registered protection and unchanged stock/Kardex/orders/payments on invoicing. All external requests intercepted; purchase POSTs rejected locally.');
} finally {
  ws?.close();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
