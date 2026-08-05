---
id: 04
slug: sidebar-freeze-probe
status: in_review
blockedBy: [03]
executor: deepseek-v4-pro
estimate: 3
verify: "npm --prefix frontend run check:quality"
pr: https://github.com/wendeus0/local-studio/pull/4
linear:
risk: low
budget_commits: 5
---

# Medir a expansão da sidebar em projeto grande usando a instrumentação de replay

## Problema

O PROGRESS.md registra um "freeze probe inconclusivo" na expansão da sidebar em projeto grande — pode ter sido a própria ferramenta de medição. Com a instrumentação do ticket 03 disponível, dá para medir o custo de expansão com o mesmo mecanismo, em vez de repetir uma sonda inconclusiva.

## Escopo

- Medir o custo de expandir um nó de sidebar com muitos filhos, reusando os contadores introduzidos no ticket 03.
- Teste que exercita a expansão com um fixture grande (centenas de itens) e falha se o número de operações por expansão crescer além do esperado (limiar declarado no próprio teste).

## Fora de escopo

- Reescrever a sidebar ou introduzir virtualização (decisão posterior, dependente da medida).
- Mudanças visuais.

## Comportamento esperado

A expansão de um nó grande tem custo medido e um limiar versionado; regressão de custo reprova o gate.

## Arquivos afetados

- `frontend/src/features/agent/ui/` (sidebar — leitura e instrumentação mínima)
- `frontend/scripts/<nome>.test.ts` (novo)

## Acceptance criteria

- [ ] Fixture com ≥300 itens exercita a expansão.
- [ ] Limiar de operações declarado explicitamente e justificado em comentário.
- [ ] Teste falha se o custo por expansão dobrar.
- [ ] `npm --prefix frontend run check:quality` verde.

## Cenários de teste

- Nó com 300 filhos → custo dentro do limiar.
- Nó vazio → sem custo.
- Duas expansões seguidas → custo não acumula (sem vazamento de listeners).

## Métricas de sucesso

O freeze passa a ter número reprodutível; a decisão de virtualizar vira dado, não impressão.
