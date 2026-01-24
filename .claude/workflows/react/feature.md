# React Feature Workflow

## React 18 Best Practices

### Architecture Rules
- **Feature architecture**: Organize by feature, not by type
- **No barrel exports**: Never use `index.ts` to re-export from a folder
- **Entry point naming**: Main file must match folder name (`Button/Button.tsx`, not `Button/index.tsx`)
- **Colocation**: Keep related files together (component, hooks, types, tests, styles)

### File Structure Example
```
features/
  auth/
    auth.tsx              # Feature entry point (matches folder name)
    auth.hooks.ts         # Feature-specific hooks
    auth.types.ts         # Feature-specific types
    auth.test.tsx         # Feature tests
    components/
      LoginForm/
        LoginForm.tsx     # Component entry (matches folder name)
        LoginForm.test.tsx
```

### Import Rules
```tsx
// CORRECT: Direct imports
import { LoginForm } from '@/features/auth/components/LoginForm/LoginForm'
import { useAuth } from '@/features/auth/auth.hooks'

// WRONG: Barrel imports
import { LoginForm } from '@/features/auth/components'
import { useAuth } from '@/features/auth'
```

## Before Starting

- [ ] What problem does this feature solve?
- [ ] What's the minimal viable version?
- [ ] Which feature folder does this belong in?
- [ ] Are there existing patterns in the codebase to follow?

## Process

### 1. Understand the Context
- Read related existing code
- Identify the feature folder this belongs in
- Check for similar implementations to learn from
- Review existing hooks and utilities that can be reused

### 2. Plan the Implementation
- Break down into small, testable pieces
- Plan the component hierarchy
- Identify shared vs feature-specific code
- Design state management approach (local state, context, or external)

### 3. Implement with React 18 Patterns

**Component Patterns:**
- Use function components exclusively
- Prefer `useState` and `useReducer` for local state
- Use `useTransition` for non-urgent updates
- Use `useDeferredValue` for expensive computations
- Wrap lazy-loaded components with `Suspense`

**Hooks:**
- Extract reusable logic into custom hooks
- Abstract complex business logic to hooks—components should only handle rendering
- Name hooks descriptively: `useAuthState`, `useFormValidation`
- Keep hooks focused on single responsibilities
- Place feature hooks in `{feature}.hooks.ts`

**State Management:**
- Lift state only as high as necessary
- Use composition over prop drilling
- Consider React Context for feature-wide state
- Use `useSyncExternalStore` for external state integration

### 4. Validate
- Run existing tests to catch regressions
- Add tests for new components and hooks
- Test loading and error states
- Verify Suspense boundaries work correctly
- Ensure types pass with strict mode

### 5. Clean Up
- Remove any debugging code
- Ensure code follows project conventions
- Check for unused imports or variables
- Verify no barrel exports were introduced

## Reminders

- Create new files following the naming convention (folder name = entry file name)
- Never create `index.ts` or `index.tsx` files
- Import directly from the file, not from folder paths
- Match the style of surrounding code
- Don't add features beyond what was requested
- Use Suspense for code splitting, not just loading states
