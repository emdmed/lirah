# React Documentation Workflow

> Document architecture correctly. See orchestration.md for patterns.

## Before Writing

MUST answer:
- Who is the audience?
- What should they be able to do after reading?
- What existing docs need to stay in sync?

## Process

### 1. Understand the Subject
- Read the code being documented
- Try it yourself if possible
- Identify non-obvious behavior or gotchas

### 2. Check Existing Docs
- Find related documentation
- Identify what's missing or outdated
- Note the existing style and format

### 3. Write

Adapt this template as needed:

```markdown
# {Name}

Brief description.

## Location
`features/{feature}/components/{Name}/{Name}.tsx`

## Import
import { Name } from '@/features/{feature}/components/{Name}/{Name}'

## Usage
<Name prop="value" />

## Props/Parameters (if applicable)
| Name | Type | Required | Description |
|------|------|----------|-------------|

## Related
- Links to related components/hooks
```

### 4. Validate
- Code examples actually work
- Import paths are direct (not barrel)
- Links are valid

## Constraints

- MUST explain why, not just what
- MUST show direct import paths in examples
- MUST update related docs to stay consistent
