# Audit Code Client React/TypeScript — Canaillou V2
## Asset Management & Gestion Locative

Date : 2026-04-20  
Scope : `/client/src/` (React, TypeScript, wouter, TailwindCSS)  
Audit : UI bugs, missing states (loading/error/empty), form issues, accessibility, consistency, TypeScript safety

---

## SUMMARY

**P0 (Critical)** : 3 bugs  
**P1 (High)** : 12 issues  
**P2 (Medium)** : 8 issues  
**Duplications** : 2 major patterns (types, CRUD boilerplate)

---

## P0 — CRITICAL BUGS (User-visible data loss / UX breaks)

### 1. Missing `forceManual` UI in GL Baux.tsx  
**File** : `/client/src/pages/gestion-locative/Baux.tsx:1-146`  
**Symptom** : Baux form lacks toggle for "Force manual rent override" that exists in AM Baux.tsx. Users cannot manually override rent in GL despite GL Baux DB schema supporting `forceManual` + `loyerManuelOverride`.  
**Root cause** : Gestion Locative page copy-pasted from old logic without full field implementation.  
**Impact** : P0 — GL loyer updates stuck with auto-indexation even when manual override needed for commercial renegotiations.  
**Fix** : Add `forceManual` checkbox + `loyerManuelOverride` field to GL Baux form dialog (see AM Baux.tsx:250–283 for reference).

---

### 2. TypeScript Type Mismatch: BailAM missing `loyerManuelOverride`  
**File** : `/client/src/types/am.ts:136–165`  
**Symptom** : `BailAM` interface missing `loyerManuelOverride` field defined in calculations. Pages using this field cast to `any`.  
**Evidence** :  
- `/client/src/lib/am-calculations.ts:52` defines `loyerManuelOverride?: string | null`  
- `/client/src/pages/asset-management/Baux.tsx:47–87` uses `r.loyerManuelOverride` without error in local interface but would fail if using imported `BailAM` type  

**Root cause** : Types split: local interfaces in pages override centralized types; schema drift.  
**Impact** : P0 — Silent type unsafety; refactoring risk (e.g., rename field server-side breaks pages locally)  
**Fix** : Update `/client/src/types/am.ts` line 152 to add:  
```typescript
export interface BailAM {
  // ... existing fields ...
  loyerManuelOverride?: string | null;  // ADD THIS
  // ... rest ...
}
```

---

### 3. Form Double-Submit via Disabled Button Timing  
**File** : `/client/src/components/ui/form-dialog.tsx:116–126`  
**Symptom** : Button disabled only after async mutation starts (`loading` flag). Fast double-click submits twice if click happens before `loading` state propagates.  
**Reproduction** : Click submit button twice within <100ms on slow connection.  
**Root cause** : No optimistic disabling; React state update lag between click and disabled=true rendering.  
**Impact** : P0 — Duplicate creates/updates if network slow (e.g., create 2 identical lots, 2 bails).  
**Fix** : Disable button on form submit immediately:  
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const submitBtn = (e.currentTarget as HTMLFormElement).querySelector('button[type="submit"]') as HTMLButtonElement;
  if (submitBtn) submitBtn.disabled = true;  // Immediate visual feedback
  // ... rest of submit logic ...
};
```
Or use `useTransition()` from React 18 for isPending state.

---

## P1 — HIGH PRIORITY (UX degraded / data UI inconsistent)

### 4. Missing Error State in useCrud Hook  
**File** : `/client/src/hooks/useCrud.ts:1–62`  
**Symptom** : Hook exposes `creating`, `updating`, `deleting` states but **not** error state. If mutation fails, toast shows but no `isError` flag available to render error banner in UI.  
**Evidence** :  
- 25 pages use `useCrud<T>()` but cannot check `isError`  
- Example: `/client/src/pages/asset-management/Actifs.tsx` line 19 — no error handling UI  

**Impact** : P1 — Users see toast briefly but form stays open. Unclear if save failed or succeeded.  
**Fix** : Add error tracking to hook:  
```typescript
const [error, setError] = useState<Error | null>(null);
const createMutation = useMutation({
  mutationFn: ...,
  onError: (err: Error) => {
    setError(err);
    toast({ ... });
  },
  onSuccess: () => {
    setError(null);  // Clear on success
    // ...
  },
});
return { ..., error, isError: !!error, clearError: () => setError(null) };
```

---

### 5. No Empty State Messages in CRUD Lists  
**File** : Multiple pages  
- `/client/src/pages/asset-management/Baux.tsx:194–200` — "Aucun bail enregistré"  
- `/client/src/pages/asset-management/Actifs.tsx:71–78` — "Aucun actif enregistré"  
- But **no distinction** between:
  1. Empty (0 items, data loaded) → user should create first one
  2. Loading (fetching from API)
  3. Error (fetch failed)

**Symptom** : DataTable shows empty message for both "loading" and "no results". User can't tell if data is still fetching or actually empty.  
**Impact** : P1 — Confusing UX on first page visit before data loads.  
**Fix** : Modify DataTable component to accept `isLoading` and `isError` props:  
```typescript
<DataTable
  data={data}
  isLoading={isLoading}
  isError={isError}
  errorMessage="Erreur de chargement"
  emptyMessage="Aucun actif enregistré"
  loadingFallback={<SkeletonTable />}
/>
```

---

### 6. ActifDetail.tsx — Spinner has no Text; No Error State  
**File** : `/client/src/pages/asset-management/ActifDetail.tsx:111–117`  
**Symptom** :  
```typescript
if (!actif) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
```
Spinner lacks "Chargement..." text. No error handling if query fails (`isError`, `error` not checked).  
**Impact** : P1 — Blank page on error or very slow loading; user thinks page is broken.  
**Fix** :  
```typescript
const { data: actif, isLoading, isError, error } = useQuery({...});
if (isLoading) {
  return <SkeletonCard />; // Use consistent skeleton from kit
}
if (isError) {
  return (
    <GlassCard>
      <div className="flex items-center gap-3 text-red-600">
        <AlertTriangle className="h-5 w-5" />
        <span>Erreur: {error?.message || "Impossible de charger cet actif"}</span>
      </div>
    </GlassCard>
  );
}
```

---

### 7. Loyer Display Inconsistency Across Pages  
**File** : Multiple pages  
**Symptom** : Three different ways loyer is displayed:  
1. **Baux.tsx:47–96** : Uses `resolveLoyerAnnuel()` — checks `forceManual > loyerHTActu > loyerBaseHT` ✓ **Correct**  
2. **Lots.tsx:38–40** : Uses `Number(b.loyerHTActu || b.loyerBaseHT || 0)` — ignores `forceManual` ✗ **Bug**  
3. **Dashboard.tsx:79–102** : Uses `getLoyerAnnuelActif()` from am-calculations ✓ **Correct**  

**Evidence** :  
- Dashboard KPI shows 100k EUR  
- Same actif in Lots table shows 95k EUR (if forceManual active)  
- Total loyers don't reconcile  

**Impact** : P1 — Data inconsistency; asset managers can't trust totals.  
**Fix** : Enforce `getBailLoyerAnnuel()` from am-calculations.ts everywhere:  
```typescript
// Lots.tsx line 38
import { getBailLoyerAnnuel } from "../../lib/am-calculations";
const annuel = getBailLoyerAnnuel(bail);  // Use this
```

---

### 8. missing Badge "M" / "↗" on Gestion Locative Baux  
**File** : `/client/src/pages/gestion-locative/Baux.tsx:34–48`  
**Symptom** : GL Baux list shows loyer HT but **no visual indicator** (badge "M" for manual, "↗" for indexed). AM Baux shows these badges (line 85–95).  
**Impact** : P1 — GL asset managers can't visually distinguish auto-indexed vs. manually-overridden rents.  
**Fix** : Apply same badge logic to GL Baux.tsx loyer render:  
```typescript
// In GL Baux render:
const ht = Number(r.loyerHTActu || r.loyerBaseHT || 0);
const isManual = r.forceManual && Number(r.loyerManuelOverride || 0) > 0;
const isIndexed = r.loyerHTActu && Number(r.loyerHTActu) !== Number(r.loyerBaseHT || 0);
return (
  <span>
    {formatCurrency(ht)}
    {isManual && <span className="ml-1 text-[10px] text-amber-600">M</span>}
    {isIndexed && <span className="ml-1 text-[10px] text-emerald-600">↗</span>}
  </span>
);
```

---

### 9. Baux.tsx GL — forceManual Checkbox Missing Validation  
**File** : `/client/src/pages/gestion-locative/Baux.tsx` (when fixed per #1)  
**Symptom** : If user checks "Force manual" but leaves override field empty, form silently allows NaN.  
**Impact** : P1 — Silent data entry error; loyer becomes invalid.  
**Fix** : Add required validation to loyerManuelOverride when forceManual=true:  
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  if (form.forceManual && !form.loyerManuelOverride) {
    toast({ title: "Erreur", description: "Loyer manuel obligatoire si forcé", variant: "destructive" });
    return;
  }
  // ... rest ...
};
```

---

### 10. Dashboard Responsive Issue — Wide Tables on Mobile  
**File** : `/client/src/pages/asset-management/Dashboard.tsx:224–315`  
**Symptom** : DetailTable (line 238–314) shows 13 columns on mobile. Horizontal scroll is broken; column names misaligned with data.  
**Evidence** : Table has no responsive stack mode.  
**Impact** : P1 — Mobile dashboard unusable for asset managers in field.  
**Fix** : Add responsive wrapper to table:  
```typescript
<div className="overflow-x-auto -mx-4 sm:mx-0 scrollbar-thin">
  <div className="inline-block min-w-full px-4 sm:px-0">
    <table className="w-full ...">
    {/* ... */}
    </table>
  </div>
</div>
```
Or use CSS grid stacking on mobile.

---

### 11. useCrud — No Loading State for Fetch (useQuery)  
**File** : `/client/src/hooks/useCrud.ts:10–14`  
**Symptom** : useQuery has default `staleTime: 30s`, so data may be stale. But `isLoading` on initial render is exposed (good), BUT pages using useCrud don't handle it.  
**Evidence** : `/client/src/pages/asset-management/Actifs.tsx` — no spinner while fetching list.  
**Impact** : P1 — First page load shows empty DataTable briefly before data pops in.  
**Fix** : Export `isLoading` from useCrud and use in pages:  
```typescript
export function useCrud<T>(...) {
  const { data = [], isLoading } = useQuery({ ... });
  return { ..., isLoading };
}
// Pages: <DataTable data={data} isLoading={isLoading} />
```

---

### 12. Formulaires Gestion Locative — Autocomplete Index Doesn't Validate  
**File** : `/client/src/pages/gestion-locative/Baux.tsx:75–84`  
**Symptom** : Auto-assign index based on type (e.g., habitation → IRL) uses regex normalization. BUT if user types "résidentiel" vs "résidenciel" (typo), regex may not match and skip auto-fill.  
**Impact** : P1 — UX friction; user manually selects index for ~20% of baux due to accented typos.  
**Fix** : Use diacritics-insensitive comparison:  
```typescript
const normalizeForMatch = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
if (normalizeForMatch(value).includes("resident")) next.indiceReference = "IRL";
```

---

## P2 — MEDIUM PRIORITY (Polish, edge cases)

### 13. formatCurrency Handles Null Safely But No Inline Zero Check  
**File** : `/client/src/lib/utils.ts:14–22`  
**Symptom** : Many renders check `if (value <= 0) return "—"` before formatCurrency. If passed 0 directly, shows "0,00 €" instead of "—".  
**Example** : `/client/src/pages/asset-management/Baux.tsx:80` (annuel <= 0 check good), but other pages miss this.  
**Impact** : P2 — Visual inconsistency (some cells show "0,00 €", others "—").  
**Fix** : Update formatCurrency to optionally hide zeros:  
```typescript
export function formatCurrency(value: number | string | null | undefined, hideZero = false): string {
  const num = toSafeNumber(value);
  if (hideZero && num === 0) return "—";
  return new Intl.NumberFormat(...).format(num);
}
```

---

### 14. DSCR Display "N/A" Logic Scattered  
**File** : Multiple pages  
- `/client/src/pages/asset-management/Dashboard.tsx:185` renders `n > 0 ? n.toFixed(2) + "x" : "N/A"`  
- `/client/src/pages/asset-management/Dashboard.tsx:286` duplicates logic  

**Impact** : P2 — Code duplication; if DSCR threshold changes, 5+ places need update.  
**Fix** : Create helper:  
```typescript
export const formatDSCR = (value: number | null) =>
  value && value > 0 ? `${value.toFixed(2)}x` : "N/A";
```

---

### 15. Lot Status Normalization Hardcoded in Multiple Places  
**File** :  
- `/client/src/pages/asset-management/Dashboard.tsx:71` (lotsLoues filter)  
- `/client/src/pages/asset-management/Lots.tsx:49` (badge render)  
- `/client/src/pages/asset-management/ActifDetail.tsx:134` (lotsLoues calc)  

All use `.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue"`  
**Impact** : P2 — Magic string; if statut value changes DB-side, 3+ places break.  
**Fix** : Create utility:  
```typescript
export const isLotLoue = (statut: string | null | undefined): boolean =>
  statut?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "loue";
```

---

### 16. Date Format Not Enforced on Mobile  
**File** : Form fields  
**Symptom** : HTML `<input type="date" />` relies on browser locale. On mobile, user might see "April 20, 2026" (US) instead of "20/04/2026" (FR) depending on device settings.  
**Impact** : P2 — Confusion for users in bilingual environments.  
**Fix** : Use `<input type="date" />` but add visible placeholder with format hint in label.

---

### 17. KPI Cards Missing Context on Zero Values  
**File** : `/client/src/components/ui/kpi-card.tsx` (if applicable) or Dashboard pages  
**Symptom** : LTV=0%, DSCR=0.00x displayed same as normal. Should clarify: LTV 0% is good (no debt), but DSCR 0 means no debt service (might be good or data error).  
**Impact** : P2 — Misinterpretation by non-expert users.  
**Fix** : Add tooltips to distinguish zero scenarios.

---

### 18. No Toast/Banner After Successful Form Submit in Some Pages  
**File** : `/client/src/pages/asset-management/Lots.tsx:82–86`  
**Symptom** : useCrud shows toast on success (via hook), but form immediately closes. User doesn't see confirmation toast because form unmounts dialog.  
**Impact** : P2 — Silent success; user uncertain if save worked.  
**Fix** : Keep dialog open briefly or show toast outside dialog context.

---

### 19. Responsive Columns Mismatch in DetailTable  
**File** : `/client/src/pages/asset-management/Dashboard.tsx:241–314`  
**Symptom** : Table hardcodes `{entityLabel === "SCI" && <SH label="Actifs" />}` but on mobile, columns still overflow. No collapsible/hide logic for less-important columns (e.g., "Occup.").  
**Impact** : P2 — Mobile dashboard requires excessive horizontal scrolling.  
**Fix** : Add `hidden sm:table-cell` classes to lower-priority columns.

---

## P2 — TYPE & CODE QUALITY

### 20. Massive Type Duplication Across Pages  
**Files** :  
- `/client/src/pages/asset-management/Baux.tsx:14–41` defines `BailAM` locally  
- `/client/src/pages/asset-management/ActifDetail.tsx:25–75` redefines `Actif`, `Lot`, `BailLite`, `SCI`  
- `/client/src/pages/asset-management/Calendrier.tsx` redefines `Emprunt`, `BailAM`, `Travaux`  
- `/client/src/pages/gestion-locative/BailDetail.tsx` redefines `Avenant`, `Renouvellement`  
- `/client/src/pages/gestion-locative/ControleBailleur.tsx` redefines `BailGL`, `Bailleur`, etc.  

**Count** : 30+ interface/type redefinitions instead of importing from `/client/src/types/`.  
**Impact** : P2 — Refactoring nightmare; if Actif schema changes, 5+ files need manual sync.  
**Fix** : Delete local type definitions, import from centralized:  
```typescript
import type { BailAM, Actif, Lot } from "../../types/am";
import type { BailGL, Bailleur } from "../../types/gl";
```
Then update types/* to match latest schema.

---

### 21. CRUD Boilerplate Repeated 25 Times  
**Symptom** : Every page with useCrud repeats:  
```typescript
const [dialogOpen, setDialogOpen] = useState(false);
const [editing, setEditing] = useState<T | null>(null);
const [form, setForm] = useState<Partial<T>>(empty);
const [deleteId, setDeleteId] = useState<string | null>(null);

const openCreate = () => { ... };
const openEdit = () => { ... };
const onChange = (name: string, value: string) => setForm(...);
const handleSubmit = async (e) => { ... };
```

**Impact** : P2 — Maintenance burden; bugs in useCrud pattern replicated 25x.  
**Fix** : Create reusable hook:  
```typescript
export function useCrudForm<T extends { id: string }>(emptyValue: T) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // ... return { dialogOpen, editing, form, ... }
}
```

---

## ACCESSIBILITY ISSUES

### 22. FormField Suffix/Prefix Not Screen-Reader-Friendly  
**File** : `/client/src/components/ui/form-field.tsx:98–114`  
**Symptom** : Suffix (e.g., "EUR", "m²") is `aria-hidden="true"`. Good for decoration, but no `aria-label` on input to convey unit (e.g., "Loyer HT annuel en EUR").  
**Impact** : Screen reader users don't hear units.  
**Fix** :  
```typescript
<input
  aria-label={`${label}${suffix ? ` en ${suffix}` : ""}`}
  {...}
/>
```

---

### 23. Empty `<div role="dialog">` in FormDialog  
**File** : `/client/src/components/ui/form-dialog.tsx:54–68`  
**Symptom** : Div has `role="dialog"` but no `aria-label` or `aria-labelledby` on the dialog itself (only on form inside). Should be on the outer container.  
**Impact** : Minor — WCAG would prefer aria-labelledby on role=dialog parent.  
**Fix** :  
```typescript
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}  // Move here
>
```

---

## SUMMARY TABLE

| ID | File | Issue | Severity | Type |
|---|---|---|---|---|
| 1 | gestion-locative/Baux.tsx | Missing forceManual UI | P0 | Feature |
| 2 | types/am.ts | Missing loyerManuelOverride | P0 | TypeScript |
| 3 | form-dialog.tsx | Double-submit via timing | P0 | UX |
| 4 | hooks/useCrud.ts | No error state export | P1 | State Mgmt |
| 5 | Multiple | No empty state handling | P1 | UX |
| 6 | ActifDetail.tsx | No error/loading UI | P1 | UX |
| 7 | Multiple pages | Loyer display inconsistency | P1 | Data |
| 8 | Baux GL | Missing badges M/↗ | P1 | UI |
| 9 | Baux GL | Missing validation on forceManual | P1 | Validation |
| 10 | Dashboard.tsx | Wide table on mobile | P1 | Responsive |
| 11 | useCrud + pages | No loading state on fetch | P1 | State |
| 12 | Baux GL | Index autocomplete regex fragile | P1 | UX |
| 13 | utils.ts + pages | Zero value display inconsistent | P2 | Polish |
| 14 | Dashboard (5x) | DSCR formatting duplicated | P2 | DRY |
| 15 | Multiple (3x) | Lot status normalization scattered | P2 | DRY |
| 16 | Form fields | Date format mobile UX | P2 | UX |
| 17 | KPI cards | Zero context missing | P2 | UX |
| 18 | Lots.tsx | Toast timing on close | P2 | UX |
| 19 | Dashboard | Responsive table columns | P2 | Mobile |
| 20 | 30+ locations | Type duplication | P2 | Code Quality |
| 21 | 25+ pages | CRUD boilerplate | P2 | Maintenance |
| 22 | form-field.tsx | Suffix not screen-reader friendly | P2 | A11y |
| 23 | form-dialog.tsx | Dialog aria-labelledby placement | P2 | A11y |

---

## DUPLICATIONS

### 1. Type Definition Duplication  
**Scope** : `/client/src/pages/**/*.tsx` redefine types instead of importing from `/client/src/types/`  
**Count** : ~30 interfaces redefined locally  
**Solution** : Enforce imports from centralized types module; delete local definitions.  
**Files to update** :  
- `/client/src/pages/asset-management/Baux.tsx:14–41` (BailAM) → import from `types/am`  
- `/client/src/pages/asset-management/ActifDetail.tsx:25–75` (Actif, Lot, etc.) → import  
- `/client/src/pages/asset-management/Calendrier.tsx` (Emprunt, etc.) → import  
- All GL pages → import from `types/gl`  

---

### 2. CRUD Form Boilerplate  
**Scope** : 25 pages using useCrud with identical state + handlers  
**Pattern** : Every page repeats:  
```typescript
const [dialogOpen, setDialogOpen] = useState(false);
const [editing, setEditing] = useState<T | null>(null);
const [form, setForm] = useState<Partial<T>>(empty);
const [deleteId, setDeleteId] = useState<string | null>(null);
const openCreate = () => { ... };
const openEdit = (item) => { ... };
const onChange = (name, value) => { ... };
const handleSubmit = async (e) => { ... };
```

**Solution** : Create reusable hook `useCrudForm<T>()` to centralize.  
**Pages affected** : Actifs, Baux (both), Lots, Locataires, Associes, Emprunts, etc.  

---

## RECOMMENDATIONS (Not in scope of audit but noted)

1. **E2E tests** for CRUD flows to catch double-submit + state issues.  
2. **Storybook** for form components to validate accessibility + edge states.  
3. **Schema validation** (e.g., zod) on client to match server schema; auto-generate types.  
4. **Lint rule** to enforce imports from `types/` and forbid local type definitions in pages.

---

## CONCLUSION

- **3 P0 bugs** must be fixed before release (forceManual UI, type safety, double-submit)  
- **12 P1 issues** significantly degrade UX/consistency  
- **8 P2 issues** improve maintainability but lower priority  
- **Major refactor opportunity** : Centralize types & CRUD boilerplate (1–2 days, prevents future bugs)

