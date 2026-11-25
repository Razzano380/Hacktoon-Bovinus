-- Bovinu's Flow: modelo de dados proposto (PostgreSQL / Supabase)
-- O protótipo do repositório não usa banco: roda uma simulação no navegador.
-- Este é o esquema da versão real, que as telas passariam a ler e gravar.

create table mesas (
  id          text primary key,              -- ex.: 'S14'
  salao       text not null,                 -- 1, 2 ou 3
  praca       text not null,                 -- praça do garçom: A, B, C, D
  lugares     int  not null check (lugares > 0),
  estado      text not null default 'livre'  -- livre | ocupada | suja
              check (estado in ('livre','ocupada','suja'))
);

create table equipe_turno (
  id          bigserial primary key,
  dia         date not null,
  funcionario text not null,                 -- apelido; sem dado sensível
  posto       text not null,                 -- garcom | grelha | balanca | anfitriao | gerente
  praca       text
);

-- Tabela central: cada toque ou registro da comanda vira um evento com horário.
create table eventos (
  id          bigserial primary key,
  unidade     text not null default 'augusta',
  tipo        text not null,                 -- chegada | pesagem | mesa_ocupada | mesa_liberada
                                             -- | grelha_atendimento | chamado | pagamento
  mesa        text references mesas(id),
  praca       text,
  origem      text not null,                 -- comanda | celular_garcom | tablet_anfitriao | tablet_grelha | qr_cliente
  horario     timestamptz not null default now(),
  duracao_s   int,                           -- ex.: da saída do cliente até a mesa livre
  dados       jsonb                          -- campos extras por tipo
);
create index on eventos (unidade, horario);
create index on eventos (tipo, horario);

create table pesquisas (
  id          bigserial primary key,
  horario     timestamptz not null default now(),
  mesa        text references mesas(id),
  nota        int not null check (nota between 1 and 5),
  motivo      text                           -- anônima: sem nome nem telefone
);

create table clientes_passe (
  id            bigserial primary key,
  telefone      text unique not null,
  consentimento timestamptz not null,        -- LGPD: só entra com aceite
  visitas       int not null default 0,
  apagar_em     date not null                -- guarda máxima de 12 meses
);

create table previsao (
  dia         date not null,
  faixa       time not null,                 -- início da faixa de 15 min
  clientes    int  not null,                 -- clientes esperados
  primary key (dia, faixa)
);
