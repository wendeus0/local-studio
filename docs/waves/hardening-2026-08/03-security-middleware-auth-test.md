---
id: 03
slug: security-middleware-auth-test
status: ready
blockedBy: []
executor: deepseek-v4-flash
estimate: 3
verify: "cd controller && bun test src/http/security-middleware.test.ts"
risk: low
linear:
---

# Cobrir a autenticação por token do security-middleware com teste de unidade

## Problema
`controller/src/http/security-middleware.ts` (~217 linhas) guarda a API inteira e não tem teste. Esta fatia cobre a autenticação: `safeTokenEquals` (comparação constant-time, ~linha 100) e o fluxo de aceite/recusa de token.

## Escopo
Criar `controller/src/http/security-middleware.test.ts` cobrindo SOMENTE a fatia de auth/token do middleware (padrão dos vizinhos, ex.: `bounded-body.test.ts`). Estruture o arquivo com `describe` separado por área — o ticket 06 adicionará a fatia de rate-limit/IP NO MESMO arquivo.

## Fora de escopo
Rate limiting e extração de IP (ticket 06); alterar o middleware; endpoints específicos.

## Comportamento esperado
`bun test src/http/security-middleware.test.ts` verde provando aceite com token correto, recusa com token errado/ausente/truncado, e que `safeTokenEquals` não vaza por diferença de comprimento.

## Arquivos afetados
- `controller/src/http/security-middleware.ts` (ler, NÃO modificar)
- `controller/src/http/security-middleware.test.ts` (criar)

## Acceptance criteria
- `safeTokenEquals`: iguais → true; diferentes de mesmo comprimento → false; comprimentos diferentes → false.
- 1 caminho feliz (token correto → passa) e 1 recusa (token errado → status atual do middleware). Matriz maior fica para o ticket 06 se couber.
- Nenhuma mudança fora do arquivo de teste; alvo < 150 linhas de teste nesta fatia.

## Cenários de teste
- `safeTokenEquals` com os 3 casos acima.
- Request com token válido → aceita; token errado → recusa (use o mock/harness mais simples que a interface do middleware permitir — se montar o mock exigir mais de ~50 linhas, reporte ROUTE_STATUS: RECLASSIFY em vez de inflar o PR).

## Métricas de sucesso
Suite verde; fatia enxuta que o ticket 06 estende sem retrabalho (mutação temporária local para provar que o teste morde é permitida DESDE QUE revertida antes do commit).
