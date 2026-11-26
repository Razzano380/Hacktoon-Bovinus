// node --test tests/   (sem dependências)
const test = require('node:test'), assert = require('node:assert');
const { server, tokenMesa } = require('../server.js');

let base;
test.before(() => new Promise(ok => server.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; ok(); })));
test.after(() => server.close());

async function req(path, body, cookie) {
  const r = await fetch(base + path, body === undefined ? { headers: { cookie: cookie || '' } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const login = (matricula, perfil) => req('/api/login', { matricula, senha: 'bovinus2026', perfil });

test('login certo devolve perfil do cadastro e cookie HttpOnly', async () => {
  const r = await login('1001', 'gerente');
  assert.equal(r.status, 200);
  assert.equal(r.data.perfil, 'gerente');
  assert.equal(r.data.hash, undefined);
  assert.match(r.cookie, /^bf_sessao=/);
  assert.equal((await req('/api/me', undefined, r.cookie)).data.matricula, '1001');
});

test('senha errada e matrícula inexistente dão a mesma resposta', async () => {
  const a = await req('/api/login', { matricula: '1001', senha: 'x' }), b = await req('/api/login', { matricula: '9999', senha: 'x' });
  assert.equal(a.status, 401); assert.deepEqual(a.data, b.data);
});

test('escolher outro perfil não dá permissão', async () => {
  assert.equal((await login('3002', 'gerente')).status, 403);
});

test('cookie adulterado é recusado', async () => {
  const r = await login('3002', 'garcom');
  const [p, sig] = r.cookie.slice('bf_sessao='.length).split('.');
  const forjado = Buffer.from(JSON.stringify({ m: '1001', exp: Date.now() + 1e6 })).toString('base64url');
  assert.equal((await req('/api/me', undefined, 'bf_sessao=' + forjado + '.' + sig)).status, 401);
  assert.equal((await req('/api/me', undefined, 'bf_sessao=' + p + '.' + sig)).status, 200);
});

test('ações do gerente: garçom e diretoria recebem 403, sem sessão 401', async () => {
  const g = await login('1001'), w = await login('3002'), d = await login('2001');
  assert.equal((await req('/api/acoes', { acao: 'grill' }, g.cookie)).status, 200);
  assert.equal((await req('/api/acoes', { acao: 'grill' }, w.cookie)).status, 403);
  assert.equal((await req('/api/acoes', { acao: 'grill' }, d.cookie)).status, 403);
  assert.equal((await req('/api/acoes', { acao: 'grill' })).status, 401);
  assert.equal((await req('/api/acoes', { acao: 'apagar_tudo' }, g.cookie)).status, 400);
});

test('garçom só muda mesa da própria praça', async () => {
  const w = await login('3002'); // Ana, praça B
  const mesaB = 'S' + String(15).padStart(2, '0'), mesaA = 'S01';
  assert.equal((await req(`/api/mesas/${mesaB}/estado`, { estado: 'livre' }, w.cookie)).status, 200);
  assert.equal((await req(`/api/mesas/${mesaA}/estado`, { estado: 'livre' }, w.cookie)).status, 403);
  assert.equal((await req(`/api/mesas/${mesaB}/estado`, { estado: 'hackeada' }, w.cookie)).status, 400);
});

test('QR da mesa: token assinado vale, token trocado não', async () => {
  const t = tokenMesa('P12');
  assert.equal((await req('/api/mesa?t=' + t)).data.mesa, 'P12');
  assert.equal((await req('/api/mesa?t=' + t.replace('P12', 'P13'))).status, 404);
  assert.equal((await req('/api/mesa?t=P12')).status, 404);
  assert.equal((await req('/api/chamados', { t, tipo: 'Café' })).status, 200);
  assert.equal((await req('/api/chamados', { t, tipo: '<script>' })).status, 400);
});

test('só o gerente gera QR', async () => {
  const g = await login('1001'), w = await login('3002');
  assert.equal((await req('/api/qr/P12', undefined, g.cookie)).data.token, tokenMesa('P12'));
  assert.equal((await req('/api/qr/P12', undefined, w.cookie)).status, 403);
});

test('POST sem JSON é recusado (proteção contra formulário de outro site)', async () => {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'matricula=1001&senha=bovinus2026' });
  assert.equal(r.status, 415);
});

test('arquivos internos não são servidos', async () => {
  for (const p of ['/server/usuarios.json', '/server.js', '/tests/api.test.js', '/.git/config']) assert.equal((await fetch(base + p)).status, 404, p);
  assert.equal((await fetch(base + '/')).status, 200);
});

test('limite de tentativas de login', async () => {
  // roda por último: bloqueia o IP local por 5 minutos
  for (let i = 0; i < 5; i++) await req('/api/login', { matricula: '1001', senha: 'errada' });
  assert.equal((await login('1001')).status, 429);
});
