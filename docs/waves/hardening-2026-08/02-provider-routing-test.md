---
id: 02
slug: provider-routing-test
status: ready
blockedBy: []
executor: deepseek-v4-flash
estimate: 2
verify: "cd controller && bun test src/services/provider-routing.test.ts"
risk: low
linear:
---

# Cobrir a resolução provider/model com teste de unidade

## Problema
`controller/src/services/provider-routing.ts` (~51 linhas) decide se um pedido vai para provider remoto (`provider/model`) ou runtime local — caminho central do proxy, sem nenhum teste.

## Escopo
Criar `controller/src/services/provider-routing.test.ts` cobrindo o comportamento EXISTENTE: parsing de identificadores `provider/model` vs `local`, defaults, e o que acontece com entradas malformadas.

## Fora de escopo
Alterar `provider-routing.ts`; telemetria de providers; código do frontend.

## Comportamento esperado
`bun test src/services/provider-routing.test.ts` verde com a matriz de roteamento coberta.

## Arquivos afetados
- `controller/src/services/provider-routing.ts` (ler, NÃO modificar)
- `controller/src/services/provider-routing.test.ts` (criar)

## Acceptance criteria
- Cada ramo de decisão do módulo tem ≥1 caso.
- Entradas malformadas (string vazia, `/` solto, provider desconhecido) têm comportamento documentado por teste.

## Cenários de teste
- `openai/gpt-x` → roteia para provider remoto correto.
- Identificador SEM prefixo `provider/` → trave por assert o comportamento ATUAL do módulo (leia o código primeiro; não presuma que existe ramo "local" — se o comportamento atual parecer errado, reporte no PR, NÃO "corrija" o módulo).
- String vazia / só `/` / provider inexistente → o comportamento atual do módulo, travado por assert.

## Métricas de sucesso
Suite do controller verde; o teste falha se a ordem de precedência local-vs-provider for invertida (prove localmente e cite no PR).
