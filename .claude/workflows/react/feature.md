# React Feature Workflow

> Architecture rules: See orchestration.md. Violations block merge.

## Before Coding

MUST answer:
- What problem does this feature solve?
- What's the minimal viable version?
- Which feature folder does this belong in?
- Are there existing patterns to follow?

## Process

### 1. Understand Context
- Read related existing code
- Identify the target feature folder
- Check for similar implementations
- Review reusable hooks and utilities

### 2. Plan Implementation
- Break into small, testable pieces
- Plan component hierarchy
- Identify shared vs feature-specific code
- Design state approach (local, context, or external)

### 3. Implement

**Components:**
- Function components only
- `useState`/`useReducer` for local state

**Hooks:**
- Extract reusable logic into custom hooks
- Components handle rendering; hooks handle logic
- Name descriptively: `useAuthState`, `useFormValidation`
- Place in `hooks/{feature}/{hookName}.ts`

**State:**
- Lift state only as high as necessary
- Prefer composition over prop drilling
- `useSyncExternalStore` for external state

### 4. Validate
- Run existing tests for regressions
- Add tests for new components/hooks
- Test loading and error states
- Remove debugging code and unused imports

## Constraints

- NEVER create `index.ts` or `index.tsx` files
- MUST import directly from file, not folder
- MUST match surrounding code style
- NEVER add features beyond what was requested
