# BrowserStack AI Coding Security Policy
<!-- Version: 2026-03-17 | Source: browserstack-ai-harness | Do not remove this header -->

## Purpose

Non-negotiable security rules for all AI-assisted code generation across BrowserStack.
This policy is **MANDATORY** for all product teams. Compliance is tracked via `audit_guidelines.sh`.

## Rules

### A01: Broken Access Control
- Never bypass authentication or authorization checks
- Always verify user permissions before data access
- Validate file paths; prevent directory traversal (no `../` in user input)
- Use allowlists, not blocklists, for access control
- Scope database queries by user/group context (prevents IDOR)

### A02: Cryptographic Failures
- NEVER hardcode secrets (API keys, tokens, passwords, credentials, private keys)
- NEVER log sensitive data (passwords, tokens, PII, session IDs)
- Use environment variables or secret managers for all credentials
- Use strong, current encryption algorithms (no MD5/SHA1 for security purposes)

### A03: Injection
- Use parameterized queries for ALL database operations (never string concatenation)
- Escape output using framework-provided sanitization (prevents XSS)
- Validate and sanitize ALL user input at system boundaries
- Use allowlists for expected input formats
- Never pass user input directly to shell commands (prevents command injection)

### A04: Insecure Design
- Don't expose internal details in error messages (stack traces, database schemas, internal paths)
- Handle errors explicitly with structured responses
- Implement rate limiting on authentication and sensitive endpoints
- Design with defense-in-depth (validate at multiple layers)

### A05: Security Misconfiguration
- Never enable debug mode in production
- Set restrictive CORS policies (never use `*` for origins)
- Disable unnecessary features and default accounts
- Set proper security headers (HSTS, X-Frame-Options, CSP, X-Content-Type-Options)
- Review YAML/XML deserialization settings (disable external entities)

### A06: Vulnerable Components
- Don't introduce dependencies with known CVEs
- Verify dependency security before adding any new package
- Pin dependency versions; review updates before upgrading
- Prefer well-maintained libraries with active security response

### A07: Authentication Failures
- Never weaken authentication mechanisms
- Enforce session management best practices
- Implement account lockout after repeated failed attempts
- Use multi-factor authentication where applicable

### A08: Software & Data Integrity Failures
- Verify new dependencies exist in official registries before installing (prevents slopsquatting)
- Never install AI-hallucinated packages without verification — 19.7% of AI-suggested packages don't exist
- Pin dependency versions in lockfiles
- Verify CI/CD pipeline integrity; don't trust unsigned artifacts
- Review AI-generated code for subtle design changes that break security invariants (architectural drift)

### A09: Logging & Monitoring Failures
- Log security-relevant events (auth attempts, access denials, data changes)
- NEVER log sensitive data (passwords, tokens, PII)
- Include correlation IDs for request tracing
- Ensure logs are tamper-resistant

### A10: Server-Side Request Forgery (SSRF)
- Validate and allowlist outbound URLs
- Block requests to internal/metadata endpoints (169.254.169.254)
- Use URL parsing libraries, not regex, for URL validation

## AI-Specific Security Pitfalls

These risks are unique to AI-assisted code generation:

- **Package hallucinations (slopsquatting):** AI suggests non-existent packages that may be registered by attackers. Always verify package existence in official registries before installing.
- **Outdated APIs:** AI may suggest deprecated methods or insecure library versions. Pin your tech stack versions and verify API currency.
- **Architectural drift:** AI may subtly remove auth checks, swap crypto libraries, or change access control flows. Human review is required for all security-sensitive changes.
- **Insecure defaults:** AI generates permissive CORS, verbose error messages, debug mode enabled. Always default to deny/restrictive.
- **Over-permissive error handling:** AI generates broad `catch(Exception)` or empty rescue blocks. Always use specific error types and handle each explicitly.

## Enforcement

This policy is MANDATORY for all BrowserStack product teams.
- Compliance is tracked via `audit_guidelines.sh`
- Non-compliance is flagged during PR reviews
- Teams must include this policy in all repositories using AI-assisted development
