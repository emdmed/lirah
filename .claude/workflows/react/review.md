# React Code Review Workflow

> Architecture rules: See orchestration.md. Violations block merge.

## Before Reviewing

MUST answer:
- What is this change trying to accomplish?
- What files are modified?

## Process

### 1. Understand the Change
- Read the PR description
- Review the diff to understand scope
- Check if the approach makes sense for the goal

### 2. Check Architecture Compliance

- [ ] No `index.ts` or `index.tsx` barrel files
- [ ] Entry files match folder names (`Button/Button.tsx`)
- [ ] Direct imports used, not barrel imports
- [ ] Files colocated properly (component, hooks, types, tests together)
- [ ] New code placed in correct feature folder

### 3. Check React Patterns

- [ ] Function components only (no class components)
- [ ] Hooks follow rules (no conditional hooks, proper dependencies)
- [ ] Effects have cleanup where needed
- [ ] No obvious memory leaks (subscriptions, timers)
- [ ] Loading and error states handled

### 4. Check Code Quality

- [ ] No debugging code left in (console.log, debugger)
- [ ] No unused imports or variables
- [ ] Types are accurate (no `any` without justification)
- [ ] Tests cover new functionality
- [ ] No unrelated changes mixed in

### 5. Provide Feedback

Categorize comments:
- **Blocking**: Must fix before merge (bugs, architecture violations)
- **Suggestion**: Improvements to consider
- **Question**: Clarification needed

## Constraints

- NEVER approve code with architecture violations
- NEVER approve code without understanding what it does
- Keep feedback specific and actionable
- Suggest fixes, not just problems
