# React Bugfix Workflow

> Architecture rules: See orchestration.md. Violations block merge.

## Before Coding

MUST answer:
- Can I reproduce the bug?
- What is expected vs actual behavior?
- Is this related to React 18 concurrent features?

## Process

### 1. Reproduce and Isolate
- Confirm the bug exists
- Check if it only occurs in Strict Mode
- Find minimal reproduction case

### 2. Locate Root Cause

**Common React 18 issues:**
- Effects missing cleanup functions
- Effects with stale closures
- Race conditions from concurrent rendering
- Automatic batching behavior changes

### 3. Fix

MUST keep changes within affected feature folder.

```tsx
// Example: Add cleanup for effects
useEffect(() => {
  const controller = new AbortController()
  fetchData(controller.signal)
  return () => controller.abort()
}, [])
```

### 4. Verify
- Confirm bug is fixed
- Test with Strict Mode enabled
- Add test that would have caught this bug

## Constraints

- A bugfix is NOT an opportunity to refactor
- The best fix is the smallest fix
- NEVER introduce barrel exports
- Note other issues separately—don't fix them here
