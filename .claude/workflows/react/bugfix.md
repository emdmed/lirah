# React Bugfix Workflow

## Architecture Rules

- **Feature architecture**: Organize by feature, not by type
- **No barrel exports**: Never use `index.ts` to re-export
- **Entry point naming**: File must match folder name (`Button/Button.tsx`)

## Before Starting

- [ ] Can I reproduce the bug?
- [ ] What is the expected vs actual behavior?
- [ ] Is this related to React 18 concurrent features?

## Process

### 1. Reproduce and Isolate
- Confirm the bug exists
- Check if it only occurs in Strict Mode (development)
- Find the minimal reproduction case

### 2. Locate the Root Cause

**Common React 18 issues:**
- Effects with missing cleanup functions
- Effects depending on stale closures
- Race conditions from concurrent rendering
- Automatic batching behavior changes

### 3. Fix

Keep changes within the affected feature folder. Don't introduce barrel exports.

```tsx
// Fix: Add cleanup for effects
useEffect(() => {
  const controller = new AbortController()
  fetchData(controller.signal)
  return () => controller.abort()
}, [])
```

### 4. Verify
- Confirm the bug is fixed
- Test with Strict Mode enabled
- Add a test that would have caught this bug

## Reminders

- A bugfix is not an opportunity to refactor
- The best fix is usually the smallest fix
- If you discover other issues, note them separately
