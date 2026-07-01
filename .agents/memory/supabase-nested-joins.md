---
name: Supabase nested joins failure pattern
description: Nested join chains in Supabase fail silently when no direct FK exists — safe pattern for this project
---

## Rule
Never use nested Supabase joins like `students(classes(...))` or `student_fees(students(classes(...)))`. The `students` table has no direct FK to `classes` — the link is via `student_enrollments`. These joins fail silently (return null or throw) with no useful error message.

**Why:** Multiple attempts with FK hints and nested selects all failed to return data. The only reliable approach is separate flat queries joined client-side.

## Safe pattern for this project (school-app)
Run THREE simple flat queries, then join in useMemo:
1. `students` — `id, full_name, gender, status, parent_phone, created_at`
2. `student_enrollments` — `student_id, class_id, is_current`
3. `classes` — `id, name, section, stage_id` (already fetched globally)

Build two Maps: `enrollMap: student_id → class_id` (prefer is_current), `classMap: class_id → class`. Join in useMemo. Apply all filters (status, classId) inside the same useMemo.

## Wrong filter pattern (avoid)
```js
// WRONG: compares stage_id with class UUID
rows.filter(r => r.students?.classes?.stage_id === filters.classId)
// CORRECT: direct class_id comparison
enrollMap.get(f.student_id) === filters.classId
```

## For student_fees + payments
- `student_fees`: select `id, student_id, academic_year, total_amount, paid_amount` only
- `payments`: select `id, fee_id, amount, method, paid_at, notes` only
- Join student names and class info via Maps in useMemo — attach as `_class` field on fee rows
- `FeesTableContent` reads class from `(f as any)._class?.name` not `f.students?.classes?.name`
