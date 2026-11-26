// Servidor do MVP: entrega o site e verifica login e permissões. Node 18+, sem dependências.
// Uso: node server.js  (PORT, SESSION_SECRET, QR_SECRET, COOKIE_SECURE=1 por variável de ambiente)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = __dirname;
const USERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/usuarios.json'), 'utf8'));
// Sem SESSION_SECRET, as sessões caem quando o servidor reinicia (aceitável na demonstração).
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// O QR impresso na mesa precisa sobreviver a reinícios: em produção, QR_SECRET é obrigatório.
const QR_SECRET = process.env.QR_SECRET || 'demo-qr-secret-troque-em-producao';
if (!process.env.QR_SECRET) console.warn('[aviso] QR_SECRET não definido: usando segredo de demonstração.');
const SESSION_H = 10; // turno longo
const COOKIE = 'bf_sessao';

/* mesas: mesma regra do index.html (makeTables) */
const SALOES = [['I', 20, ['G', 'H']], ['P', 30, ['D', 'E', 'F']], ['S', 40, ['A', 'B', 'C']]];
const MESAS = {};
for (const [k, n, pr] of SALOES) for (let i = 0; i < n; i++) MESAS[k + String(i + 1).padStart(2, '0')] = pr[Math.floor(i * pr.length / n)];
const ESTADOS = ['livre', 'ocupada', 'finalizando', 'aguardando', 'limpeza', 'reservada'];
const ACOES = ['pratos', 'grill', 'ungrill'];
const CHAMADOS = ['Bebida', 'Café', 'Sobremesa', 'Guardanapo', 'Gelo / limão', 'Chamar garçom'];

/* eventos em memória: shortcut: some ao reiniciar, trocar pela tabela `eventos` (docs/modelo-de-dados.sql) */
const eventos = [];
function registra(ev) { ev.horario = new Date().toISOString(); eventos.unshift(ev); eventos.length = Math.min(eventos.length, 500); return ev; }

const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function assinaSessao(u) {
  const p = Buffer.from(JSON.stringify({ m: u.matricula, exp: Date.now() + SESSION_H * 3600e3 })).toString('base64url');
  return p + '.' + hmac(SESSION_SECRET, p);
}
function leSessao(req) {
  const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  if (!c) return null;
  const [p, sig] = c.slice(COOKIE.length + 1).split('.');
  if (!p || !sig || !igual(sig, hmac(SESSION_SECRET, p))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (d.exp < Date.now()) return null;
    return USERS.find(u => u.matricula === d.m) || null; // perfil vem sempre do cadastro, nunca do cliente
  } catch { return null; }
}
const publico = u => ({ matricula: u.matricula, nome: u.nome, perfil: u.perfil, praca: u.praca });
const tokenMesa = m => m + '.' + hmac(QR_SECRET, 'mesa:' + m).slice(0, 16);
function mesaDoToken(t) { const [m, s] = String(t || '').split('.'); return MESAS[m] && s && igual(s, tokenMesa(m).split('.')[1]) ? m : null; }

/* limite de tentativas de login por IP: 5 erros em 5 min */
const falhas = new Map();
function bloqueado(ip) { const f = falhas.get(ip); return f && f.n >= 5 && Date.now() - f.t < 5 * 60e3; }
function falhou(ip) { const f = falhas.get(ip); falhas.set(ip, f && Date.now() - f.t < 5 * 60e3 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); }

function json(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function corpo(req) {
  return new Promise((ok, erro) => {
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return erro(415); // barra POST de formulário de outro site
    let s = ''; req.on('data', c => { s += c; if (s.length > 10e3) { erro(413); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { erro(400); } });
  });
}
function exige(res, u, perfis) {
  if (!u) { json(res, 401, { erro: 'Sessão expirada. Entre novamente.' }); return false; }
  if (!perfis.includes(u.perfil)) { json(res, 403, { erro: 'Seu perfil não tem permissão para esta ação.' }); return false; }
  return true;
}

async function api(req, res, url) {
  const u = leSessao(req), r = req.method + ' ' + url.pathname;
  const ip = req.socket.remoteAddress;

  if (r === 'POST /api/login') {
    if (bloqueado(ip)) return json(res, 429, { erro: 'Muitas tentativas. Aguarde 5 minutos.' });
    const b = await corpo(req);
    const user = USERS.find(x => x.matricula === String(b.matricula || '').trim());
    const hash = crypto.scryptSync(String(b.senha || ''), user ? user.salt : 'x', 32).toString('hex'); // calcula sempre: não revela se a matrícula existe pelo tempo
    if (!user || !igual(hash, user.hash)) { falhou(ip); return json(res, 401, { erro: 'Matrícula ou senha incorretas.' }); }
    if (b.perfil && b.perfil !== user.perfil) return json(res, 403, { erro: 'Esta matrícula não tem acesso a este perfil.' });
    falhas.delete(ip);
    registra({ tipo: 'login', matricula: user.matricula, perfil: user.perfil });
    const sec = process.env.COOKIE_SECURE ? '; Secure' : '';
    return json(res, 200, publico(user), { 'Set-Cookie': `${COOKIE}=${assinaSessao(user)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_H * 3600}${sec}` });
  }
  if (r === 'POST /api/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  if (r === 'GET /api/me') return u ? json(res, 200, publico(u)) : json(res, 401, { erro: 'Não autenticado.' });

  if (r === 'POST /api/acoes') {
    if (!exige(res, u, ['gerente'])) return;
    const b = await corpo(req);
    if (!ACOES.includes(b.acao)) return json(res, 400, { erro: 'Ação desconhecida.' });
    return json(res, 200, registra({ tipo: 'acao_confirmada', acao: b.acao, matricula: u.matricula }));
  }
  const mm = url.pathname.match(/^\/api\/mesas\/([A-Z]\d{2})\/estado$/);
  if (mm && req.method === 'POST') {
    if (!exige(res, u, ['gerente', 'garcom'])) return;
    const mesa = mm[1], b = await corpo(req);
    if (!MESAS[mesa]) return json(res, 404, { erro: 'Mesa não existe.' });
    if (!ESTADOS.includes(b.estado)) return json(res, 400, { erro: 'Estado inválido.' });
    if (u.perfil === 'garcom' && MESAS[mesa] !== u.praca) return json(res, 403, { erro: 'Esta mesa é de outra praça.' });
    return json(res, 200, registra({ tipo: 'mesa_estado', mesa, estado: b.estado, matricula: u.matricula }));
  }
  const mq = url.pathname.match(/^\/api\/qr\/([A-Z]\d{2})$/);
  if (mq && req.method === 'GET') {
    if (!exige(res, u, ['gerente'])) return;
    if (!MESAS[mq[1]]) return json(res, 404, { erro: 'Mesa não existe.' });
    return json(res, 200, { mesa: mq[1], token: tokenMesa(mq[1]) });
  }
  if (r === 'GET /api/mesa') {
    const mesa = mesaDoToken(url.searchParams.get('t'));
    return mesa ? json(res, 200, { mesa, praca: MESAS[mesa] }) : json(res, 404, { erro: 'QR code inválido. Peça ajuda ao garçom.' });
  }
  if (r === 'POST /api/chamados') {
    const b = await corpo(req), mesa = mesaDoToken(b.t);
    if (!mesa) return json(res, 404, { erro: 'QR code inválido. Peça ajuda ao garçom.' });
    if (!CHAMADOS.includes(b.tipo)) return json(res, 400, { erro: 'Pedido inválido.' });
    return json(res, 200, registra({ tipo: 'chamado', pedido: b.tipo, mesa, praca: MESAS[mesa], origem: 'qr_mesa' }));
  }
  if (r === 'GET /api/eventos') {
    if (!exige(res, u, ['gerente', 'diretoria'])) return;
    return json(res, 200, eventos.slice(0, 100));
  }
  json(res, 404, { erro: 'Rota não encontrada.' });
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.css': 'text/css', '.json': 'application/json', '.sql': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
function estatico(req, res, url) {
  let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(ROOT, p));
  // nunca servir o cadastro de usuários, o código do servidor, testes ou arquivos ocultos
  if (!f.startsWith(ROOT + path.sep) || /[\\/](server|tests|node_modules)[\\/]|[\\/]\.|server\.js$/.test(f.slice(ROOT.length)) || !TIPOS[path.extname(f)]) { res.writeHead(404); return res.end('Não encontrado'); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)], 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    res.end(d);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return estatico(req, res, url);
  api(req, res, url).catch(code => json(res, typeof code === 'number' ? code : 500, { erro: typeof code === 'number' ? 'Requisição inválida.' : 'Erro interno.' }));
});
if (require.main === module) server.listen(process.env.PORT || 8080, () => console.log('Bovinu\'s Flow em http://localhost:' + (process.env.PORT || 8080)));
module.exports = { server, tokenMesa, MESAS };
