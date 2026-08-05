# Piloto de ondas — local-studio (2026-08)

Primeiro esforço real do workflow de ondas do harness (`~/.claude`, features
070/071/072). Formato dos tickets: `core/references/wave-ticket-format.md`.

## Papéis

- **Humano (você)**: único que faz merge. Aprova a proposta de onda, revisa PRs,
  puxa o kill-switch se preciso.
- **Claude**: orquestrador. Propõe onda (`wave_next.py`), dispara workers,
  monitora, reconcilia merges. Não mergeia.
- **DeepSeek V4 (OpenCode CLI)**: workers, um por ticket, em worktree Orca
  isolado, branch `wave/<NN>-<slug>`.

## Ciclo

```bash
# 1. validar
python3 ~/.claude/core/skills/wave/scripts/wave_lint.py docs/waves/piloto-2026-08
# 2. propor (mostra NEXT_WAVE/REASON/COMMANDS)
python3 ~/.claude/core/skills/wave/scripts/wave_next.py docs/waves/piloto-2026-08
# 3. disparar (após sua aprovação; exige fanout-lock e ausência de ~/.claude/KILL)
# 4. você revisa e mergeia os PRs
# 5. voltar ao passo 2 — a próxima onda sai dos blockers satisfeitos
```

## Critério de sucesso (5 binários)

1. 100% dos PRs passam CI.
2. Zero push fora de `wave/<ticket>-*`.
3. Zero secret no egress (scan fail-closed).
4. ≥80% dos tickets mergeados sem retrabalho além do review.
5. Merge 100% humano.

## Kill-switch

`touch ~/.claude/KILL` para o dispatcher; `orca worktree stop` em emergência.
Gatilhos: qualquer secret no egress; 2ª violação de escopo/branch na mesma onda;
budget estourado 2× pelo mesmo ticket.

## Guarda-corpos ativos

- Rulesets no GitHub: criação de branch restrita a `wave/*`; `main` exige PR,
  sem force-push e sem deleção (bypass de admin para você).
- `.wave-instruction-allowlist`: arquivos de instrução de agente revisados.
- Install two-phase: dependências instaladas com `--ignore-scripts` antes de
  qualquer credencial.
