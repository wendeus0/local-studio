---
id: 06
slug: security-middleware-ratelimit-test
status: ready
blockedBy: [03]
executor: deepseek-v4-flash
estimate: 3
verify: "cd controller && bun test src/http/security-middleware.test.ts"
risk: low
linear:
---

# Cobrir rate limiting e extração de IP do security-middleware

## Problema
A segunda fatia sem teste do `controller/src/http/security-middleware.ts`: rate limit de rotas mutating/read, `getClientIpFromRequestHeaders` (precedência `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for`, ~linhas 45-62) e o cap do store (~linha 64).

## Escopo
ESTENDER `controller/src/http/security-middleware.test.ts` (criado pelo ticket 03 — por isso o blockedBy) com a fatia de rate-limit/IP, em `describe` próprio.

## Fora de escopo
Autenticação por token (já coberta pelo 03); alterar o middleware.

## Comportamento esperado
`bun test src/http/security-middleware.test.ts` verde com as duas fatias.

## Arquivos afetados
- `controller/src/http/security-middleware.ts` (ler, NÃO modificar)
- `controller/src/http/security-middleware.test.ts` (estender)

## Acceptance criteria
- Precedência de headers de IP travada por teste (cada header sozinho + combinações + `x-forwarded-for` com lista).
- Limite excedido → recusa com o status atual; janela renovada → aceita de novo.
- Cap do store: ao atingir o teto, comportamento atual (evict/recusa) travado por teste.

## Cenários de teste
- N+1 requests mutating no mesmo IP dentro da janela → última recusada.
- IPs distintos não compartilham contador.
- `x-forwarded-for: a, b, c` → primeiro IP da lista.
- Nenhum header de IP → fallback atual do módulo.

## Métricas de sucesso
Suite verde; inverter a precedência de headers no módulo faz o teste falhar (prove localmente e cite no PR).
