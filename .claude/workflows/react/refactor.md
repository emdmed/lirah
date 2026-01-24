# React Refactor Workflow

## Architecture Rules

- **Feature architecture**: Organize by feature, not by type
- **No barrel exports**: Never use `index.ts` to re-export
- **Entry point naming**: File must match folder name (`Button/Button.tsx`)
- **Colocation**: Keep related files together

## Before Starting

- [ ] What specific improvement am I making?
- [ ] Is there adequate test coverage?
- [ ] How will I verify behavior is unchanged?

## Process

### 1. Ensure Safety Net
- Run tests to confirm they pass before changes
- Add tests if coverage is insufficient

### 2. Plan the Refactor
- Map all imports and dependencies
- Identify all callers of components and hooks
- Break into small, safe steps

### 3. Execute Incrementally

**Update imports to direct paths:**
```tsx
// Before (barrel)
import { Button } from '@/components'

// After (direct)
import { Button } from '@/shared/components/Button/Button'
```

**Rename entry points:**
```
Button/index.tsx  →  Button/Button.tsx
```

### 4. Validate
- All tests pass
- No `index.ts` or `index.tsx` files remain
- All entry points match folder names

## Reminders

- Refactoring changes structure, not behavior
- If you find bugs, fix them separately
- Keep scope contained—one feature at a time
