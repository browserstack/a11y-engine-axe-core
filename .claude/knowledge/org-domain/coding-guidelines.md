## Coding Guidelines

- Write tests for all new code. Untested code is incomplete code.
- Follow existing codebase conventions — don't introduce new patterns
- Make small, focused changes — not sweeping rewrites
- Don't generate commented-out code, unused imports, or placeholder TODOs
- Handle errors explicitly — don't swallow exceptions or use empty catch blocks
- Avoid N+1 queries, unnecessary loops, unbounded data fetching
- Prefer meaningful names over comments. Add comments only when they explain _why_, not _what_: don't narrate obvious code, restate the line above, or add banner/section-divider comments, and keep the ones you write short
- Keep functions focused — single responsibility, minimal side effects

## Code Review

- All AI-generated code must be reviewed by a human before merging
- Explain your reasoning when making non-obvious choices
- Flag potential security concerns proactively

## Testing

- Unit tests for business logic
- Integration tests for API endpoints and database interactions
- Test error paths, not just happy paths
- Test edge cases: nil/null values, empty collections, boundary conditions
