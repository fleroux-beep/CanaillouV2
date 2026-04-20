# Audit Métier — CanaillouV2

Audit de cohérence métier entre le document `REGLES_METIER.md` et l'implémentation code.

## Structure d'audit

```
.audit/
├── README.md                    ← Vous êtes ici
├── AUDIT_SUMMARY.txt           ← Résumé exécutif (à lire d'abord)
└── 01-metier.md                ← Rapport complet détaillé (321 lignes)
```

## Points clés du rapport

### Sévérités

| Code | Signification | Nombre |
|------|---------------|--------|
| **P0** | Bug critique = perte données irréversible | 0 |
| **P1** | Incohérence visible utilisateur / métier | 6 |
| **P2** | Amélioration / clarification documentaire | 3 |

### Top 3 priorités immédiates

1. **forceManual ignoré sur 15 pages** (P1)
   - Utilisateur coche "override manuel" → loyer ne change pas
   - Impacte tous les KPIs AM/GL

2. **Franchises non implémentées** (P1)
   - Table existe (gl_baux_franchises) mais zéro code métier
   - Réductions commerciales jamais appliquées

3. **Split loyer base/actu sans validation** (P1)
   - import-excel.ts utilise loyer budgété comme fallback
   - Peut corrompre valeur base (signature immuable)

### Recommandations timeline

- **Semaine 1** : Corriger forceManual + normalizer statut
- **Semaine 2-3** : Franchises + format trimestre
- **Semaine 4+** : TVA historique + refactoring charges

## Fichiers clés vérifiés

- ✓ `REGLES_METIER.md` (document source)
- ✓ `client/src/lib/am-calculations.ts` (formules)
- ✓ `server/lib/sync-insee.ts` (indexation)
- ✓ 15+ pages GL/AM (gestion affichage loyer)
- ✓ `server/import-excel.ts` (import données)
- ✓ `shared/schema.ts` (schéma base)

## Lecture du rapport

**Pour la direction / PO :** Lire `AUDIT_SUMMARY.txt` (5 min)

**Pour dev/QA :** Lire `01-metier.md` sections P1 (30 min)

**Pour audit interne :** Lire `01-metier.md` complet (60 min)

---

*Rapport généré 2026-04-20 par audit métier approfondi.*
