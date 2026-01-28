# React Performance Workflow

> Architecture rules: See orchestration.md. Violations block merge.

## Before Coding

MUST answer:
- What is the specific performance problem?
- How will I measure improvement?
- Is this a real bottleneck or premature optimization?

## Process

### 1. Measure First
- Profile with React DevTools Profiler
- Identify components that re-render unnecessarily
- Check bundle size with build analyzer
- Measure actual user-facing metrics (not just hunches)

### 2. Identify Root Cause

**Common issues:**
- Components re-rendering when props haven't changed
- Expensive calculations on every render
- Large bundle from unused dependencies
- Missing code splitting on routes

### 3. Optimize

**Prevent unnecessary re-renders:**
```tsx
// Memoize components that receive stable props
const MemoizedList = memo(List)

// Memoize callbacks passed to children
const handleClick = useCallback(() => {
  doSomething(id)
}, [id])

// Memoize expensive derived values
const sorted = useMemo(() => sortItems(items), [items])
```

**Reduce bundle size:**
- Lazy load routes with `React.lazy` + `Suspense`
- Replace heavy libraries with lighter alternatives
- Use tree-shakeable imports

### 4. Verify
- Re-profile to confirm improvement
- Ensure no regressions in functionality
- Document the optimization and why it helped

## Constraints

- NEVER optimize without measuring first
- NEVER add memo/useMemo/useCallback everywhere "just in case"
- MUST prove the optimization helps with real measurements
- Keep optimizations minimal and targeted
