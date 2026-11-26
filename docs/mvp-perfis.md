# MVP por perfis

Evolução do protótipo do hackathon para um MVP organizado por perfil de usuário. O código existente foi reaproveitado: a simulação, as regras de alerta, o mapa do salão, a tela do garçom, a diretoria e as telas do cliente continuam no mesmo `index.html`.

## 1. Diagnóstico do estado anterior

- Protótipo estático (um `index.html` no GitHub Pages), sem backend e sem login.
- 9 telas em abas horizontais, todas visíveis para qualquer pessoa.
- Telas de operação misturadas com telas de apresentação ("Como funciona", "Por que isso ajuda o garçom").
- Garçom e cliente apareciam como celulares desenhados dentro da página de desktop; a página não tinha `meta viewport`, então no celular de verdade abria como desktop reduzido.
- Painel do gerente misturava situação, alertas e ações em uma única lista.
- Um único selo "dados sintéticos" para tudo; não ficava claro o que era simulação, histórico gerado ou previsão.
- Não existe cardápio no código. O cliente tem fila de mesa, pedidos rápidos e avaliação.

## 2. Decisões de UX/UI

| Decisão | Por quê |
|---|---|
| Tela inicial com 3 perfis de funcionário + acesso do cliente | Cada pessoa responde a uma pergunta diferente (ver tela inicial) |
| Sidebar recolhível no desktop, barra inferior no celular | Navegação por contexto; o menu mostra só as páginas do perfil |
| Painel do gerente em 3 níveis: *O que está acontecendo* → *Precisa de atenção* → *O que fazer* | Responde às três perguntas do gerente nessa ordem |
| Toda ação recomendada tem **Por quê**, **Confirmar** e **Agora não** | Nada que muda a operação é executado sem o gerente confirmar |
| Garçom em tela cheia no celular, botões de 44 px, mesas da praça com toque para mudar estado | Velocidade e uso com uma mão |
| Selos de origem: *Simulação*, *Simulação comparativa*, *Histórico sintético*, *Previsão* | Nenhum dado simulado aparece como real; definições em "Sobre os dados" |
| Mantidos vermelho da marca, fundo escuro, Barlow Condensed + Inter e cores semânticas existentes | Preservar a identidade |

## 3. Arquitetura de navegação e perfis

```
#inicio ──► #login/<perfil> ──► servidor valida matrícula e perfil ──► página inicial do perfil
#mesa/<token>  (cliente, sem login; token assinado identifica a mesa)
#agora         (página pública de fila e lotação)
```

| Perfil | Páginas |
|---|---|
| Gerência | Painel, Mapa do salão, Churrasqueira, Cliente e QR, Experiência e equipe, Sobre os dados |
| Diretoria | Visão estratégica, Experiência e equipe, Sobre os dados |
| Garçom | Minha praça |

Uma página fora do perfil, digitada na barra de endereço, redireciona para a página inicial do perfil. A proteção de verdade está no servidor:

| Rota | Quem pode |
|---|---|
| `POST /api/login` | todos (limite: 5 erros em 5 min por IP) |
| `GET /api/me`, `POST /api/logout` | sessão |
| `POST /api/acoes` (confirmar recomendação) | gerente |
| `POST /api/mesas/:id/estado` | gerente; garçom só na própria praça |
| `GET /api/qr/:mesa` (gerar QR) | gerente |
| `GET /api/mesa?t=`, `POST /api/chamados` | cliente com token de mesa válido |
| `GET /api/eventos` (auditoria) | gerente, diretoria |

Segurança: senhas só como hash scrypt com sal; sessão em cookie `HttpOnly`, `SameSite=Strict`, assinado com HMAC, perfil sempre lido do cadastro (nunca do navegador); POST só com JSON; arquivos do servidor e o cadastro não são servidos. Escolher um perfil na tela inicial não dá acesso: uma matrícula de garçom recusada no login de gerente recebe 403.

## 4. Funcionalidades implementadas (P0)

Tela inicial, login e logout, permissões no backend, separação dos perfis, painel do gerente em 3 níveis, diretoria separada da operação, garçom mobile com as mesas da praça, QR assinado por mesa com página do cliente, navegação responsiva, selos de origem dos dados e página "Sobre os dados" com definições dos indicadores. Tudo o que existia continua funcionando.

## 5. Testes

- `npm test`: 11 testes da API (login, senha errada, perfil trocado, cookie forjado, permissões por perfil e por praça, QR assinado e adulterado, POST sem JSON, arquivos internos, limite de tentativas).
- `tests/e2e.mjs` (Playwright): 20 verificações no navegador com servidor e 15 no modo estático, incluindo celular (iPhone 13) sem rolagem horizontal e ausência de erros de JavaScript.

## 6. Pendências técnicas (não prontas para produção)

- **Dados reais:** a operação continua sendo uma simulação que roda em cada navegador. As telas não se sincronizam entre aparelhos. Próximo passo: gravar os eventos na tabela `eventos` (`docs/modelo-de-dados.sql`) e distribuir em tempo real (Supabase Realtime ou WebSocket).
- **Eventos do servidor em memória:** somem ao reiniciar.
- **Usuários em arquivo:** trocar por tabela com cadastro pelo gerente, troca de senha no primeiro acesso e senhas individuais.
- **Segredos:** definir `SESSION_SECRET` e `QR_SECRET` (o QR impresso depende deste) e `COOKIE_SECURE=1` atrás de HTTPS.
- **Avaliação do cliente** ainda não vai para o servidor; pedidos pelo QR vão.
- **Cardápio:** não existe no código atual; fora deste escopo.
- **P1:** mapa do salão interativo com detalhes da mesa, notificações push para o garçom, comparação histórica entre períodos equivalentes com dados reais.

## 7. Como demonstrar

1. `node server.js` e abra http://localhost:8080.
2. Gerência (`1001` / `bovinus2026`): clique em **▶ Simular**, veja os 3 níveis, confirme uma ação. Em **Cliente e QR**, gere o QR da mesa P12.
3. Em outra janela anônima, abra o link do QR: a mesa é identificada sem login. Troque o número da mesa no link: o QR é recusado.
4. Garçom (`3002`) no celular ou com a janela estreita: mude o estado de uma mesa, toque em **Limpei**.
5. Diretoria (`2001`): troque o período entre semana, mês e ano.
6. Tente abrir `#diretoria` logado como gerente: volta para o painel.
