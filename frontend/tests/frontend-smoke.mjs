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
const artifacts = resolve(root, 'node_modules/.tmp/frontend-smoke');
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
      if (table === 'clientes' || table === 'proveedores') data = [party];
      if (table === 'lineas_categorias') data = [{ id: 'cat-1', codigo: 'BOL', nombre: 'Bolsas' }];
      if (table === 'almacenes') data = [{ id: 'alm-1', codigo: 'ALM', nombre: 'Central' }];
      if (table === 'unidades_medida') data = [{ id: 'um-1', codigo: 'NIU', nombre: 'Unidad', simbolo: 'UND' }];
      if (table === 'marcas') data = [{ id: 'brand-1', nombre: 'AlvaPlast' }];
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
  // Native input checks cover pointer capture outside the separator and keyboard access.
  await go('/maestros');
  const splitter = '[role="separator"][aria-controls="erp-navigation"]';
  const waitWidth = width => waitFor(`Math.abs(document.querySelector('aside').getBoundingClientRect().width-${width})<0.01`);
  const key = async (name, modifiers = 0) => {
    await command('Input.dispatchKeyEvent', {type:'keyDown',key:name,code:name,modifiers});
    await command('Input.dispatchKeyEvent', {type:'keyUp',key:name,code:name,modifiers});
  };
  async function dragSidebar(target) {
    const start = await evaluate(`(() => {const r=document.querySelector('${splitter}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100,width:document.querySelector('aside').getBoundingClientRect().width};})()`);
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x,y:start.y});
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:start.x,y:start.y});
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:start.x+target-start.width,y:start.y+30});
    await waitFor("document.body.style.cursor==='col-resize' && document.body.style.userSelect==='none'");
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:start.x+target-start.width,y:start.y+30});
    await waitFor("document.body.style.cursor==='' && document.body.style.userSelect===''");
  }
  await waitWidth(288);
  assert.equal(await evaluate(`document.querySelector('${splitter}').getAttribute('aria-label')`),'Ancho del menú lateral');
  for (const dark of [false, true]) {
    if (dark) await evaluate("document.querySelector('header button[aria-pressed]').click()");
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:1000,y:100});
    const resting = await evaluate(`getComputedStyle(document.querySelector('${splitter}')).backgroundColor`);
    const edge = await evaluate("document.querySelector('aside').getBoundingClientRect().width");
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge-1,y:100});
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${splitter}')).cursor`),'col-resize');
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('${splitter}')).backgroundColor`),resting,'hover feedback in each theme');
    await dragSidebar(360); await waitWidth(360);
    assert.equal(await evaluate("document.querySelector('main').getBoundingClientRect().left"),360);
    await dragSidebar(900); await waitWidth(480);
    await dragSidebar(20); await waitWidth(240);
  }
  await evaluate(`document.querySelector('${splitter}').focus()`);
  await key('ArrowRight'); await waitWidth(250);
  await key('ArrowRight',8); await waitWidth(290);
  await key('ArrowLeft'); await waitWidth(280);
  await key('Home'); await waitWidth(240);
  await key('ArrowLeft'); await waitWidth(240);
  await key('End'); await waitWidth(480);
  await key('ArrowRight'); await waitWidth(480);
  await waitFor("localStorage.getItem('erp_sidebar_width')==='480'");
  await go('/maestros'); await waitWidth(480);
  assert.equal(await evaluate(`Number(document.querySelector('${splitter}').getAttribute('aria-valuenow'))`),480);
  await evaluate("document.querySelector('aside > div button[aria-expanded]').click()");
  await waitWidth(80);
  assert.equal(await evaluate(`!!document.querySelector('${splitter}')`),false);
  assert.equal(await evaluate("document.querySelector('main').getBoundingClientRect().left"),80);
  await evaluate("document.querySelector('aside > div button[aria-expanded]').click()");
  await waitWidth(480);
  await command('Emulation.setDeviceMetricsOverride',{width:900,height:900,deviceScaleFactor:1,mobile:false});
  await waitWidth(420);
  assert.equal(await evaluate("document.querySelector('main').getBoundingClientRect().width"),480);
  assert.equal(await evaluate("localStorage.getItem('erp_sidebar_width')"),'480','viewport changes preserve the preferred width');
  await command('Emulation.setDeviceMetricsOverride',{width:768,height:900,deviceScaleFactor:1,mobile:false});
  await waitWidth(288);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await waitFor("document.querySelector('aside').getBoundingClientRect().right<=1");
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${splitter}')).display`),'none');
  assert.equal(await evaluate("document.querySelector('main').getBoundingClientRect().width"),390);
  await evaluate("document.querySelector('header button[aria-controls=erp-navigation]').click()");
  await waitWidth(288);
  assert.equal(await evaluate("document.querySelector('main').getBoundingClientRect().width"),390);
  await key('Escape');
  await waitFor("document.querySelector('aside').getBoundingClientRect().right<=1");
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await waitWidth(480);
  await evaluate("localStorage.setItem('erp_sidebar_width','invalid');localStorage.setItem('erp_theme','light')");
  await go('/maestros'); await waitWidth(288);
  console.log('PASS sidebar: native drag/capture, limits, content layout, keyboard, reload, invalid preference, collapse, responsive desktop cap, mobile drawer, light/dark hover.');
  const legacyRoutes = ['/', '/orden-compra', '/orden-venta', '/facturacion', '/estado-cuenta', '/ingreso-kardex', '/movimiento-kardex', '/stock-productos', '/reportes', '/maestros', '/mantenimientos', '/clientes', '/proveedores', '/cotizaciones'];
  for (const path of [...new Set([...legacyRoutes, ...erpModules.map(module => `/${module.id}`), '/maestros/productos', '/maestros/locales'])]) await go(path);
  // Menus and covers use the same daily selection; only summary pages expose secondary links.
  assert.ok(erpModules.every(module => module.links.every(link => link.path !== '/')));
  const owners = new Map();
  for (const module of erpModules) {
    for (const link of module.links.filter(link => link.path)) {
      assert.ok(!owners.has(link.path), `Duplicate primary destination: ${link.path}`);
      owners.set(link.path, module.id);
    }
    await go(`/${module.id}`);
    const group = JSON.stringify(`#nav-${module.id}`);
    const primary = await evaluate(`Array.from(document.querySelector(${group}).children).slice(0,-1).map(item => ({ name: item.textContent, disabled: item.disabled === true, path: item.getAttribute('href') }))`);
    assert.equal(primary.length, module.links.length);
    assert.equal(await evaluate(`document.querySelector(${group}).lastElementChild.textContent`), 'Resumen del módulo');
    for (const [index, link] of module.links.entries()) {
      assert.ok(primary[index].name.startsWith(link.name));
      assert.equal(primary[index].disabled, !link.path);
      assert.equal(primary[index].path, link.path ?? null);
      if (!link.path) assert.ok(primary[index].name.includes('Próximamente'));
    }
    const cards = await evaluate(`Array.from(document.querySelector('main section > div').children).map(item => ({ name: item.textContent, disabled: item.disabled === true, path: item.getAttribute('href') }))`);
    assert.equal(cards.length, primary.length, module.id);
    cards.forEach((card, index) => {
      assert.ok(card.name.startsWith(module.links[index].name));
      assert.equal(card.disabled, primary[index].disabled);
      assert.equal(card.path, primary[index].path);
    });
    for (const link of module.secondaryLinks ?? []) {
      if (link.path) {
        // The specialized Treasury cover exposes movements through Caja/Bancos,
        // rather than rendering ModuleOverviewPage's secondary-link grid.
        const secondaryContext = module.id === 'tesoreria' && link.path === '/caja-bancos/movimientos' ? '/caja-bancos' : `/${module.id}`;
        let treasuryBefore;
        if (secondaryContext !== `/${module.id}`) {
          // Empty accounts intentionally hide navigation that is not useful yet.
          // Seed only this isolated browser profile, then restore it immediately.
          treasuryBefore = await evaluate("localStorage.getItem('erp_treasury_v1')");
          const ledger = { version: 2, accounts: [{ id: 'smoke-account', code: 'SMOKE', name: 'Cuenta simulada de prueba', type: 'CAJA', currency: 'PEN', active: true, openingMinor: 0, openedAt: '2026-01-01', bankName: '', bankNumber: '', holderName: '', responsibleName: '', revision: 0 }], operations: [], applications: [], movements: [], locks: [] };
          await evaluate(`localStorage.setItem('erp_treasury_v1',${JSON.stringify(JSON.stringify(ledger))})`);
          await go(secondaryContext);
        }
        assert.ok(await evaluate(`Array.from(document.querySelectorAll('main a')).some(item => item.getAttribute('href') === ${JSON.stringify(link.path)})`));
        if (secondaryContext !== `/${module.id}`) {
          await evaluate(treasuryBefore === null ? "localStorage.removeItem('erp_treasury_v1')" : `localStorage.setItem('erp_treasury_v1',${JSON.stringify(treasuryBefore)})`);
          await go(`/${module.id}`);
        }
        assert.ok(!primary.some(item => item.name.startsWith(link.name)));
      } else {
        assert.ok(await evaluate(`Array.from(document.querySelectorAll('main button:disabled')).some(item => item.textContent.startsWith(${JSON.stringify(link.name)}) && item.textContent.includes('Próximamente'))`));
      }
    }
  }
  await go('/maestros');
  assert.equal(await evaluate('document.querySelectorAll("nav[aria-label=\\\"Módulos ERP\\\"] > div").length'), 12);
  await evaluate('document.querySelector("button[aria-controls=\\\"nav-logistica\\\"]").click()');
  await waitFor('document.querySelector("#nav-logistica a")');
  await evaluate('document.querySelector("#nav-logistica a").click()');
  await waitFor('location.pathname === "/despachos"');
  await waitFor('document.body.innerText.includes("Nuevo despacho")');
  await evaluate('document.querySelector("#nav-logistica a[href=\\\"/logistica\\\"]").click()');
  await waitFor('location.pathname === "/logistica"');
  await waitFor('document.body.innerText.includes("Operaciones de este navegador")');
  await evaluate('document.querySelector("button[aria-label=\\\"Cambiar modo oscuro\\\"]").click()');
  assert.ok(await evaluate('document.documentElement.classList.contains("dark")'));
  await go('/maestros/productos');
  assert.ok(await evaluate('document.documentElement.classList.contains("dark")'));
  await waitFor('document.body.innerText.includes("ALVA-001")');
  await evaluate('document.querySelector("button[aria-label=\\\"Editar ALVA-001\\\"]").click()');
  await waitFor('document.querySelector("[role=dialog]")');
  assert.ok(await evaluate('[...document.querySelectorAll("[role=dialog] input")].some(input => input.value === "ALVA-001")'));
  await go('/clientes');
  await waitFor('document.body.innerText.includes("Entidad local de prueba")');
  await evaluate('[...document.querySelectorAll("button")].find(button => button.innerText.includes("Nuevo Cliente")).click()');
  await waitFor('document.querySelector("[aria-label=\\\"Formulario de cliente\\\"]")');
  await go('/cotizaciones');
  await evaluate('[...document.querySelectorAll("button")].find(button => button.innerText.includes("Nueva Cotización")).click()');
  await evaluate('[...document.querySelectorAll("button")].find(button => button.innerText.includes("Agregar Ítem")).click()');
  await waitFor('document.querySelector("select[aria-label=\\\"Producto de la cotización\\\"] option[value=\\\"product-1\\\"]")');
  await evaluate('(() => { const select = document.querySelector("select[aria-label=\\\"Producto de la cotización\\\"]"); select.value = "product-1"; select.dispatchEvent(new Event("change", { bubbles: true })); })()');
  await waitFor('document.body.innerText.includes("Bolsa de prueba local")');
  await go('/maestros/locales');
  const catalog = JSON.stringify({ productos: [{ id: 'one', codigo: 'DUP' }, { id: 'two', codigo: 'dup' }], vendedores: [] });
  await evaluate(`localStorage.setItem('erp_maestros_tech_data_v2', ${JSON.stringify(catalog)})`);
  await go('/maestros/locales');
  assert.ok(await evaluate('document.body.innerText.includes("Posibles duplicados sin modificar")'));
  assert.equal(await evaluate('localStorage.getItem("erp_maestros_tech_data_v2")'), catalog);
  await go('/maestros');
  const desktop = await command('Page.captureScreenshot', { format: 'png' });
  await (await import('node:fs/promises')).writeFile(resolve(artifacts, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await go('/maestros');
  await pause(350);
  assert.ok(await evaluate('document.querySelector("aside").getBoundingClientRect().right <= 1'));
  assert.ok(await evaluate('document.querySelector("main").getBoundingClientRect().width <= 390'));
  await evaluate('document.querySelector("button[aria-label=\\\"Abrir menú\\\"]").click()');
  await pause(350);
  assert.ok(await evaluate('document.querySelector("aside").getBoundingClientRect().left >= -1'));
  await evaluate('document.querySelector("#nav-maestros a[href=\\\"/clientes\\\"]").click()');
  await waitFor('location.pathname === "/clientes"');
  await pause(350);
  assert.ok(await evaluate('document.querySelector("aside").getBoundingClientRect().right <= 1'));
  await go('/facturacion');
  const history = JSON.stringify([{ id: 'OV-A', cliente: 'Local', total: 10 }, { id: 'OV-B', cliente: 'Local', total: 10 }]);
  await evaluate(`localStorage.setItem('erp_ordenes_venta', ${JSON.stringify(history)})`);
  await go('/facturacion');
  assert.equal(await evaluate('localStorage.getItem("erp_ordenes_venta")'), history);
  assert.ok(await evaluate('document.body.innerText.includes("no se eliminaron ni fusionaron")'));
  assert.deepEqual(writes, [], 'No remote writes attempted; all remote requests intercepted');
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await (await import('node:fs/promises')).writeFile(resolve(artifacts, 'mobile-dark.png'), Buffer.from(screenshot.data, 'base64'));
  console.log(`PASS: ${legacyRoutes.length} legacy routes, 12 module entries, daily menu/cover selection, secondary links, disabled future options, submenus, shared product/party forms, mobile drawer, persistent dark mode, non-destructive local history. All remote requests intercepted; zero writes.`);
} finally {
  ws?.close();
  child.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
