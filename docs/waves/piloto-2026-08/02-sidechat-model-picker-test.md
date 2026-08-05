---
id: 02
slug: sidechat-model-picker-test
status: in_review
blockedBy: []
executor: deepseek-v4-pro
estimate: 2
verify: "npm --prefix frontend run check:quality"
pr: https://github.com/wendeus0/local-studio/pull/2
linear:
risk: low
budget_commits: 4
---

# Cobrir a seleção de modelo do sidechat com teste de unidade

## Problema

O PROGRESS.md registra que o picker de modelo do sidechat foi "gate-verificado, não click-testado". A seleção persiste na sessão do sidechat e dirige os turns — se regredir, o sidechat passa a usar o modelo errado silenciosamente.

## Escopo

- Teste da lógica de seleção/persistência do modelo por sessão de sidechat: seleção aplicada à sessão correta; sessões diferentes mantêm modelos distintos; a seleção sobrevive à troca de pane.
- Testar a camada de estado/lógica (não renderização visual).

## Fora de escopo

- Teste E2E de browser (fica para o `test:frontend:e2e`, fora deste ticket).
- Alterar o componente `agent-model-picker.tsx`.
- Mexer no picker do pane principal.

## Comportamento esperado

`npm --prefix frontend run check:quality` cobre o caminho de seleção do sidechat.

## Arquivos afetados

- `frontend/src/features/agent/ui/agent-model-picker.tsx` (leitura)
- `frontend/src/features/agent/ui/render-workspace-pane.tsx` (leitura)
- `frontend/scripts/<nome>.test.ts` (novo)

## Acceptance criteria

- [ ] Teste prova que a seleção grava no id de sessão correto.
- [ ] Teste prova isolamento entre duas sessões de sidechat.
- [ ] `npm --prefix frontend run check:quality` verde.

## Cenários de teste

- Duas sidechats abertas, modelos diferentes → cada turn usa o seu.
- Trocar o pane e voltar → seleção preservada.
- Sessão sem seleção explícita → cai no default sem quebrar.

## Métricas de sucesso

Regressão na seleção passa a reprovar o gate em vez de depender de teste manual.
