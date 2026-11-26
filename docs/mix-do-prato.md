# Dor #1: mix do prato

> **Status: proposta.** Nada deste documento está implementado no MVP. Os números vêm de um turno **simulado** ([`mix-simulacao.py`](mix-simulacao.py) → [`mix-turno-simulado.json`](mix-turno-simulado.json)). Os custos por kg são premissas nossas e precisam ser validados com compras.

**O problema:** a balança mostra quanto pesa o prato, mas não o que tem nele. Um prato de 400 g com 60% de picanha custa várias vezes mais do que um de 400 g com 60% de arroz e feijão, e os dois pagam o mesmo preço.

## 1. Como capturar o dado

Usamos três fontes que se completam. Nenhuma resolve tudo sozinha.

| Fonte | O que mostra | Granularidade | Custo | Quando |
|---|---|---|---|---|
| **Baixa de estoque** (kg que saíram por categoria) | Mix real do dia: quantos kg de carne nobre, carne comum, base e salada foram consumidos | Por dia | Zero: o dado já existe em compras e cozinha | Dia 1 |
| **Reposição de cubas + grelha** (tablet com "Repus" e contagem de porções por corte) | Mix por faixa de horário e itens que não giram | 15 min | Os tablets do piloto | Dia 1 |
| **Visão computacional na balança** (câmera em cima do prato no momento da pesagem) | Mix **por prato** e em tempo real | Por prato | ≈ R$ 1.500 por balança (câmera + computador pequeno) | Piloto à parte |

**Respondendo à pergunta sobre o estoque:** sim, o estoque mostra o que teve mais saída, mas só no total do dia. Ele não diz em que horário o mix piorou, então não dá tempo de agir no turno. Também mistura consumo com desperdício e sobra no prato. Por isso entra como **base de verdade** para calibrar as outras duas fontes, e não como alerta.

### Como as fontes se juntam

```
Balança (peso) ──► Câmera: % proteína / base / salada no prato ──┐
Grelha: porções por corte × peso médio ──────────────────────────┤──► mix estimado por faixa de 15 min
Tablet do buffet: cuba reposta (item, tamanho) ──────────────────┘          │
                                                                            ▼
Baixa de estoque do dia (kg por categoria) ─── calibra toda noite ──► mix e margem do dia (diretoria)
```

### A câmera na balança, para o pitch

- **Equipamento:** câmera USB de cima, apontada só para o prato, e um computador pequeno (Raspberry Pi 5 ou Jetson Orin Nano) ligado ao sinal da balança.
- **Modelo:** segmentação leve (por exemplo YOLOv8-seg), treinada com cerca de 1.000 fotos de pratos da casa marcadas em 4 classes: *carne nobre*, *carne comum*, *base* (arroz, feijão, massa, farofa) e *salada*.
- **De área para peso:** a câmera mede área, não peso. Cada classe recebe um fator de densidade, que a baixa de estoque recalibra toda noite. O peso total da balança fecha a conta.
- **Limites, sem esconder:** comida empilhada (feijão por cima do arroz), molho e vinagrete atrapalham a leitura. Por isso o resultado é uma **estimativa** e aparece com o selo *Estimativa*.
- **LGPD:** a câmera só enxerga a bandeja, nunca o rosto, e não grava imagem. Fica salvo apenas o percentual de cada classe.
- **Na demo do hackathon:** a câmera **não** é real. O vídeo mostra pratos de exemplo com o resultado simulado, e isso precisa ser dito em voz alta.

## 2. Onde aparece em cada perfil

### Diretoria: rentabilidade e mix
Para a diretoria responder se a casa está ganhando dinheiro no quilo, e onde está perdendo.
- KPIs, gráficos e insights listados na seção 4.
- Comparação com o período equivalente (semana × semana anterior), como nos outros indicadores.

### Gerência: ação durante o turno
- **Alerta (nível 2):** a proteína passa de **50% do peso** nos últimos 30 min.
  - Exemplo: *"Mix crítico: 57% proteína desde 12h15. Margem por kg 8% abaixo do horário fora de pico."*
- **Ações sugeridas (nível 3)**, cada uma com motivo e botão Confirmar, como o painel já faz:
  1. Grelha intercala corte comum (fraldinha, linguiça, frango) entre as passadas de picanha.
  2. Colocar as cubas de guarnição premium (risoto, legumes grelhados) e a salada no início do buffet.
  3. Repor primeiro as cubas que estão no fim.
- Nada muda sozinho: o gerente confirma, como já acontece nas outras ações.

### Churrasqueira (painel)
- Faixa de aviso quando o gerente confirma a ação 1: "Intercalar corte comum até 13h30".

### Cliente (opcional, com cuidado)
- Benefício positivo e nunca uma punição. Exemplo: "Prato com salada ganha café" no QR da mesa, apresentado como promoção do dia.
- **Risco:** se o cliente perceber que a câmera "avalia o prato", isso soa como vigilância. Recomendamos deixar fora do piloto e testar depois.

### Garçom
- Nenhuma tela nova. O mix não é tarefa dele.

## 3. Cenário simulado: um almoço antes e depois

Turno de 11h30 a 14h30 com 320 pratos, peso médio de 408 g e preço de R$ 119,90/kg.

> O ticket de R$ 48,90 é o cenário do pitch. O dado real da empresa é ≈ R$ 57,80 (482 g).

**Custo do insumo por kg (premissa):** carne nobre R$ 78, carne comum R$ 24, base R$ 6,50, salada R$ 9.

Os dois dias têm as mesmas chegadas e os mesmos pesos. Só muda o mix depois que o gerente confirma o ajuste:
- **12h15:** o alerta dispara.
- **12h55:** o gerente confirma.
- **13h00:** o efeito começa.

| Indicador do turno | Sem ajuste | Com ajuste | Diferença |
|---|---:|---:|---:|
| Pratos / kg vendidos | 320 / 131,9 kg | 320 / 131,9 kg | igual |
| Receita | R$ 15.811,70 | R$ 15.811,70 | igual |
| Custo do insumo (CMV) | R$ 4.768,75 (30,2%) | R$ 4.420,93 (28,0%) | **−R$ 347,82** |
| Margem bruta | R$ 11.042,95 (69,8%) | R$ 11.390,77 (72,0%) | **+R$ 347,82** |
| Margem por kg | R$ 83,72 | R$ 86,36 | +R$ 2,64 |

| Faixa | Pratos | Proteína sem ajuste | Margem sem ajuste | Proteína com ajuste | Margem com ajuste |
|---|---:|---:|---:|---:|---:|
| 11h30–12h00 | 50 | 46–49% | 73–74% | igual | igual |
| **12h15–12h45** | 128 | **56–59%** ⚠ | 67–68% | igual (alerta já ativo) | igual |
| **13h00–13h15** | 76 | **58%** ⚠ | 67–68% | **52%** | **72–73%** |
| 13h30–14h15 | 66 | 46–50% | 73–74% | 40–44% | 78–79% |

Em escala, e ainda como simulação: **≈ R$ 350 por almoço**, que em 22 dias úteis dá **≈ R$ 7.650 por mês** de margem recuperada. Isso equivale a cerca de 130 almoços pelo ticket do cenário.

O alerta deste cenário fala em −8% na margem por kg (pico contra fora de pico), e não nos −14% do exemplo do briefing: o número tem de sair dos dados simulados.

## 4. Especificação de UI (para gerar o front-end)

Estilo: o mesmo do MVP, com fundo escuro na tela inicial, sidebar escura, destaque âmbar `#F59E0B` e cores semânticas (ok `#2E7A4C`, atenção `#B87909`, crítico `#C0341D`). Todo card leva selo de origem: **Estimativa** (câmera ou grelha), **Estoque** (baixa real) ou **Simulação** (demo).

### Diretoria: nova página "Mix e rentabilidade"
Filtros: Semana / Mês / Ano, sempre comparando com o período equivalente.

| # | Componente | Conteúdo | Origem |
|---|---|---|---|
| D1 | KPI | **Margem bruta por kg**: R$ 83,72, com variação contra o período anterior | Estoque + vendas |
| D2 | KPI | **CMV do buffet**: 30,2% (meta ≤ 28%), pill ok/atenção | Estoque |
| D3 | KPI | **Proteína no prato**: 54% do peso (limite 50%) | Estimativa |
| D4 | KPI | **Custo médio do prato**: R$ 14,90 de insumo por R$ 49,41 de ticket | Estimativa |
| D5 | Barra 100% empilhada | **Composição média do prato** por dia: nobre / comum / base / salada | Estimativa |
| D6 | Barras horizontais | **Custo por categoria** (R$/dia): nobre domina mesmo sendo cerca de 37% do peso | Estoque |
| D7 | Linha | **Margem por kg × proteína %** ao longo dos dias, com a linha do limite de 50% | Estimativa + estoque |
| D8 | Heatmap dia × faixa | **Onde o mix piora**: % de proteína por dia da semana e faixa de 15 min | Estimativa |
| D9 | Lista de insights | Ex.: "Quinta 12h15–13h15 concentra 70% dos turnos com mix crítico" | Regras |

### Gerência: card no painel e alerta
| # | Componente | Conteúdo |
|---|---|---|
| G1 | KPI nível 1 | **Mix agora (30 min)**: barra empilhada + "57% proteína" com pill crítico acima de 50% |
| G2 | Alerta nível 2 | "Mix crítico: 57% proteína desde 12h15. Margem por kg 8% abaixo do horário fora de pico." |
| G3 | Ação nível 3 | "Grelha intercala corte comum até 13h30". Por quê: carne nobre em 40% do peso no pico. [Confirmar] [Agora não] |
| G4 | Ação nível 3 | "Cubas de guarnição premium e salada no início do buffet". Por quê: a base caiu para 25% do prato. [Confirmar] |
| G5 | Mini-linha | Proteína % por faixa de 15 min hoje, com o limite de 50% e uma marca no horário da ação confirmada |

### Churrasqueira
| # | Componente | Conteúdo |
|---|---|---|
| C1 | Faixa no painel da TV | "Intercalar corte comum até 13h30" (só aparece depois da confirmação do gerente) |

## 5. Dependências e pendências

- Custos reais por kg de cada categoria (compras) e a baixa diária do estoque por categoria.
- Peso médio da porção de cada corte, medido na grelha durante 1 semana.
- Fotos rotuladas de pratos da casa para treinar o modelo, além de testar câmera e iluminação na balança real.
- Integração com o sinal da balança (saída serial ou USB do modelo usado na Augusta).
- Validar com a direção se o limite de 50% de proteína faz sentido para o modelo de negócio. Carne é a marca da casa, e o objetivo é equilibrar o mix, não reduzir a carne.
