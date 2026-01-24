# React Documentation Workflow

## React 18 Best Practices

### Architecture Rules
- **Feature architecture**: Organize by feature, not by type
- **No barrel exports**: Never use `index.ts` to re-export from a folder
- **Entry point naming**: Main file must match folder name (`Button/Button.tsx`, not `Button/index.tsx`)
- **Colocation**: Keep related files together (component, hooks, types, tests, styles)

## Before Starting

- [ ] Who is the audience for this documentation?
- [ ] What should they be able to do after reading it?
- [ ] What existing docs need to stay in sync?
- [ ] Does this document React 18 patterns correctly?

## Process

### 1. Understand the Subject
- Read the code or feature being documented
- Try it yourself if possible
- Note any React 18-specific behavior or patterns
- Identify any non-obvious behavior or gotchas

### 2. Check Existing Docs
- Find related documentation
- Identify what's missing or outdated
- Note the existing style and format
- Check for outdated React patterns (class components, lifecycle methods)

### 3. Write

**Document the architecture:**
```markdown
## File Structure

features/
  auth/
    auth.tsx              # Main entry point
    auth.hooks.ts         # useAuth, useSession
    auth.types.ts         # AuthState, User
    components/
      LoginForm/
        LoginForm.tsx     # Login form component
```

**Document import conventions:**
```markdown
## Importing

Always use direct imports:

// Correct
import { LoginForm } from '@/features/auth/components/LoginForm/LoginForm'
import { useAuth } from '@/features/auth/auth.hooks'

// Incorrect - never use barrel imports
import { LoginForm } from '@/features/auth/components'
```

**Document React 18 patterns:**
```markdown
## Component Patterns

### Using Transitions
For non-urgent state updates, use useTransition:

const [isPending, startTransition] = useTransition()

startTransition(() => {
  setFilteredResults(results)
})

### Suspense for Loading States
Wrap async components with Suspense:

<Suspense fallback={<Skeleton />}>
  <AsyncComponent />
</Suspense>
```

### 4. Validate
- Code examples actually work
- Import paths follow the direct import convention
- Examples use React 18 patterns (not deprecated ones)
- Links are valid
- Instructions produce expected results
- No references to removed features or old patterns

### 5. Review
- Read it from a newcomer's perspective
- Check for outdated React terminology
- Ensure logical flow
- Verify architecture rules are explained clearly

## Documentation Templates

### Component Documentation
```markdown
# ComponentName

Brief description of what the component does.

## Location

`features/{feature}/components/ComponentName/ComponentName.tsx`

## Import

import { ComponentName } from '@/features/{feature}/components/ComponentName/ComponentName'

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| ... | ... | ... | ... |

## Usage

<ComponentName prop="value" />

## Related

- [RelatedComponent](./RelatedComponent.md)
- [useRelatedHook](../hooks.md#userelatedhook)
```

### Hook Documentation
```markdown
# useHookName

Brief description of what the hook does.

## Location

`features/{feature}/{feature}.hooks.ts`

## Import

import { useHookName } from '@/features/{feature}/{feature}.hooks'

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|

## Returns

| Property | Type | Description |
|----------|------|-------------|

## Usage

const { data, isLoading } = useHookName(param)

## React 18 Notes

Any specific React 18 considerations (Suspense, transitions, etc.)
```

### Feature Documentation
```markdown
# Feature Name

## Overview

What this feature does and why it exists.

## Architecture

features/
  {feature}/
    {feature}.tsx         # Entry point
    {feature}.hooks.ts    # Hooks
    {feature}.types.ts    # Types
    components/           # Feature components

## Key Components

- **ComponentA**: Description
- **ComponentB**: Description

## Hooks

- **useHookA**: Description
- **useHookB**: Description

## Usage

How to use this feature in the application.
```

## Reminders

- Good docs explain why, not just what
- Keep examples simple and focused
- Always show correct import paths (direct, not barrel)
- Update related docs to stay consistent
- Remove documentation for removed features
- Match the tone and style of existing project docs
- Ensure all code examples use React 18 patterns
- Document any migration notes from older patterns
