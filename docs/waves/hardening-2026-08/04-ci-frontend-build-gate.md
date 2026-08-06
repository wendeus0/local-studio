---
id: 04
slug: ci-frontend-build-gate
status: ready
blockedBy: []
executor: deepseek-v4-flash
estimate: 2
verify: "grep -q 'npm run build' .github/workflows/ci.yml && grep -q 'validate-package-json' .github/workflows/ci.yml && grep -q 'working-directory: frontend' .github/workflows/ci.yml && echo ci.yml-ok"
risk: low
linear:
---

# Adicionar build do frontend e validate-package-json ao CI

## Problema
`frontend/package.json` inclui `npm run build` e `scripts/validate-package-json.mjs` no `check:quality`, mas o job `frontend` do `.github/workflows/ci.yml` não roda nenhum dos dois — regressão de build standalone (há `frontend/scripts/assert-standalone-build.mjs` e fixes recentes de artefatos desktop) passa direto no CI.

## Escopo
No job `frontend` de `.github/workflows/ci.yml`, adicionar steps: `npm run build` e `node scripts/validate-package-json.mjs` — ambos com `working-directory: frontend` explícito (siga o padrão dos steps existentes do job), após os checks existentes. Manter o restante do workflow intacto.

## Fora de escopo
Permissions/concurrency/cache (ticket 05); outros workflows; mudanças no build em si.

## Comportamento esperado
PR deste ticket mostra o job `frontend` executando e passando com os dois steps novos; um PR que quebre o build standalone passa a ficar vermelho.

## Arquivos afetados
- `.github/workflows/ci.yml` (editar, job frontend)
- `frontend/package.json` e `frontend/scripts/validate-package-json.mjs` (ler — NÃO modificar)

## Acceptance criteria
- Steps novos presentes no job frontend, na ordem: checks existentes → build → validate-package-json.
- CI do próprio PR verde.

## Cenários de teste
- O verify local parseia o YAML e exige os dois steps.
- CI do PR é a prova de execução real.

## Métricas de sucesso
Job frontend do CI cobre build standalone; nenhum aumento de tempo além do build em si.
