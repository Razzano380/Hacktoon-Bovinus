"""Turno de almoço SIMULADO para a Dor #1 (mix do prato). Nada aqui é dado real da Bovinu's.

Gera docs/mix-turno-simulado.json com 320 pratos, antes e depois do ajuste do gerente.
Uso: python3 docs/mix-simulacao.py
"""
import json, random, os

random.seed(137)  # grupo C-137: resultado reproduzível

PRECO_KG = 119.90          # preço da casa (dado da empresa)
PESO_MEDIO_KG = 0.482      # dado da empresa: 482 g por cliente (ticket ≈ R$ 57,80)
# custo do insumo por kg pronto (premissa nossa, a validar com compras)
CUSTO = {'nobre': 78.0, 'comum': 24.0, 'base': 6.5, 'salada': 9.0}
LIMITE_PROTEINA = 0.50     # gatilho do alerta: proteína total acima de 50% do peso
# pratos por faixa de 15 min, 11h30 a 14h30 (12 faixas, soma 320)
PRATOS = [10, 14, 26, 38, 44, 46, 42, 34, 26, 18, 12, 10]
INTERVENCAO = 6            # gerente confirma o ajuste na faixa 6 (13h00)

def faixa(i):
    m = 690 + i * 15
    return f"{m // 60}h{m % 60:02d}"

def mix_alvo(i, ajustado):
    # no pico, a grelha gira mais e a picanha domina; o ajuste reduz a proteína nobre
    pico = 1.0 if 3 <= i <= 7 else 0.0
    nobre = 0.30 + 0.10 * pico
    comum = 0.17
    if ajustado:
        nobre -= 0.09   # grelha segura a saída de corte nobre e intercala corte comum
        comum += 0.03
    salada = 0.17 + (0.04 if ajustado else 0)  # cubas premium de salada e guarnição na entrada
    base = 1 - nobre - comum - salada
    return {'nobre': nobre, 'comum': comum, 'base': base, 'salada': salada}

def turno(com_ajuste):
    faixas, pratos = [], []
    for i, n in enumerate(PRATOS):
        alvo = mix_alvo(i, com_ajuste and i >= INTERVENCAO)
        tot = {k: 0.0 for k in CUSTO}
        receita = custo = 0.0
        for _ in range(n):
            peso = max(0.18, random.gauss(PESO_MEDIO_KG, 0.10))
            mix = {k: max(0.0, v + random.gauss(0, 0.05)) for k, v in alvo.items()}
            s = sum(mix.values()); mix = {k: v / s for k, v in mix.items()}
            c = sum(peso * mix[k] * CUSTO[k] for k in CUSTO)
            receita += peso * PRECO_KG; custo += c
            for k in CUSTO: tot[k] += peso * mix[k]
            pratos.append({'faixa': faixa(i), 'peso_kg': round(peso, 3), 'mix': {k: round(v, 3) for k, v in mix.items()}, 'custo': round(c, 2), 'receita': round(peso * PRECO_KG, 2)})
        kg = sum(tot.values())
        faixas.append({'faixa': faixa(i), 'pratos': n, 'kg': round(kg, 1),
                       'mix_pct': {k: round(v / kg * 100, 1) for k, v in tot.items()},
                       'proteina_pct': round((tot['nobre'] + tot['comum']) / kg * 100, 1),
                       'receita': round(receita, 2), 'custo_insumo': round(custo, 2),
                       'margem_bruta_pct': round((1 - custo / receita) * 100, 1)})
    receita = sum(f['receita'] for f in faixas); custo = sum(f['custo_insumo'] for f in faixas)
    kg = sum(f['kg'] for f in faixas)
    return {'resumo': {'pratos': len(pratos), 'kg': round(kg, 1), 'ticket_medio': round(receita / len(pratos), 2),
                       'receita': round(receita, 2), 'custo_insumo': round(custo, 2),
                       'margem_bruta': round(receita - custo, 2), 'margem_bruta_pct': round((1 - custo / receita) * 100, 1),
                       'margem_por_kg': round((receita - custo) / kg, 2), 'cmv_pct': round(custo / receita * 100, 1)},
            'faixas': faixas, 'pratos': pratos}

random.seed(137); antes = turno(False)
random.seed(137); depois = turno(True)
alertas = [{'faixa': f['faixa'], 'proteina_pct': f['proteina_pct'], 'margem_bruta_pct': f['margem_bruta_pct']}
           for f in antes['faixas'] if f['proteina_pct'] > LIMITE_PROTEINA * 100]
out = {'aviso': 'Dados SIMULADOS para demonstração. Custos por kg são premissas, não dados da Bovinu\'s.',
       'premissas': {'preco_kg': PRECO_KG, 'peso_medio_kg': PESO_MEDIO_KG, 'custo_kg': CUSTO,
                     'limite_proteina_pct': LIMITE_PROTEINA * 100, 'intervencao': faixa(INTERVENCAO)},
       'antes': antes, 'depois': depois, 'alertas_sem_ajuste': alertas}
assert antes['resumo']['pratos'] == depois['resumo']['pratos'] == 320
assert depois['resumo']['margem_bruta'] > antes['resumo']['margem_bruta']
open(os.path.join(os.path.dirname(__file__), 'mix-turno-simulado.json'), 'w').write(json.dumps(out, ensure_ascii=False, indent=1))
for nome, t in (('antes', antes), ('depois', depois)):
    print(nome, t['resumo'])
for f0, f1 in zip(antes['faixas'], depois['faixas']):
    print(f0['faixa'], f0['pratos'], f0['proteina_pct'], f0['margem_bruta_pct'], '|', f1['proteina_pct'], f1['margem_bruta_pct'], f0['mix_pct'])
