# React Refactor Workflow

> Architecture rules: See orchestration.md. Violations block merge.

## Before Coding

MUST answer:
- What specific improvement am I making?
- Is there adequate test coverage?
- How will I verify behavior is unchanged?

## Process

### 1. Ensure Safety Net
- Run tests to confirm they pass
- Add tests if coverage is insufficient

### 2. Plan
- Map all imports and dependencies
- Identify all callers of affected code
- Break into small, safe steps

### 3. Execute Incrementally

Make one type of change at a time. Examples:

- Rename files to match folder names
- Convert barrel imports to direct imports
- Extract logic into hooks
- Split large components

Run tests after each step.

### 4. Validate
- All tests pass
- No `index.ts` or `index.tsx` files remain
- All entry points match folder names

## Constraints

- Refactoring changes structure, NOT behavior
- NEVER fix bugs during refactor—note them separately
- MUST keep scope contained: one change type at a time
