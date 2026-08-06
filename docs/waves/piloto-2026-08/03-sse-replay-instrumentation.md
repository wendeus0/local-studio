---
id: 03
slug: sse-replay-instrumentation
status: done
blockedBy: []
executor: deepseek-v4-pro
estimate: 3
verify: "npm --prefix frontend run check:quality"
pr: https://github.com/wendeus0/local-studio/pull/3
linear:
risk: low
budget_commits: 5
merged_sha: 99297e205e35563b72f67a647779e8a7529eb80e
---

# Instrumentar o catch-up de replay SSE para turns em voo

## Problema

O PROGRESS.md aponta o event-replay SSE de turns em voo como principal suspeito da lentidão ao revisitar sessões longas no Electron — e diz que está "untouched". Sem instrumentação não há como confirmar ou descartar a hipótese: hoje o diagnóstico depende de reproduzir manualmente uma sessão longa.

## Escopo

- Instrumentar o caminho de replay/drain com contadores observáveis: quantos eventos entraram na fila, quantos foram descartados por handle obsoleto, tempo até o primeiro frame renderizado.
- Expor os contadores por sessão de forma consultável em desenvolvimento (log estruturado ou objeto de debug), sem UI nova.
- Teste unitário provando que os contadores refletem a sequência de eventos.

## Fora de escopo

- Otimizar o replay (a decisão de otimizar vem DEPOIS da medida).
- Alterar o protocolo SSE ou o controller.
- Qualquer mudança visual.

## Comportamento esperado

Dada uma sessão com N eventos em voo, os contadores reportam N recebidos, K descartados e o tempo até o primeiro frame — números que permitem confirmar ou descartar a hipótese sem reprodução manual.

## Arquivos afetados

- `frontend/src/features/agent/ui/use-workspace.ts` (leitura + instrumentação)
- `frontend/src/features/agent/ui/chat-pane-send-flow.ts` (leitura)
- `frontend/scripts/replay-queue.test.ts` (estender)

## Acceptance criteria

- [ ] Contadores expostos por sessão, sem custo perceptível quando desligados.
- [ ] Teste prova a contagem de descarte por handle obsoleto.
- [ ] Nenhuma mudança de comportamento do replay (só medição).
- [ ] `npm --prefix frontend run check:quality` verde.

## Cenários de teste

- Fila com eventos de duas sessões, pane troca no meio → descartados contabilizados.
- Sessão sem eventos → contadores zerados, sem crash.
- Instrumentação desligada → nenhum contador alocado.

## Métricas de sucesso

Próxima investigação de lentidão começa com número medido em vez de suspeita.
