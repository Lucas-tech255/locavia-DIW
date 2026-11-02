const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let server, base, temporario, cliente, empresa, banco, novo;
async function requisicao(url, metodo='GET', dados, token) {
 const r = await fetch(base+url,{method:metodo,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(dados?{body:JSON.stringify(dados)}:{})});
 return {status:r.status, dados:await r.json()};
}
const dia = n => new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const cadastro = (n=2) => ({nome:'Teste Cliente '+n,email:`teste${n}@example.test`,cpf:String(n).padStart(11,'0'),rg:'TESTE'+n,endereco:'Rua Fictícia',profissao:'Estudante',empregos:[{entidade:'Exemplo',rendimento:4500}],senha:'Teste123!'});
before(async()=>{
 temporario=fs.mkdtempSync(path.join(os.tmpdir(),'locavia-test-'));
 process.env.DB_FILE=path.join(temporario,'db.json');process.env.NODE_ENV='test';
 const {app}=require('../server.cjs');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api';
 cliente=(await requisicao('/auth/login','POST',{email:'cliente@locavia.test',senha:'Cliente123!'})).dados.token;
 empresa=(await requisicao('/auth/login','POST',{email:'empresa@locavia.test',senha:'Agente123!'})).dados.token;
 banco=(await requisicao('/auth/login','POST',{email:'banco@locavia.test',senha:'Banco123!'})).dados.token;
});
after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(temporario,{recursive:true,force:true});});
test('API exige cadastro/login, rejeita senha errada e não expõe hashes',async()=>{
 assert.equal((await requisicao('/veiculos')).status,401);
 assert.equal((await requisicao('/auth/login','POST',{email:'cliente@locavia.test',senha:'errada'})).status,401);
 const r=await requisicao('/usuarios','GET',null,cliente);assert.equal(r.dados.length,3);assert.equal(r.dados.find(x=>x.id===3).email,undefined);assert.equal(r.dados.find(x=>x.id===3).tipoAgente,'banco');assert.equal(r.dados[0].senhaHash,undefined);assert.equal(r.dados[0].salt,undefined);
 const raw=await fetch(base+'/db',{headers:{Authorization:'Bearer '+cliente}});assert.equal(raw.status,404);
});
test('CRUD de cliente, máximo três empregos e duplicidade',async()=>{
 const quatro=cadastro();quatro.empregos=Array(4).fill({entidade:'X',rendimento:100});assert.equal((await requisicao('/auth/cadastro','POST',quatro)).status,400);
 const criado=await requisicao('/auth/cadastro','POST',cadastro());assert.equal(criado.status,201);novo=criado.dados;
 assert.equal((await requisicao('/auth/cadastro','POST',cadastro())).status,400);
 assert.equal((await requisicao('/clientes/'+novo.id,'PATCH',{nome:'Nome editado'},empresa)).dados.nome,'Nome editado');
 assert.equal((await requisicao('/clientes/'+novo.id,'GET',null,cliente)).status,403);
 const dados=JSON.parse(fs.readFileSync(process.env.DB_FILE));assert(dados.usuarios.some(u=>u.id===novo.id&&u.nome==='Nome editado'));assert(!dados.usuarios.some(u=>u.senhaInicial));
 assert.equal((await requisicao('/clientes/'+novo.id,'DELETE',null,empresa)).status,200);
 assert.equal((await requisicao('/clientes/'+novo.id,'GET',null,empresa)).status,404);
});
test('criação de cliente pelo agente e impedimento de elevação de privilégios',async()=>{
 const r=await requisicao('/clientes','POST',{...cadastro(3),papel:'agente',tipoAgente:'banco'},empresa);assert.equal(r.status,201);assert.equal(r.dados.papel,'cliente');
 const token=(await requisicao('/auth/login','POST',{email:cadastro(3).email,senha:'Teste123!'})).dados.token;
 const r2=await requisicao('/clientes/'+r.dados.id,'PATCH',{papel:'agente'},token);assert.equal(r2.dados.papel,'cliente');
 assert.equal((await requisicao('/clientes','POST',cadastro(4),token)).status,403);
});
test('pedido: total no servidor, edição, nova análise, aprovação e contrato',async()=>{
 const d={veiculoId:1,inicio:dia(3),fim:dia(5),comCredito:false,total:1,status:'aprovado',clienteId:99};
 let r=await requisicao('/pedidos','POST',d,cliente);assert.equal(r.status,201);const id=r.dados.id;assert.equal(r.dados.total,357);assert.equal(r.dados.status,'pendente');assert.equal(r.dados.clienteId,1);
 assert.equal((await requisicao(`/pedidos/${id}/contratar`,'POST',{aceite:true},cliente)).status,409);
 assert.equal((await requisicao(`/pedidos/${id}/avaliar`,'POST',{parecer:'aprovado',justificativa:'Renda compatível'},cliente)).status,403);
 assert.equal((await requisicao(`/pedidos/${id}/avaliar`,'POST',{parecer:'aprovado',justificativa:'Renda compatível'},empresa)).status,200);
 r=await requisicao(`/pedidos/${id}`,'PATCH',{fim:dia(6)},cliente);assert.equal(r.dados.status,'pendente');assert.equal(r.dados.total,476);
 await requisicao(`/pedidos/${id}/avaliar`,'POST',{parecer:'aprovado',justificativa:'Reanalisado'},empresa);
 assert.equal((await requisicao(`/pedidos/${id}/contratar`,'POST',{aceite:false},cliente)).status,400);
 r=await requisicao(`/pedidos/${id}/contratar`,'POST',{aceite:true},cliente);assert.equal(r.status,201);assert.equal(r.dados.tipoProprietario,'empresa');assert.equal((await requisicao('/contratos','GET',null,cliente)).dados.length,1);
 assert.equal((await requisicao(`/pedidos/${id}/contratar`,'POST',{aceite:true},cliente)).status,409);
 assert.equal((await requisicao(`/pedidos/${id}/cancelar`,'POST',{},cliente)).status,409);
 assert.equal((await requisicao('/pedidos','POST',d,cliente)).status,400);
 assert.equal((await requisicao('/clientes/1','DELETE',null,empresa)).status,409);
});
test('crédito só é aprovado pelo banco selecionado e persiste associado ao contrato',async()=>{
 let r=await requisicao('/pedidos','POST',{veiculoId:3,inicio:dia(10),fim:dia(12),comCredito:true,bancoId:3,parcelas:3},cliente);const id=r.dados.id;assert.equal(r.status,201);
 assert.equal((await requisicao(`/pedidos/${id}/avaliar`,'POST',{parecer:'aprovado',justificativa:'OK'},empresa)).status,403);
 assert.equal((await requisicao(`/pedidos/${id}/avaliar`,'POST',{parecer:'aprovado',justificativa:'Crédito aprovado'},banco)).status,200);
 r=await requisicao(`/pedidos/${id}/contratar`,'POST',{aceite:true},cliente);assert.equal(r.status,201);assert.equal(r.dados.tipoProprietario,'banco');
 const cr=await requisicao('/creditos','GET',null,cliente);assert.equal(cr.dados.length,1);assert.equal(cr.dados[0].contratoId,r.dados.id);assert.equal(cr.dados[0].bancoId,3);
});
test('cancelamento, reprovação e isolamento de pedidos entre clientes',async()=>{
 const token=(await requisicao('/auth/login','POST',{email:cadastro(3).email,senha:'Teste123!'})).dados.token;
 assert.equal((await requisicao('/pedidos','GET',null,token)).dados.length,0);assert.equal((await requisicao('/contratos','GET',null,token)).dados.length,0);assert.equal((await requisicao('/creditos','GET',null,token)).dados.length,0);
 assert.equal((await requisicao('/pedidos/1','PATCH',{observacoes:'Ataque'},token)).status,403);
 const r=await requisicao('/pedidos','POST',{veiculoId:2,inicio:dia(20),fim:dia(20)},cliente);assert.equal(r.status,201);
 assert.equal((await requisicao(`/pedidos/${r.dados.id}/cancelar`,'POST',{},cliente)).dados.status,'cancelado');
 assert.equal((await requisicao(`/pedidos/${r.dados.id}`,'PATCH',{fim:dia(21)},cliente)).status,409);
 const r2=await requisicao('/pedidos','POST',{veiculoId:4,inicio:dia(20),fim:dia(21)},cliente);
 assert.equal((await requisicao(`/pedidos/${r2.dados.id}/avaliar`,'POST',{parecer:'reprovado',justificativa:'Documentação insuficiente'},empresa)).dados.status,'reprovado');
 assert.equal((await requisicao(`/pedidos/${r2.dados.id}/contratar`,'POST',{aceite:true},cliente)).status,409);
 assert.equal((await requisicao('/pedidos','POST',{veiculoId:2,inicio:dia(20),fim:dia(19)},cliente)).status,400);
 assert.equal((await requisicao('/pedidos','POST',{veiculoId:2,inicio:dia(20),fim:dia(21),comCredito:true,bancoId:2,parcelas:0},cliente)).status,400);
});
test('logout invalida token',async()=>{await requisicao('/auth/sair','POST',{},cliente);assert.equal((await requisicao('/auth/eu','GET',null,cliente)).status,401);});
