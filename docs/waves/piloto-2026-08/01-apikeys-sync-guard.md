---
id: 01
slug: apikeys-sync-guard
status: in_review
blockedBy: []
executor: deepseek-v4-pro
estimate: 2
verify: "npm --prefix frontend run check:quality"
pr: https://github.com/wendeus0/local-studio/pull/1
linear:
risk: low
budget_commits: 4
---

# Cobrir com teste o filtro de credenciais no sync remoto de preferências

## Problema

O PROGRESS.md registra que `local-studio.controllers` (com `apiKeys`) é filtrado do sync remoto de preferências ao salvar E ao hidratar, mas o filtro não tem teste de regressão. É a classe de defeito que volta silenciosamente numa refatoração de store: credencial local vazando para o controller remoto.

## Escopo

- Teste unitário do filtro de preferências: dado um estado com `local-studio.controllers` contendo `apiKeys`, o payload enviado ao controller NÃO contém a chave; a persistência local permanece intacta.
- Cobrir os dois sentidos: save e hydrate.
- Arquivo de teste novo em `frontend/scripts/`, seguindo o padrão dos testes existentes (`transcript-cache.test.ts` é boa referência de estilo).

## Fora de escopo

- Alterar o comportamento do filtro (ele está correto; o ticket é de cobertura).
- Mudar formato de `ui-preferences.json` ou a persistência desktop-local.
- Qualquer alteração em `controller/`.

## Comportamento esperado

`npm --prefix frontend run check:quality` roda o teste novo e passa. Se alguém remover o filtro, o teste falha.

## Arquivos afetados

- `frontend/src/store.ts` (leitura, para entender o filtro — não modificar)
- `frontend/src/features/settings/use-settings.ts` (leitura)
- `frontend/scripts/<nome>.test.ts` (novo)

## Acceptance criteria

- [ ] Teste falha se o filtro de `apiKeys` for removido do caminho de save.
- [ ] Teste falha se o filtro for removido do caminho de hydrate.
- [ ] Teste passa no estado atual do repo.
- [ ] `npm --prefix frontend run check:quality` verde.

## Cenários de teste

- Estado com 2 controllers, um com `apiKey` preenchida → payload remoto sem nenhuma `apiKey`.
- Hydrate recebendo payload remoto com `apiKey` → estado local não sobrescreve a credencial local existente.
- Estado sem controllers → payload inalterado (sem crash).

## Métricas de sucesso

Teste versionado e verde no CI; remoção do filtro passa a reprovar o gate.
