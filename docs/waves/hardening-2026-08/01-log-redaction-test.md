---
id: 01
slug: log-redaction-test
status: done
blockedBy: []
executor: deepseek-v4-flash
estimate: 2
verify: "cd controller && bun test src/core/log-redaction.test.ts"
risk: low
linear:
pr: https://github.com/wendeus0/local-studio/pull/7
merged_sha: e62df5bd3eeb9aa0e83b77e93916d53290601d0b
---

# Cobrir a redação de segredos em logs com teste de unidade

## Problema
`controller/src/core/log-redaction.ts` (~80 linhas) redige credenciais em logs de SSE/HTTP e não tem nenhum teste. Regressão nas regexes deixa segredo vazar em log silenciosamente — classe de defeito que volta sem aviso.

## Escopo
Criar `controller/src/core/log-redaction.test.ts` (bun test, padrão dos vizinhos `async.test.ts`/`command.test.ts`) cobrindo o comportamento EXISTENTE da redação: cada padrão de credencial que o módulo redige, e o que ele deve deixar passar intacto.

## Fora de escopo
Alterar `log-redaction.ts` (comportamento atual é a especificação); logs de outros módulos; integração SSE.

## Comportamento esperado
`bun test src/core/log-redaction.test.ts` verde provando: valores sensíveis (tokens/keys/authorization) saem mascarados; texto não-sensível permanece byte-idêntico; casos de borda das regexes (início/fim de linha, múltiplas ocorrências na mesma string) cobertos.

## Arquivos afetados
- `controller/src/core/log-redaction.ts` (ler, NÃO modificar)
- `controller/src/core/log-redaction.test.ts` (criar)

## Acceptance criteria
- Todo padrão de redação tem ≥1 caso positivo (redige) e o conjunto tem casos negativos (não redige demais). Se os padrões NÃO forem exportados, teste exclusivamente pelo comportamento da função pública — NÃO exporte nada novo do módulo.
- Nenhuma mudança fora do arquivo de teste.

## Cenários de teste
- String com token estilo bearer/API key → mascarada.
- String com múltiplas credenciais → todas mascaradas.
- String sem credencial → intacta.
- Credencial no início e no fim da linha (regexes anchored) → mascarada.

## Métricas de sucesso
Suite do controller verde; mutação TEMPORÁRIA de uma regex do módulo faz o teste novo falhar — permitida desde que revertida antes do commit (o "NÃO modificar" vale para o estado commitado); cite a prova no corpo do PR.
