'use strict';
// Estado da interface. Os registros sempre vêm da API, não de localStorage.
const estado = { token: sessionStorage.getItem('locavia-token'), usuario: null, veiculos: [], usuarios: [], pedidos: [], contratos: [], creditos: [], carregamento: 0 };
const $ = seletor => document.querySelector(seletor);
const moeda = valor => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
const dataBR = valor => valor ? new Date(valor.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const agente = () => estado.usuario?.papel === 'agente';
const veiculo = id => estado.veiculos.find(v => v.id === id);
const usuario = id => estado.usuarios.find(u => u.id === id);
const nomeCarro = id => { const v = veiculo(id); return v ? `${v.marca} ${v.modelo}` : 'Veículo removido'; };
const statusHTML = status => `<span class="badge-status ${escapar(status)}">${escapar({ pendente: 'Em análise', aprovado: 'Aprovado', reprovado: 'Reprovado', cancelado: 'Cancelado', contratado: 'Contratado', ativo: 'Ativo' }[status] || status)}</span>`;
let timerAviso;
function avisar(mensagem, erro = false) { clearTimeout(timerAviso); $('#aviso').innerHTML = `<div class="toast-app ${erro ? 'erro' : ''}">${escapar(mensagem)}</div>`; timerAviso = setTimeout(() => $('#aviso').replaceChildren(), 6000); }
// Todas as operações HTTP passam por esta função, com tratamento de erro e sessão.
async function api(caminho, metodo = 'GET', dados) {
  const resposta = await fetch('/api' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...(estado.token ? { Authorization: 'Bearer ' + estado.token } : {}) }, ...(dados ? { body: JSON.stringify(dados) } : {}) });
  const resultado = await resposta.json();
  if (!resposta.ok) {
    if (resposta.status === 401 && caminho !== '/auth/login') encerrarSessao();
    throw new Error(resultado.mensagem || 'Não foi possível concluir.');
  }
  return resultado;
}
function encerrarSessao() { estado.token = null; estado.usuario = null; sessionStorage.removeItem('locavia-token'); estado.carregamento++; mostrarAcesso(); }
function mostrarAcesso() { $('#sistema').hidden = true; $('#acesso').hidden = false; $('#usuario-barra').innerHTML = '<span class="small muted">Seu próximo caminho começa aqui.</span>'; }
async function carregarDados() {
  const [vs, us, ps, cs, crs] = await Promise.all(['/veiculos', '/usuarios', '/pedidos', '/contratos', '/creditos'].map(p => api(p)));
  Object.assign(estado, { veiculos: vs, usuarios: us, pedidos: ps, contratos: cs, creditos: crs });
}
async function entrar(email, senha) {
  const dados = await api('/auth/login', 'POST', { email, senha });
  estado.token = dados.token; estado.usuario = dados.usuario; sessionStorage.setItem('locavia-token', dados.token);
  await iniciar();
}
async function iniciar() {
  await carregarDados(); $('#acesso').hidden = true; $('#sistema').hidden = false;
  $('#usuario-barra').innerHTML = `<div><strong class="small">${escapar(estado.usuario.nome)}</strong><div class="muted" style="font-size:11px">${agente() ? (estado.usuario.tipoAgente === 'banco' ? 'Agente bancário' : 'Agente da empresa') : 'Cliente'}</div></div><button id="sair" class="btn btn-outline-light btn-sm">Sair</button>`;
  $('#titulo-menu-cliente').textContent = agente() ? 'Clientes' : 'Meu cadastro';
  $('#sair').onclick = async () => { try { await api('/auth/sair', 'POST'); } finally { encerrarSessao(); } };
  if (!['#inicio', '#veiculos', '#pedidos', '#contratos', '#clientes'].includes(location.hash)) location.hash = 'inicio';
  await renderizar();
}
function botaoAcao(texto, acao, id, estilo = 'btn-outline-light') { return `<button class="btn ${estilo} btn-sm" data-acao="${acao}" data-id="${id}">${texto}</button>`; }
function tabelaPedidos(pedidos, reduzida = false) {
  if (!pedidos.length) return '<div class="empty">Nenhum pedido por aqui ainda. Escolha um veículo para começar.</div>';
  return `<div class="table-responsive"><table class="table mb-0"><thead><tr><th>Pedido / Veículo</th>${agente() ? '<th>Cliente</th>' : ''}<th>Período</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>${pedidos.map(p => `<tr><td><strong>#${String(p.id).padStart(3, '0')} · ${escapar(nomeCarro(p.veiculoId))}</strong><br><small class="muted">${p.comCredito ? 'Com crédito bancário' : 'Pagamento direto'}</small></td>${agente() ? `<td>${escapar(usuario(p.clienteId)?.nome)}</td>` : ''}<td>${dataBR(p.inicio)}<br><span class="muted">até ${dataBR(p.fim)}</span></td><td>${moeda(p.total)}</td><td>${statusHTML(p.status)}</td><td><div class="acoes">${botaoAcao('Detalhes', 'detalhes', p.id)}${!reduzida && !['cancelado', 'contratado'].includes(p.status) ? botaoAcao('Editar', 'editar-pedido', p.id) + botaoAcao('Cancelar', 'cancelar', p.id) : ''}${!reduzida && agente() && p.status === 'pendente' && (!p.comCredito || estado.usuario.id === p.bancoId) ? botaoAcao('Avaliar', 'avaliar', p.id, 'btn-primary') : ''}${!reduzida && p.status === 'aprovado' ? botaoAcao('Contratar', 'contratar', p.id, 'btn-primary') : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function cabecalho(titulo, descricao, acao = '') { $('#page-title').textContent = titulo; $('#page-subtitle').textContent = descricao; $('#page-actions').innerHTML = acao; }
// Cada tela é montada a partir dos dados atualizados do JSON Server.
async function renderizar() {
  if (!estado.usuario) return;
  const pagina = location.hash.slice(1) || 'inicio'; const carga = ++estado.carregamento;
  $('#pagina').innerHTML = '<p class="muted">Carregando…</p>';
  try { await carregarDados(); if (carga !== estado.carregamento || !estado.usuario) return;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('ativo', a.dataset.nav === pagina));
    if (pagina === 'veiculos') renderVeiculos();
    else if (pagina === 'pedidos') renderPedidos();
    else if (pagina === 'clientes') renderClientes();
    else if (pagina === 'contratos') renderContratos();
    else renderInicio();
  } catch (e) { $('#pagina').innerHTML = `<div class="painel"><p>${escapar(e.message)}</p><button class="btn btn-primary" data-acao="recarregar">Tentar novamente</button></div>`; }
}
function renderInicio() {
  cabecalho(`Olá, ${estado.usuario.nome.split(' ')[0]}.`, agente() ? 'Acompanhe solicitações, avalie pedidos e organize os contratos.' : 'Acompanhe sua próxima viagem e encontre o carro ideal.', '<a class="btn btn-primary" href="#veiculos">Explorar veículos ↗</a>');
  const estatisticas = [['Pedidos', estado.pedidos.length, 'Todos os pedidos'], ['Em análise', estado.pedidos.filter(p => p.status === 'pendente').length, 'Aguardando parecer'], ['Aprovados', estado.pedidos.filter(p => p.status === 'aprovado').length, 'Prontos para contratar'], ['Contratos', estado.contratos.length, 'Contratos registrados']];
  $('#pagina').innerHTML = `<div class="stats">${estatisticas.map(([t, n, ajuda]) => `<div class="stat"><p>${t}</p><strong>${n.toString().padStart(2, '0')}</strong><small>${ajuda}</small></div>`).join('')}</div><div class="painel mb-4"><div class="d-flex justify-content-between gap-3"><h2 class="section-label">Pedidos recentes</h2><a class="small" href="#pedidos">Ver todos →</a></div>${tabelaPedidos([...estado.pedidos].reverse().slice(0, 4), true)}</div><div class="row g-4"><div class="col-md-7"><div class="painel h-100"><p class="eyebrow">DO PEDIDO À CHAVE</p><h2 class="section-label">Tudo em seu tempo.</h2><p class="muted mb-0">Selecione um veículo e informe o período. Um agente faz a avaliação financeira. Com a aprovação, você confere as condições e confirma o contrato.</p></div></div><div class="col-md-5"><div class="painel h-100"><h2 class="section-label">Sua conta</h2><p class="muted">Mantenha seus dados e rendimentos atualizados para a análise.</p><a href="#clientes">${agente() ? 'Consultar clientes' : 'Revisar meu cadastro'} →</a></div></div></div>`;
}
function renderVeiculos() {
  cabecalho('Encontre seu próximo carro', 'Escolha a categoria e confira as condições antes de solicitar.');
  $('#pagina').innerHTML = '<div class="filtro-barra"><input id="busca-carro" class="form-control" placeholder="Buscar marca ou modelo" aria-label="Buscar veículo"><select id="categoria" class="form-select" aria-label="Categoria"><option value="">Todas as categorias</option>' + [...new Set(estado.veiculos.map(v => v.categoria))].map(c => `<option>${escapar(c)}</option>`).join('') + '</select></div><div id="catalogo" class="row g-4"></div>';
  const filtrar = () => {
    const busca = $('#busca-carro').value.toLowerCase(); const categoria = $('#categoria').value;
    const vs = estado.veiculos.filter(v => `${v.marca} ${v.modelo}`.toLowerCase().includes(busca) && (!categoria || v.categoria === categoria));
    $('#catalogo').innerHTML = vs.length ? vs.map(v => `<div class="col-md-6 col-xl-4"><article class="painel veiculo-card"><img src="${escapar(v.imagem)}" alt="Foto de referência de ${escapar(v.marca)} ${escapar(v.modelo)}"><div class="veiculo-info"><p class="eyebrow mb-2">${escapar(v.categoria)}</p><h2>${escapar(v.marca)} ${escapar(v.modelo)}</h2><div class="chips"><span>${v.ano}</span><span>${escapar(v.placa)}</span><span>${escapar(v.tipoProprietario)}</span></div><p class="preco">${moeda(v.diaria)} <small>/ diária</small></p><button class="btn btn-primary w-100" data-acao="novo-pedido" data-id="${v.id}">Solicitar aluguel ↗</button></div></article></div>`).join('') : '<p class="empty">Nenhum veículo encontrado.</p>';
  }; $('#busca-carro').oninput = filtrar; $('#categoria').onchange = filtrar; filtrar();
}
function renderPedidos() {
  cabecalho('Pedidos de aluguel', 'Consulte o andamento, altere condições ou acompanhe o parecer.', '<a class="btn btn-primary" href="#veiculos">Novo pedido +</a>');
  $('#pagina').innerHTML = `<div class="filtro-barra"><select id="filtro-status" class="form-select" aria-label="Filtrar por status"><option value="">Todos os status</option>${['pendente', 'aprovado', 'reprovado', 'contratado', 'cancelado'].map(s => `<option value="${s}">${s === 'pendente' ? 'Em análise' : s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select></div><div class="painel" id="lista-pedidos"></div>`;
  const filtrar = () => $('#lista-pedidos').innerHTML = tabelaPedidos([...estado.pedidos].reverse().filter(p => !$('#filtro-status').value || p.status === $('#filtro-status').value));
  $('#filtro-status').onchange = filtrar; filtrar();
}
function renderClientes() {
  const cs = estado.usuarios.filter(u => u.papel === 'cliente');
  cabecalho(agente() ? 'Clientes' : 'Meu cadastro', 'Identificação, profissão e até três vínculos de renda.', agente() ? '<button class="btn btn-primary" data-acao="novo-cliente">Cadastrar cliente +</button>' : '');
  $('#pagina').innerHTML = `<div class="painel">${cs.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Nome / E-mail</th><th>CPF / RG</th><th>Profissão</th><th>Renda mensal</th><th>Ações</th></tr></thead><tbody>${cs.map(c => `<tr><td><strong>${escapar(c.nome)}</strong><br><span class="muted">${escapar(c.email)}</span></td><td>${escapar(c.cpf)}<br><small class="muted">${escapar(c.rg)}</small></td><td>${escapar(c.profissao)}</td><td>${moeda(c.empregos.reduce((s, e) => s + e.rendimento, 0))}</td><td><div class="acoes">${botaoAcao('Consultar', 'ver-cliente', c.id)}${botaoAcao('Editar', 'editar-cliente', c.id)}${botaoAcao('Excluir', 'excluir-cliente', c.id)}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhum cliente cadastrado.</p>'}</div>`;
}
function renderContratos() {
  cabecalho('Contratos', 'Condições registradas após aprovação do pedido e aceite.');
  $('#pagina').innerHTML = `<div class="painel">${estado.contratos.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Contrato</th><th>Veículo / Cliente</th><th>Período</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${estado.contratos.map(c => `<tr><td>${escapar(c.numero)}</td><td>${escapar(nomeCarro(c.veiculoId))}<br><small class="muted">${escapar(usuario(c.clienteId)?.nome)}</small></td><td>${dataBR(c.inicio)} — ${dataBR(c.fim)}</td><td>${moeda(c.valor)}</td><td>${statusHTML(c.status)}</td><td>${botaoAcao('Visualizar', 'ver-contrato', c.id)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhum contrato registrado. Pedidos aprovados podem ser contratados na tela de pedidos.</p>'}</div>`;
}
function modal(titulo, html) { $('#modal-titulo').textContent = titulo; $('#modal-corpo').innerHTML = '<div class="modal-erro" id="modal-erro" role="alert"></div>' + html; if (!$('#modal').open) $('#modal').showModal(); }
function fecharModal() { $('#modal').close(); }
// Evita cliques duplicados; falhas permanecem visíveis dentro do formulário.
function vincularForm(seletor, trabalho) {
  $(seletor).onsubmit = async e => {
    e.preventDefault(); const form = e.currentTarget; if (!form.reportValidity()) return;
    const botao = form.querySelector('[type="submit"]'); botao.disabled = true; $('#modal-erro').textContent = '';
    try { await trabalho(form); } catch (erro) { $('#modal-erro').textContent = erro.message; } finally { botao.disabled = false; }
  };
}
function camposEmprego(e = {}) { return `<div class="emprego"><div class="row g-2"><div class="col-sm-7"><label class="form-label">Entidade empregadora<input class="form-control entidade" required maxlength="150" value="${escapar(e.entidade || '')}"></label></div><div class="col-sm-5"><label class="form-label">Rendimento mensal (R$)<input class="form-control rendimento" required type="number" min="0.01" step="0.01" value="${e.rendimento || ''}"></label></div></div><button type="button" class="link-button remover-emprego">Remover vínculo</button></div>`; }
function formularioCliente(c = null, cadastro = false) {
  modal(c ? 'Editar cadastro' : 'Criar cadastro de cliente', `<form id="cliente-form"><div class="row g-3">${[['nome', 'Nome completo', 'text'], ['email', 'E-mail', 'email'], ['cpf', 'CPF (11 dígitos)', 'text'], ['rg', 'RG', 'text'], ['profissao', 'Profissão', 'text'], ['endereco', 'Endereço', 'text']].map(([id, label, tipo]) => `<div class="col-md-6"><label for="c-${id}" class="form-label">${label}</label><input id="c-${id}" name="${id}" class="form-control" type="${tipo}" required maxlength="${id === 'cpf' ? 11 : id === 'endereco' ? 250 : 150}" ${id === 'cpf' ? 'pattern="[0-9]{11}" inputmode="numeric"' : ''} value="${escapar(c?.[id] || '')}"></div>`).join('')}${!c ? '<div class="col-12"><label for="c-senha" class="form-label">Senha (mínimo 6 caracteres)</label><input type="password" name="senha" id="c-senha" class="form-control" autocomplete="new-password" minlength="6" maxlength="128" required></div>' : ''}</div><h3 class="section-label mt-4">Vínculos de renda</h3><p class="ajuda">Até três vínculos. Se não houver renda empregatícia, deixe a lista vazia.</p><div id="empregos">${(c?.empregos || []).map(camposEmprego).join('')}</div><button type="button" class="btn btn-outline-light btn-sm mb-4" id="adicionar-emprego">Adicionar vínculo +</button><div class="d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-light" data-fechar>Voltar</button><button class="btn btn-primary" type="submit">${c ? 'Salvar alterações' : 'Cadastrar'}</button></div></form>`);
  function atualizarBotao() { $('#adicionar-emprego').disabled = $('#empregos').children.length >= 3; }
  $('#adicionar-emprego').onclick = () => { if ($('#empregos').children.length < 3) $('#empregos').insertAdjacentHTML('beforeend', camposEmprego()); atualizarBotao(); };
  $('#empregos').onclick = e => { if (e.target.closest('.remover-emprego')) { e.target.closest('.emprego').remove(); atualizarBotao(); } }; atualizarBotao();
  vincularForm('#cliente-form', async form => {
    const dados = Object.fromEntries(new FormData(form)); dados.empregos = [...$('#empregos').children].map(e => ({ entidade: e.querySelector('.entidade').value.trim(), rendimento: Number(e.querySelector('.rendimento').value) }));
    const salvo = await api(c ? '/clientes/' + c.id : cadastro ? '/auth/cadastro' : '/clientes', c ? 'PATCH' : 'POST', dados);
    if (c?.id === estado.usuario?.id) estado.usuario = salvo;
    fecharModal(); avisar(c ? 'Cadastro atualizado.' : 'Cadastro criado com sucesso.');
    if (cadastro) { $('#login-email').value = dados.email; $('#login-senha').focus(); } else await renderizar();
  });
}
function formularioPedido(idVeiculo, pedido = null) {
  const clientes = estado.usuarios.filter(u => u.papel === 'cliente'); if (agente() && !clientes.length) return avisar('Cadastre um cliente antes de criar o pedido.', true);
  const bancos = estado.usuarios.filter(u => u.tipoAgente === 'banco');
  const hoje = new Date().toISOString().slice(0, 10);
  modal(pedido ? 'Editar pedido #' + pedido.id : 'Solicitar aluguel', `<form id="pedido-form"><p class="muted">Alterações de condições enviam o pedido para uma nova análise.</p><div class="row g-3">${agente() ? `<div class="col-12"><label class="form-label" for="p-cliente">Cliente</label><select class="form-select" id="p-cliente" name="clienteId" ${pedido ? 'disabled' : ''}>${clientes.map(c => `<option value="${c.id}" ${c.id === pedido?.clienteId ? 'selected' : ''}>${escapar(c.nome)}</option>`).join('')}</select></div>` : ''}<div class="col-12"><label class="form-label" for="p-veiculo">Veículo</label><select class="form-select" id="p-veiculo" name="veiculoId">${estado.veiculos.map(v => `<option value="${v.id}" ${v.id === (pedido?.veiculoId || idVeiculo) ? 'selected' : ''}>${escapar(v.marca + ' ' + v.modelo)} · ${moeda(v.diaria)}/dia</option>`).join('')}</select></div><div class="col-sm-6"><label class="form-label" for="p-inicio">Retirada</label><input class="form-control" type="date" id="p-inicio" name="inicio" required min="${hoje}" value="${pedido?.inicio || hoje}"></div><div class="col-sm-6"><label class="form-label" for="p-fim">Devolução</label><input class="form-control" type="date" id="p-fim" name="fim" required min="${hoje}" value="${pedido?.fim || hoje}"></div><div class="col-12"><label class="form-check"><input class="form-check-input" type="checkbox" name="comCredito" id="p-credito" ${pedido?.comCredito ? 'checked' : ''}><span class="form-check-label">Solicitar contrato de crédito bancário</span></label></div><div id="campos-credito" class="col-12" ${pedido?.comCredito ? '' : 'hidden'}><div class="row g-3"><div class="col-sm-8"><label class="form-label" for="p-banco">Banco responsável pela avaliação</label><select class="form-select" id="p-banco" name="bancoId">${bancos.map(b => `<option value="${b.id}" ${pedido?.bancoId === b.id ? 'selected' : ''}>${escapar(b.nome)}</option>`).join('')}</select></div><div class="col-sm-4"><label class="form-label" for="p-parcelas">Parcelas</label><input class="form-control" type="number" min="1" max="60" value="${pedido?.parcelas || 3}" id="p-parcelas" name="parcelas"></div></div><p class="ajuda mt-2">Simulação acadêmica de crédito sem juros.</p></div><div class="col-12"><label class="form-label" for="p-obs">Observações</label><textarea class="form-control" rows="2" maxlength="1000" name="observacoes" id="p-obs">${escapar(pedido?.observacoes || '')}</textarea></div></div><p id="estimativa" class="mt-4"></p><p class="ajuda">Diárias contadas incluindo retirada e devolução. O valor é recalculado pelo servidor.</p><div class="d-flex justify-content-end gap-2"><button class="btn btn-outline-light" type="button" data-fechar>Voltar</button><button class="btn btn-primary" type="submit">${pedido ? 'Salvar e reenviar' : 'Enviar pedido'}</button></div></form>`);
  const estimar = () => { const dias = Math.round((Date.parse($('#p-fim').value) - Date.parse($('#p-inicio').value)) / 86400000) + 1; const v = veiculo(Number($('#p-veiculo').value)); $('#estimativa').textContent = dias > 0 ? `${dias} diária(s) · Total estimado: ${moeda(dias * v.diaria)}` : 'Confira o período selecionado.'; $('#p-fim').min = $('#p-inicio').value || hoje; $('#campos-credito').hidden = !$('#p-credito').checked; $('#p-parcelas').disabled = !$('#p-credito').checked; $('#p-banco').disabled = !$('#p-credito').checked; };
  $('#pedido-form').onchange = estimar; estimar();
  vincularForm('#pedido-form', async form => { const dados = Object.fromEntries(new FormData(form)); dados.comCredito = $('#p-credito').checked; if (pedido) dados.clienteId = pedido.clienteId; await api('/pedidos' + (pedido ? '/' + pedido.id : ''), pedido ? 'PATCH' : 'POST', dados); fecharModal(); avisar('Pedido enviado para análise.'); location.hash = 'pedidos'; await renderizar(); });
}
function detalhesPedido(p) {
 const c = usuario(p.clienteId); const renda = c?.empregos?.reduce((s, e) => s + e.rendimento, 0) || 0;
 modal('Pedido #' + p.id, `<dl class="detalhe-grid">${[['Cliente', c?.nome], ['Veículo', nomeCarro(p.veiculoId)], ['Retirada', dataBR(p.inicio)], ['Devolução', dataBR(p.fim)], ['Total', moeda(p.total)], ['Diárias', p.dias], ['Forma', p.comCredito ? 'Crédito · ' + (usuario(p.bancoId)?.nome || 'Banco') : 'Direto'], ['Status', p.status], ['Rendimento mensal informado', moeda(renda)], ['Observações', p.observacoes || 'Sem observações']].map(([k, v]) => `<div><dt>${k}</dt><dd>${escapar(v)}</dd></div>`).join('')}</dl><h3 class="section-label">Histórico de avaliações</h3><div class="historico">${p.avaliacoes.length ? p.avaliacoes.map(a => `<p><strong>${escapar(usuario(a.agenteId)?.nome)} · ${escapar(a.parecer)}</strong><br>${escapar(a.justificativa)}<br><small class="muted">${dataBR(a.data)}</small></p>`).join('') : '<p class="muted">Aguardando o primeiro parecer.</p>'}</div>`);
}
function avaliarPedido(p) {
 const c = usuario(p.clienteId);
 modal('Avaliação financeira · pedido #' + p.id, `<p>Cliente: <strong>${escapar(c?.nome)}</strong></p><p>Renda mensal informada: <strong>${moeda(c?.empregos.reduce((s, e) => s + e.rendimento, 0))}</strong><br>Total do pedido: <strong>${moeda(p.total)}</strong></p><form id="avaliacao-form"><label class="form-label" for="parecer">Parecer</label><select class="form-select mb-3" name="parecer" id="parecer"><option value="aprovado">Aprovar</option><option value="reprovado">Reprovar</option></select><label class="form-label" for="justificativa">Justificativa da análise</label><textarea class="form-control mb-4" id="justificativa" name="justificativa" required maxlength="1000" rows="3"></textarea><button class="btn btn-primary" type="submit">Registrar parecer</button></form>`);
 vincularForm('#avaliacao-form', async f => { await api(`/pedidos/${p.id}/avaliar`, 'POST', Object.fromEntries(new FormData(f))); fecharModal(); avisar('Parecer registrado.'); await renderizar(); });
}
function contratarPedido(p) {
 const v = veiculo(p.veiculoId);
 modal('Confirmar contratação', `<p><strong>${escapar(nomeCarro(p.veiculoId))}</strong><br>${dataBR(p.inicio)} a ${dataBR(p.fim)} · ${moeda(p.total)}</p><p class="muted">O veículo permanece registrado como propriedade de ${escapar(usuario(v.proprietarioId)?.nome)} (${escapar(v.tipoProprietario)}). ${p.comCredito ? 'Será criado um contrato de crédito com o banco que aprovou o pedido.' : 'Pagamento direto, sem contrato de crédito.'}</p><form id="contratar-form"><label class="form-check mb-4"><input class="form-check-input" type="checkbox" required name="aceite"><span class="form-check-label">Conferi e aceito as condições desta simulação de contrato.</span></label><button class="btn btn-primary" type="submit">Confirmar contrato</button></form>`);
 vincularForm('#contratar-form', async () => { await api(`/pedidos/${p.id}/contratar`, 'POST', { aceite: true }); fecharModal(); avisar('Contrato registrado.'); location.hash = 'contratos'; await renderizar(); });
}
function verContrato(c) {
 const v = veiculo(c.veiculoId); const credito = estado.creditos.find(x => x.contratoId === c.id);
 modal('Contrato ' + c.numero, `<div class="contrato-documento"><p>LOCAVIA · REGISTRO DE ALUGUEL</p><h3>${escapar(c.numero)}</h3><p><strong>Contratante:</strong> ${escapar(usuario(c.clienteId)?.nome)}<br><strong>Automóvel:</strong> ${escapar(nomeCarro(c.veiculoId))}, ${v.ano}, placa ${escapar(v.placa)}, matrícula ${escapar(v.matricula)}.<br><strong>Proprietário registrado:</strong> ${escapar(usuario(c.proprietarioId)?.nome)} (${escapar(c.tipoProprietario)}).</p><p><strong>Período:</strong> ${dataBR(c.inicio)} a ${dataBR(c.fim)}.<br><strong>Valor total:</strong> ${moeda(c.valor)}.</p>${credito ? `<p><strong>Crédito:</strong> ${escapar(usuario(credito.bancoId)?.nome)}<br>${credito.parcelas} parcelas estimadas de ${moeda(credito.valorParcela)}.<br>${escapar(credito.observacao)}</p>` : '<p>Sem crédito bancário associado.</p>'}<p>Condições aceitas e registradas em ${dataBR(c.criadoEm)}.</p><small>Protótipo acadêmico. Este registro não constitui contratação comercial real.</small></div><button class="btn btn-outline-light mt-4" id="imprimir">Imprimir / salvar PDF</button>`);
 $('#imprimir').onclick = () => window.print();
}
function confirmarExclusao(c) {
 modal('Excluir cadastro', `<p>Deseja excluir o cadastro de <strong>${escapar(c.nome)}</strong>?</p><p class="muted">Clientes com pedidos ou veículos vinculados não podem ser excluídos.</p><form id="excluir-form"><button type="submit" class="btn btn-danger">Excluir cadastro</button></form>`);
 vincularForm('#excluir-form', async () => { await api('/clientes/' + c.id, 'DELETE'); fecharModal(); if (c.id === estado.usuario.id) encerrarSessao(); else await renderizar(); avisar('Cadastro excluído.'); });
}
function cancelarPedido(p) {
 modal('Cancelar pedido #' + p.id, `<p>Confirma o cancelamento de ${escapar(nomeCarro(p.veiculoId))}?</p><form id="cancelar-form"><button class="btn btn-danger" type="submit">Confirmar cancelamento</button></form>`);
 vincularForm('#cancelar-form', async () => { await api(`/pedidos/${p.id}/cancelar`, 'POST'); fecharModal(); avisar('Pedido cancelado.'); await renderizar(); });
}
document.addEventListener('click', e => {
 if (e.target.closest('[data-fechar]')) return fecharModal();
 const b = e.target.closest('[data-acao]'); if (!b) return; const id = Number(b.dataset.id); const p = estado.pedidos.find(x => x.id === id); const c = estado.usuarios.find(x => x.id === id);
 const acoes = { 'recarregar': renderizar, 'novo-pedido': () => formularioPedido(id), 'editar-pedido': () => formularioPedido(null, p), 'detalhes': () => detalhesPedido(p), 'avaliar': () => avaliarPedido(p), 'contratar': () => contratarPedido(p), 'cancelar': () => cancelarPedido(p), 'novo-cliente': () => formularioCliente(), 'editar-cliente': () => formularioCliente(c), 'excluir-cliente': () => confirmarExclusao(c), 'ver-cliente': () => modal('Cadastro de ' + c.nome, `<dl class="detalhe-grid">${[['Nome', c.nome], ['E-mail', c.email], ['CPF', c.cpf], ['RG', c.rg], ['Endereço', c.endereco], ['Profissão', c.profissao]].map(([k, v]) => `<div><dt>${k}</dt><dd>${escapar(v)}</dd></div>`).join('')}</dl><h3 class="section-label">Empregadores e rendimentos</h3><ul>${c.empregos.map(e => `<li>${escapar(e.entidade)} · ${moeda(e.rendimento)}</li>`).join('') || '<li>Nenhum vínculo informado.</li>'}</ul>`), 'ver-contrato': () => verContrato(estado.contratos.find(c => c.id === id)) };
 if (acoes[b.dataset.acao]) acoes[b.dataset.acao]();
});
$('#fechar-modal').onclick = fecharModal;
$('#abrir-cadastro').onclick = () => formularioCliente(null, true);
$('#login-form').onsubmit = async e => { e.preventDefault(); const b = e.currentTarget.querySelector('button'); b.disabled = true; try { await entrar($('#login-email').value, $('#login-senha').value); } catch (e) { avisar(e.message, true); } finally { b.disabled = false; } };
document.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => { const contas = { cliente: ['cliente@locavia.test', 'Cliente123!'], empresa: ['empresa@locavia.test', 'Agente123!'], banco: ['banco@locavia.test', 'Banco123!'] }; const [email, senha] = contas[b.dataset.demo]; $('#login-email').value = email; $('#login-senha').value = senha; $('#login-email').focus(); });
window.addEventListener('hashchange', renderizar);
(async () => { if (estado.token) try { estado.usuario = await api('/auth/eu'); await iniciar(); } catch (_) { encerrarSessao(); } else mostrarAcesso(); })();
