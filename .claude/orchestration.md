# Orchestration

## Technology Detection

Before selecting a workflow, determine the technology stack:

**React Project Indicators:**
- Files with `.jsx` or `.tsx` extensions
- Imports from `react`, `react-dom`, or `@react-*` packages
- React hooks (`useState`, `useEffect`, `useContext`, etc.)
- JSX syntax (`<Component />`, `<div className=...>`)
- `package.json` with `react` as a dependency
- Frameworks: Next.js, Remix, Gatsby, Create React App

If React indicators are present → use `workflows/react/` directory

## Available Workflows

| Workflow | Use When |
|----------|----------|
| `feature.md` | Building new functionality |
| `bugfix.md` | Diagnosing and fixing bugs |
| `refactor.md` | Improving code without behavior changes |
| `performance.md` | Profiling and optimizing performance |
| `review.md` | Reviewing code for merge |
| `pr.md` | Generating PR title and description |
| `docs.md` | Writing or updating documentation |

**Workflow Path:**
- React projects: `workflows/react/{workflow}.md`
- Other projects: `workflows/{workflow}.md`

## Rules

- Use judgment to select **at most one** workflow per task
- Skip workflows for trivial tasks (typos, simple renames, one-line fixes)
- Workflows are process guidance, not rigid scripts
- Read the workflow file before starting, adapt steps as needed

---

## React Architecture Rules

All React workflows MUST follow these rules. Violations block merge.

### Structure
- **Feature-based**: Organize by feature, not by type
- **No barrels**: NEVER use `index.ts` to re-export from a folder
- **Entry naming**: Main file MUST match folder name (`Button/Button.tsx`, not `Button/index.tsx`)
- **Colocation**: Keep related files together (component, hooks, types, tests, styles)

### File Structure
```
features/
  auth/
    auth.tsx              # Entry point (matches folder name)
    auth.hooks.ts         # Feature-specific hooks
    auth.types.ts         # Feature-specific types
    auth.test.tsx         # Feature tests
    components/
      LoginForm/
        LoginForm.tsx     # Component entry (matches folder name)
        LoginForm.test.tsx
```

### Import Convention
```tsx
// CORRECT: Direct imports
import { LoginForm } from '@/features/auth/components/LoginForm/LoginForm'
import { useAuth } from '@/features/auth/auth.hooks'

// WRONG: Barrel imports - NEVER do this
import { LoginForm } from '@/features/auth/components'
import { useAuth } from '@/features/auth'
```
