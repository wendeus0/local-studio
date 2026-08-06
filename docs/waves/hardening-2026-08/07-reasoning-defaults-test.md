---
id: 07
slug: reasoning-defaults-test
status: ready
blockedBy: []
executor: deepseek-v4-flash
estimate: 3
verify: "cd controller && bun test src/modules/proxy/reasoning.test.ts"
risk: low
linear:
---

# Travar o pareamento reasoning ↔ model-runtime-defaults com teste

## Problema
`controller/src/modules/proxy/reasoning.ts` (~319 linhas, sem teste) trata quirks de streaming de reasoning por família de modelo, e o `CONTEXT.md` do repo exige que ele CONCORDE com `controller/src/modules/engines/process/model-runtime-defaults.ts`. Hoje nada trava esse pareamento — drift entre os dois é silencioso.

## Escopo
Criar `controller/src/modules/proxy/reasoning.test.ts` cobrindo: (1) o comportamento por família exportado por `reasoning.ts`; (2) um teste de CONSISTÊNCIA com invariante CONCRETO: importe os dois módulos, itere as famílias/chaves declaradas em `model-runtime-defaults.ts` e asserte que cada uma resolve em `reasoning.ts` um tratamento DEFINIDO (diferente do fallback/default silencioso) — compare os conjuntos de chaves dos dois módulos e falhe nomeando a família divergente. PROIBIDO assert tautológico (ex.: comparar um módulo com ele mesmo, ou aceitar o default como "coerente").

## Fora de escopo
Alterar qualquer um dos dois módulos; o proxy em si; tool-call parsing.

## Comportamento esperado
`bun test src/modules/proxy/reasoning.test.ts` verde; adicionar uma família em um módulo sem o outro passa a QUEBRAR o teste.

## Arquivos afetados
- `controller/src/modules/proxy/reasoning.ts` (ler, NÃO modificar)
- `controller/src/modules/engines/process/model-runtime-defaults.ts` (ler, NÃO modificar)
- `CONTEXT.md` (ler — é onde vive a regra de concordância entre os dois módulos)
- `controller/src/modules/proxy/reasoning.test.ts` (criar)

## Acceptance criteria
- Cada família com tratamento em `reasoning.ts` tem caso de comportamento.
- Teste de consistência cruzada entre os dois módulos existe e falha sob drift (demonstre com uma mutação local revertida e cite no PR).

## Cenários de teste
- Stream com blocos de reasoning da família X → transformação esperada.
- Família presente em runtime-defaults e ausente em reasoning (simulada) → teste de consistência falha.

## Métricas de sucesso
Drift família↔flags deixa de ser silencioso; suite do controller verde.
