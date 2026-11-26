// Teste de ponta a ponta no navegador. Requer Playwright instalado e o servidor rodando:
//   node server.js &  BASE=http://localhost:8080 node tests/e2e.mjs
// Sem servidor (site estático), use STATIC=1 com BASE apontando para um servidor de arquivos.
import { createRequire } from 'module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8080', STATIC = !!process.env.STATIC, SHOTS = process.env.SHOTS;
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('ok -', m); };
const browser = await chromium.launch();
const erros = [];
async function pagina(opts = {}) {
  const ctx = await browser.newContext(opts), p = await ctx.newPage();
  p.on('pageerror', e => erros.push(e.message));
  return p;
}
async function entrar(p, perfil, mat) {
  await p.goto(BASE + '/#login/' + perfil);
  if (!STATIC) { await p.fill('#l-mat', mat); await p.fill('#l-senha', 'bovinus2026'); }
  await p.click('#l-btn');
}

// 1. rota protegida sem login volta para a tela inicial
let p = await pagina();
await p.goto(BASE + '/#gerente');
await p.waitForSelector('#v-inicio:not([hidden])');
ok(await p.locator('.pcard').count() === 4, 'tela inicial mostra 3 perfis + cliente');
if (SHOTS) await p.screenshot({ path: SHOTS + '/1-inicio.png' });

// 2. gerente: login, 3 níveis, só as páginas dele
if (!STATIC) {
  await p.goto(BASE + '/#login/gerente');
  await p.fill('#l-mat', '1001'); await p.fill('#l-senha', 'errada'); await p.click('#l-btn');
  await p.waitForSelector('#l-err:not([hidden])');
  ok(/incorretas/.test(await p.textContent('#l-err')), 'senha errada mostra erro');
}
await entrar(p, 'gerente', '1001');
await p.waitForSelector('#v-gerente:not([hidden])');
ok(await p.locator('#g-kpis .card').count() === 6, 'nível 1 com 6 indicadores');
ok(await p.locator('#g-attn').isVisible() && await p.locator('#g-alerts').isVisible(), 'níveis 2 e 3 visíveis');
const nav = await p.locator('#tabs a').allTextContents();
ok(!nav.join().includes('Visão estratégica') && !nav.join().includes('Minha praça'), 'gerente não vê diretoria nem garçom no menu');
await p.goto(BASE + '/#diretoria'); await p.waitForTimeout(200);
ok(p.url().endsWith('#gerente'), 'gerente que digita #diretoria volta para o painel');
// confirma uma ação, se houver
await p.click('#play'); await p.waitForTimeout(2500); await p.click('#play');
const btn = p.locator('[data-act]').first();
if (await btn.count()) { await btn.click(); await p.waitForSelector('#toast:not([hidden])'); ok(/confirmada/.test(await p.textContent('#toast')), 'ação do gerente confirmada'); }
if (SHOTS) await p.screenshot({ path: SHOTS + '/2-gerente.png', fullPage: true });
await p.goto(BASE + '/#cliente'); await p.click('#f-qr button');
await p.waitForSelector('#qr-out a');
const qrUrl = await p.getAttribute('#qr-out a', 'href');
ok(/#mesa\/P12/.test(qrUrl), 'gerente gera QR da mesa P12');
await p.click('#logout'); await p.waitForSelector('#v-inicio:not([hidden])');
await p.goto(BASE + '/#gerente'); await p.waitForTimeout(300);
ok(p.url().endsWith('#inicio'), 'depois do logout a rota protegida volta ao início');

// 3. diretoria
p = await pagina();
await entrar(p, 'diretoria', '2001');
await p.waitForSelector('#v-diretoria:not([hidden])');
ok(await p.locator('#d-kpis .card').count() === 5, 'diretoria com KPIs');
ok(!(await p.locator('.simctl').first().isVisible()), 'diretoria não vê controles da simulação');
await p.click('[data-per="mes"]'); ok(/30 dias/.test(await p.textContent('#d-title')), 'filtro de período funciona');
if (SHOTS) await p.screenshot({ path: SHOTS + '/3-diretoria.png', fullPage: true });

// 4. garçom no celular
p = await pagina({ ...devices['iPhone 13'] });
await entrar(p, 'garcom', '3002');
await p.waitForSelector('#v-garcom:not([hidden])');
const largura = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
ok(largura, 'garçom sem rolagem horizontal no celular');
ok(await p.locator('.mine .tb').count() > 0, 'garçom vê as mesas da praça');
if (!STATIC) ok(/Praça B · Ana/.test(await p.textContent('#waiter')), 'garçom vê o próprio nome e praça');
const mesa = p.locator('.mine .tb').first(); const antes = await mesa.getAttribute('class');
await mesa.click(); await p.waitForTimeout(300);
ok(antes !== await p.locator('.mine .tb').first().getAttribute('class'), 'garçom muda o estado da mesa');
if (SHOTS) await p.screenshot({ path: SHOTS + '/4-garcom.png', fullPage: true });

// 5. cliente pelo QR (sem login)
p = await pagina({ ...devices['iPhone 13'] });
await p.goto(STATIC ? BASE + '/#mesa/P12' : qrUrl.replace(/^https?:\/\/[^/]+/, BASE));
await p.waitForSelector('#v-mesa:not([hidden])');
ok(/Mesa P12/.test(await p.textContent('#mesa')), 'QR identifica a mesa');
await p.click('[data-pedir="Café"]'); await p.waitForSelector('#toast:not([hidden])');
ok(/Pedido enviado/.test(await p.textContent('#toast')), 'cliente faz pedido pelo QR');
if (SHOTS) await p.screenshot({ path: SHOTS + '/5-cliente.png', fullPage: true });
if (!STATIC) {
  await p.goto(BASE + '/#mesa/P12.falso'); await p.waitForTimeout(300);
  ok(/não reconhecido/.test(await p.textContent('#mesa')), 'QR adulterado é recusado');
}
ok(!erros.length, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
await browser.close();
