'use strict';
// JSON Server fornece a API REST e persiste os objetos em db.json.
// O middleware acrescenta sessões, permissões e regras do domínio acadêmico.
const jsonServer = require('json-server');
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const app = jsonServer.create();
const arquivo = process.env.DB_FILE || path.join(__dirname, 'db.json');
if (!fs.existsSync(arquivo)) fs.copyFileSync(path.join(__dirname, 'db.seed.json'), arquivo);
const router = jsonServer.router(arquivo);
const db = router.db;
const sessoes = new Map();
const hashSenha = (senha, salt = randomBytes(16).toString('hex')) => ({ salt, senhaHash: scryptSync(senha, salt, 64).toString('hex') });
// As contas iniciais usam senha de demonstração; seu hash é criado na primeira execução.
db.get('usuarios').value().forEach(u => { if (u.senhaInicial) { Object.assign(u, hashSenha(u.senhaInicial)); delete u.senhaInicial; } });
db.write();
app.use(jsonServer.defaults({ static: path.join(__dirname, 'public'), logger: process.env.NODE_ENV !== 'test' }));
app.use(jsonServer.bodyParser);
const erro = (res, status, mensagem) => res.status(status).json({ mensagem });
const publico = u => { const { senhaHash, salt, senhaInicial, ...resto } = u; return resto; };
const agora = () => new Date().toISOString();
const idNovo = colecao => Math.max(0, ...db.get(colecao).value().map(x => Number(x.id))) + 1;
const buscar = (colecao, id) => db.get(colecao).find({ id: Number(id) }).value();
const agente = u => u.papel === 'agente';
const texto = (v, max = 150) => typeof v === 'string' ? v.trim().slice(0, max) : '';
function validarCliente(dados, ignorarId = 0) {
  if (!texto(dados.nome) || !/^\S+@\S+\.\S+$/.test(dados.email || '') || !texto(dados.rg) || !/^\d{11}$/.test(dados.cpf || '') || !texto(dados.endereco) || !texto(dados.profissao)) return 'Preencha nome, e-mail, RG, CPF com 11 dígitos, endereço e profissão.';
  if (!Array.isArray(dados.empregos) || dados.empregos.length > 3 || dados.empregos.some(e => !texto(e.entidade) || !Number.isFinite(Number(e.rendimento)) || Number(e.rendimento) <= 0)) return 'Informe até três empregadores com rendimento positivo.';
  if (db.get('usuarios').value().some(u => u.id !== ignorarId && (u.email.toLowerCase() === dados.email.trim().toLowerCase() || u.cpf && u.cpf === dados.cpf))) return 'E-mail ou CPF já cadastrado.';
  return '';
}
function dadosCliente(b) {
  return { nome: texto(b.nome), email: texto(b.email).toLowerCase(), rg: texto(b.rg, 30), cpf: texto(b.cpf, 11), endereco: texto(b.endereco, 250), profissao: texto(b.profissao), empregos: Array.isArray(b.empregos) ? b.empregos.map(e => ({ entidade: texto(e.entidade), rendimento: Number(e.rendimento) })) : [] };
}
function cadastrar(req, res) {
  const b = req.body; const mensagem = validarCliente(b);
  if (mensagem) return erro(res, 400, mensagem);
  if (typeof b.senha !== 'string' || b.senha.length < 6 || b.senha.length > 128) return erro(res, 400, 'A senha deve ter de 6 a 128 caracteres.');
  const u = { id: idNovo('usuarios'), ...dadosCliente(b), papel: 'cliente', tipoAgente: null, ...hashSenha(b.senha) };
  db.get('usuarios').push(u).write(); res.status(201).json(publico(u));
}
app.post('/api/auth/cadastro', cadastrar);
app.post('/api/auth/login', (req, res) => {
  const u = db.get('usuarios').value().find(u => u.email.toLowerCase() === texto(req.body.email).toLowerCase());
  const senha = req.body.senha;
  if (!u || typeof senha !== 'string' || senha.length > 128 || !timingSafeEqual(Buffer.from(u.senhaHash, 'hex'), scryptSync(senha, u.salt, 64))) return erro(res, 401, 'E-mail ou senha incorretos.');
  const token = randomBytes(32).toString('hex'); sessoes.set(token, { id: u.id, expira: Date.now() + 8 * 3600000 });
  res.json({ token, usuario: publico(u) });
});
app.use('/api', (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, ''); const sessao = sessoes.get(token);
  if (!sessao || sessao.expira < Date.now()) return erro(res, 401, 'Entre novamente para continuar.');
  req.usuario = buscar('usuarios', sessao.id); req.token = token;
  if (!req.usuario) return erro(res, 401, 'Conta não encontrada.'); next();
});
app.get('/api/auth/eu', (req, res) => res.json(publico(req.usuario)));
app.post('/api/auth/sair', (req, res) => { sessoes.delete(req.token); res.json({ mensagem: 'Sessão encerrada.' }); });
app.get('/api/usuarios', (req, res) => res.json(db.get('usuarios').value().filter(u => agente(req.usuario) || u.id === req.usuario.id || u.papel === 'agente' || db.get('veiculos').value().some(v => v.proprietarioId === u.id)).map(u => agente(req.usuario) || u.id === req.usuario.id ? publico(u) : ({ id: u.id, nome: u.nome, papel: u.papel, tipoAgente: u.tipoAgente }))));
app.get('/api/clientes', (req, res) => res.json(db.get('usuarios').value().filter(u => u.papel === 'cliente' && (agente(req.usuario) || u.id === req.usuario.id)).map(publico)));
app.post('/api/clientes', (req, res) => agente(req.usuario) ? cadastrar(req, res) : erro(res, 403, 'Apenas agentes cadastram outros clientes.'));
app.get('/api/clientes/:id', (req, res) => {
  const u = buscar('usuarios', req.params.id);
  if (!u || u.papel !== 'cliente') return erro(res, 404, 'Cliente não encontrado.');
  if (!agente(req.usuario) && req.usuario.id !== u.id) return erro(res, 403, 'Acesso não permitido.'); res.json(publico(u));
});
app.patch('/api/clientes/:id', (req, res) => {
  const u = buscar('usuarios', req.params.id);
  if (!u || u.papel !== 'cliente') return erro(res, 404, 'Cliente não encontrado.');
  if (!agente(req.usuario) && req.usuario.id !== u.id) return erro(res, 403, 'Acesso não permitido.');
  const b = { ...u, ...req.body }; const mensagem = validarCliente(b, u.id); if (mensagem) return erro(res, 400, mensagem);
  Object.assign(u, dadosCliente(b)); db.write(); res.json(publico(u));
});
app.delete('/api/clientes/:id', (req, res) => {
  const u = buscar('usuarios', req.params.id);
  if (!u || u.papel !== 'cliente') return erro(res, 404, 'Cliente não encontrado.');
  if (!agente(req.usuario) && req.usuario.id !== u.id) return erro(res, 403, 'Acesso não permitido.');
  if (db.get('pedidos').value().some(p => p.clienteId === u.id) || db.get('veiculos').value().some(v => v.proprietarioId === u.id)) return erro(res, 409, 'Não é possível excluir um cliente vinculado a pedidos ou veículos.');
  db.get('usuarios').remove({ id: u.id }).write(); for (const [token, sessao] of sessoes) if (sessao.id === u.id) sessoes.delete(token);
  res.json({ mensagem: 'Cliente excluído.' });
});
function validarPedido(b, pedidoId = null) {
  const v = buscar('veiculos', b.veiculoId); const c = buscar('usuarios', b.clienteId);
  if (!v || !c || c.papel !== 'cliente') return 'Veículo ou cliente inválido.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.inicio || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.fim || '') || !Number.isFinite(Date.parse(b.inicio)) || !Number.isFinite(Date.parse(b.fim)) || new Date(b.inicio).toISOString().slice(0, 10) !== b.inicio || new Date(b.fim).toISOString().slice(0, 10) !== b.fim || b.fim < b.inicio) return 'Informe um período válido, com devolução igual ou posterior à retirada.';
  if (b.inicio < new Date().toISOString().slice(0, 10)) return 'A retirada não pode estar no passado.';
  const banco = buscar('usuarios', b.bancoId);
  if (b.comCredito && (!banco || banco.tipoAgente !== 'banco' || !Number.isInteger(Number(b.parcelas)) || Number(b.parcelas) < 1 || Number(b.parcelas) > 60)) return 'Selecione um banco e de 1 a 60 parcelas.';
  const conflito = db.get('pedidos').value().some(p => p.id !== pedidoId && p.veiculoId === v.id && ['aprovado', 'contratado'].includes(p.status) && b.inicio <= p.fim && b.fim >= p.inicio);
  if (conflito) return 'O veículo já possui reserva aprovada neste período.';
  return '';
}
function dadosPedido(b) {
  const v = buscar('veiculos', b.veiculoId); const dias = Math.round((Date.parse(b.fim) - Date.parse(b.inicio)) / 86400000) + 1;
  return { clienteId: Number(b.clienteId), veiculoId: Number(b.veiculoId), inicio: b.inicio, fim: b.fim, dias, diaria: v.diaria, total: Math.round(dias * v.diaria * 100) / 100, comCredito: !!b.comCredito, bancoId: b.comCredito ? Number(b.bancoId) : null, parcelas: b.comCredito ? Number(b.parcelas) : null, observacoes: texto(b.observacoes, 1000) };
}
app.get('/api/pedidos', (req, res) => res.json(db.get('pedidos').value().filter(p => agente(req.usuario) || p.clienteId === req.usuario.id)));
app.post('/api/pedidos', (req, res) => {
  const b = { ...req.body, clienteId: agente(req.usuario) ? Number(req.body.clienteId) : req.usuario.id };
  const mensagem = validarPedido(b); if (mensagem) return erro(res, 400, mensagem);
  const p = { id: idNovo('pedidos'), ...dadosPedido(b), status: 'pendente', criadoEm: agora(), atualizadoEm: agora(), avaliacoes: [] };
  db.get('pedidos').push(p).write(); res.status(201).json(p);
});
app.patch('/api/pedidos/:id', (req, res) => {
  const p = buscar('pedidos', req.params.id); if (!p) return erro(res, 404, 'Pedido não encontrado.');
  if (!agente(req.usuario) && p.clienteId !== req.usuario.id) return erro(res, 403, 'Acesso não permitido.');
  if (['cancelado', 'contratado'].includes(p.status)) return erro(res, 409, 'Pedido encerrado não pode ser alterado.');
  const b = { ...p, ...req.body, clienteId: p.clienteId }; const mensagem = validarPedido(b, p.id); if (mensagem) return erro(res, 400, mensagem);
  // Alterar as condições invalida o parecer anterior e exige nova avaliação.
  Object.assign(p, dadosPedido(b), { status: 'pendente', atualizadoEm: agora() }); db.write(); res.json(p);
});
app.post('/api/pedidos/:id/cancelar', (req, res) => {
  const p = buscar('pedidos', req.params.id); if (!p) return erro(res, 404, 'Pedido não encontrado.');
  if (!agente(req.usuario) && p.clienteId !== req.usuario.id) return erro(res, 403, 'Acesso não permitido.');
  if (['contratado', 'cancelado'].includes(p.status)) return erro(res, 409, 'Pedido já contratado ou cancelado.');
  Object.assign(p, { status: 'cancelado', atualizadoEm: agora() }); db.write(); res.json(p);
});
app.post('/api/pedidos/:id/avaliar', (req, res) => {
  if (!agente(req.usuario)) return erro(res, 403, 'Apenas agentes avaliam pedidos.');
  const p = buscar('pedidos', req.params.id); if (!p) return erro(res, 404, 'Pedido não encontrado.');
  if (p.status !== 'pendente') return erro(res, 409, 'Apenas pedidos pendentes podem ser avaliados.');
  if (p.comCredito && (req.usuario.tipoAgente !== 'banco' || req.usuario.id !== p.bancoId)) return erro(res, 403, 'Pedidos com crédito devem ser avaliados pelo banco selecionado.');
  if (!['aprovado', 'reprovado'].includes(req.body.parecer) || !texto(req.body.justificativa, 1000)) return erro(res, 400, 'Informe parecer e justificativa.');
  if (req.body.parecer === 'aprovado') { const m = validarPedido(p, p.id); if (m) return erro(res, 409, m); }
  p.avaliacoes.push({ agenteId: req.usuario.id, parecer: req.body.parecer, justificativa: texto(req.body.justificativa, 1000), data: agora() });
  Object.assign(p, { status: req.body.parecer, atualizadoEm: agora() }); db.write(); res.json(p);
});
app.post('/api/pedidos/:id/contratar', (req, res) => {
  const p = buscar('pedidos', req.params.id); if (!p) return erro(res, 404, 'Pedido não encontrado.');
  if (!agente(req.usuario) && p.clienteId !== req.usuario.id) return erro(res, 403, 'Acesso não permitido.');
  if (p.status !== 'aprovado') return erro(res, 409, 'O contrato exige um pedido aprovado.');
  if (!req.body.aceite) return erro(res, 400, 'Confirme o aceite das condições.');
  const m = validarPedido(p, p.id); if (m) return erro(res, 409, m);
  const v = buscar('veiculos', p.veiculoId);
  const c = { id: idNovo('contratos'), numero: `LOC-${String(idNovo('contratos')).padStart(5, '0')}`, pedidoId: p.id, clienteId: p.clienteId, veiculoId: p.veiculoId, proprietarioId: v.proprietarioId, tipoProprietario: v.tipoProprietario, inicio: p.inicio, fim: p.fim, valor: p.total, criadoEm: agora(), aceitePor: req.usuario.id, status: 'ativo' };
  db.get('contratos').push(c).value();
  if (p.comCredito) db.get('creditos').push({ id: idNovo('creditos'), contratoId: c.id, bancoId: p.bancoId, valor: p.total, parcelas: p.parcelas, valorParcela: Math.round(p.total / p.parcelas * 100) / 100, observacao: 'Simulação acadêmica sem juros; eventual diferença de centavos é ajustada na última parcela.' }).value();
  p.status = 'contratado'; p.atualizadoEm = agora(); db.write(); res.status(201).json(c);
});
// Leituras de catálogo e contratos passam pelo router REST do JSON Server.
app.use('/api', (req, res, next) => {
  const colecao = req.path.split('/')[1];
  if (req.method !== 'GET' || !['veiculos', 'contratos', 'creditos'].includes(colecao) || req.path.split('/').filter(Boolean).length > 2) return erro(res, 404, 'Rota não disponível.');
  const registros = db.get(colecao).value(); const id = req.path.split('/')[2];
  if (id && !buscar(colecao, id)) return erro(res, 404, 'Registro não encontrado.');
  if (!agente(req.usuario) && colecao !== 'veiculos') {
    const visiveis = colecao === 'contratos' ? registros.filter(c => c.clienteId === req.usuario.id) : registros.filter(c => buscar('contratos', c.contratoId)?.clienteId === req.usuario.id);
    return id ? (visiveis.some(x => x.id === Number(id)) ? res.json(visiveis.find(x => x.id === Number(id))) : erro(res, 403, 'Acesso não permitido.')) : res.json(visiveis);
  }
  next();
});
app.use('/api', router);
// Impede acesso ao db.json bruto ou à rota /db do JSON Server fora da API.
app.use((req, res) => erro(res, 404, 'Página não encontrada.'));
app.use((err, req, res, next) => { console.error(err.message); erro(res, 500, 'Não foi possível concluir a operação.'); });
if (require.main === module) app.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => console.log('Locavia: http://localhost:' + (process.env.PORT || 3000)));
module.exports = { app };
