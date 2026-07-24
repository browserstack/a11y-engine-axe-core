## Security Policy (MANDATORY)

See SECURITY-POLICY.md in this repository for non-negotiable security rules.
All code you generate MUST comply with these rules. Key highlights:

- NEVER hardcode secrets (API keys, tokens, passwords, credentials)
- Use parameterized queries for ALL database operations (never string concatenation)
- Validate and sanitize ALL user input at system boundaries
- NEVER log sensitive data (passwords, tokens, PII)
- Escape output using framework-provided sanitization (prevents XSS)
- Always verify user permissions before data access
- Verify new dependencies exist in official registries before installing
- Never pass user input directly to shell commands
- Default to restrictive settings (CORS, error messages, debug mode)
- Human review required for all security-sensitive AI-generated changes
