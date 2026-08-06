---
id: 05
slug: ci-hardening
status: in_review
blockedBy: [04]
executor: deepseek-v4-flash
estimate: 2
verify: "grep -q '^permissions:' .github/workflows/ci.yml && grep -q 'cancel-in-progress: true' .github/workflows/ci.yml && grep -q 'cache: npm' .github/workflows/ci.yml && echo ci.yml-hardened"
risk: low
pr: https://github.com/wendeus0/local-studio/pull/13
linear:
---

# Endurecer o ci.yml: permissions mínimas, concurrency e cache

## Problema
`.github/workflows/ci.yml` roda sem `permissions:` no topo (token com default amplo), sem `concurrency` (pushes em sequência empilham runs) e sem cache de npm/bun (`actions/setup-node` sem `cache:`). Só o `pages.yml` tem esses cuidados.

## Escopo
Em `.github/workflows/ci.yml`: (1) `permissions: contents: read` no topo (coluna 0); (2) bloco `concurrency` top-level com group por workflow+ref e `cancel-in-progress: true`; (3) no(s) `actions/setup-node` do job frontend: `cache: npm` e `cache-dependency-path: frontend/package-lock.json`. NÃO mexer no setup do bun nem em outros workflows.

Nota: este ticket depende do 04 (blockedBy) porque ambos editam o MESMO arquivo — nasce de uma base que já contém os steps do 04.

## Fora de escopo
Steps novos de build (ticket 04); security.yml e release.yml; mudar versões de actions.

## Comportamento esperado
CI do PR verde; runs subsequentes do mesmo branch cancelam o anterior; instalação de deps visivelmente mais rápida em re-runs (cache hit no log).

## Arquivos afetados
- `.github/workflows/ci.yml` (editar)

## Acceptance criteria
- `permissions` top-level presente e mínimo (contents: read).
- `concurrency.group` distinto por workflow+ref, `cancel-in-progress: true`.
- Cache configurado no(s) job(s) que instalam dependências npm.

## Cenários de teste
- Verify local parseia o YAML e exige permissions/concurrency/cache.
- CI do PR prova execução real (e o log mostra cache save/restore).

## Métricas de sucesso
Tempo de CI em re-run cai (cache hit); runs zumbis param de acumular.
