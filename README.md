# Locavia — Aluguel de Carros

Trabalho individual do Laboratório 02 de Desenvolvimento de Interfaces Web da PUC Minas.

**Aluno:** Lucas Samuel Nogueira Barbosa  
**Professor:** João Paulo Carneiro Aramuni

## Sobre o projeto

Sistema para cadastrar clientes e gerenciar pedidos de aluguel. O cliente escolhe o veículo, informa o período e acompanha o pedido. Agentes de empresas e bancos avaliam as solicitações. Após aprovação e aceite, o sistema registra o contrato, com crédito bancário opcional.

## Funcionalidades

- Cadastro, login e saída.
- Consulta, alteração e exclusão de clientes, com até três empregadores e seus rendimentos.
- Catálogo de veículos com pesquisa e filtro por categoria.
- Criação, consulta, alteração e cancelamento de pedidos.
- Avaliação financeira pelos agentes, com parecer e justificativa.
- Registro, consulta e impressão de contratos.
- Crédito bancário simulado e identificação do proprietário do veículo.

## Tecnologias

HTML5, CSS3, JavaScript, Bootstrap 5.3.8, Fetch API e JSON Server 0.17.4. Node.js executa o servidor; os dados ficam em `db.json`.

## Como executar

Instale Node.js 20 ou superior. Extraia o projeto, abra um terminal na pasta `locavia` e execute:

```bash
npm install
npm start
```

Abra **http://localhost:3000**. No PowerShell, use `npm.cmd` se `npm` estiver bloqueado. Para encerrar, pressione Ctrl+C.

A interface e a API são servidas juntas. Não é necessário abrir outro servidor. Se a porta 3000 estiver ocupada, encerre o processo anterior.

## Contas de teste

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Cliente | cliente@locavia.test | Cliente123! |
| Empresa | empresa@locavia.test | Agente123! |
| Banco | banco@locavia.test | Banco123! |

Os dados são fictícios. Também é possível cadastrar um novo cliente pela tela inicial.

## Organização

| Caminho | Conteúdo |
| --- | --- |
| public/index.html | Estrutura da interface |
| public/css/style.css | Estilos |
| public/js/app.js | Telas dinâmicas e chamadas Fetch |
| public/assets/ | Bootstrap e fotos dos veículos |
| server.cjs | Rotas, sessões e regras |
| db.json | Dados persistidos |
| db.seed.json | Base inicial de demonstração |
| docs/Modelagem-Locavia.pdf | Histórias e diagramas UML |
| docs/modelos/ | Diagramas editáveis, PNG e SVG |
| tests/api.test.cjs | Testes da API |

## Modelagem

[Histórias de usuário e diagramas](docs/Modelagem-Locavia.pdf)

- [Casos de uso](docs/modelos/casos-de-uso.png)
- [Classes](docs/modelos/classes.png)
- [Pacotes](docs/modelos/pacotes.png)
- [Componentes](docs/modelos/componentes.png)

As fontes `.puml` são editáveis com PlantUML. O diagrama de classes representa os objetos armazenados em JSON. O histórico do Git permite acompanhar alterações futuras dos modelos.

## Regras principais

O cliente acessa seus próprios dados e pedidos. Agentes gerenciam clientes e avaliam pedidos. Solicitações com crédito são avaliadas pelo banco selecionado. Alterar um pedido exige nova análise; pedidos contratados ou cancelados não podem ser editados.

As diárias incluem retirada e devolução. Reservas aprovadas ou contratadas não podem ocupar o mesmo veículo em períodos sobrepostos. Clientes com pedidos ou veículos vinculados não podem ser excluídos.

O contrato mantém o proprietário registrado do veículo: cliente, empresa ou banco. O crédito é uma simulação sem juros. Não há pagamento real ou transferência de propriedade.

## Testes

```bash
npm run check
npm test
```

Os testes usam banco temporário e verificam cadastro, permissões, pedidos, contratos, crédito e persistência. A revisão visual deve ser realizada no navegador.

## Observações

Reiniciar o servidor mantém os dados, mas exige novo login. Para restaurar a base inicial, pare o servidor, faça backup de `db.json` e substitua-o por uma cópia de `db.seed.json`.

O protótipo é local e não está hospedado. Para publicação, é necessário um servidor que execute Node.js e conserve os dados; GitHub Pages sozinho não executa JSON Server.

## Referências

- [Bootstrap](https://getbootstrap.com/docs/5.3/)
- [JSON Server](https://github.com/typicode/json-server/tree/v0.17.4)
- [Fetch API](https://developer.mozilla.org/pt-BR/docs/Web/API/Fetch_API)
- [Template do professor](https://github.com/joaopauloaramuni/desenvolvimento-de-interfaces-web/blob/main/TEMPLATES/template_README.md)

## Fotos

Fotos reais de referência dos modelos, com créditos e licenças disponíveis no rodapé do sistema. Ano, versão e cor podem diferir dos dados fictícios do catálogo.
