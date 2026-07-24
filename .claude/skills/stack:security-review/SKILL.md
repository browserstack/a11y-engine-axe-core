---
name: stack:security-review
description: "Scan code for OWASP vulnerabilities, hardcoded secrets, auth bypasses, and injection flaws. Use when reviewing code changes for security, before committing, or when asked about vulnerability scanning — even if not explicitly requesting a 'security review.'"
allowed-tools: Read, Bash(git diff*), Bash(git status*), Bash(git log*), Glob, Grep
---
<!-- Version: 2026-04-14 | Source: @browserstack/ai-harness | Do not remove this header -->

# Security Review

## Context
- Changed files: !`git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null`
- Staged diff: !`git diff --cached 2>/dev/null`
- Unstaged diff: !`git diff 2>/dev/null`

## Scope

Review ALL changed files shown above. If $ARGUMENTS specifies files or directories, narrow scope to those.

## Security Checks (OWASP-Aligned)

### A01: Broken Access Control
- Missing authentication/authorization on endpoints or handlers
- Direct object references without ownership validation (IDOR)
- Path traversal (user input in file paths without validation)
- Missing group/project scoping on database queries

### A02: Cryptographic Failures
- Hardcoded secrets: API keys, tokens, passwords, private keys, connection strings
- Sensitive data in logs (passwords, tokens, PII, session IDs)
- Weak cryptographic algorithms (MD5, SHA1 for security purposes)
- Credentials in config files or environment defaults

### A03: Injection
- SQL: string concatenation/interpolation in queries
- XSS: user input rendered without escaping
- Command injection: user input in shell commands or system calls
- LDAP/XML injection: unsanitized input in queries

### A04: Insecure Design
- Internal details in error messages (stack traces, DB schemas, file paths)
- Missing rate limiting on sensitive endpoints
- Overly broad error handling (catch-all without specific handling)

### A05: Security Misconfiguration
- Debug mode enabled, verbose errors in production
- Permissive CORS (`Access-Control-Allow-Origin: *`)
- Missing security headers (HSTS, CSP, X-Frame-Options)

### A06: Vulnerable Components
- New dependencies added without version pinning
- AI-hallucinated packages (verify existence before installing)
- Dependencies with known CVEs

### A07: Authentication Failures
- Weakened authentication mechanisms
- Missing session validation
- Insecure token handling or storage

### A08: Integrity Failures
- Subtle removal of auth checks (architectural drift)
- Unsigned artifacts, unverified dependencies
- CI/CD pipeline modifications without review

### A09: Logging Failures
- Missing logging for security events
- Sensitive data in log output
- Missing correlation IDs for tracing

### A10: SSRF
- Unvalidated outbound URLs from user input
- Requests to internal/metadata endpoints (169.254.169.254)
- URL validation using regex instead of parsing libraries

## Severity Guide

- **Critical**: Exploitable without authentication (hardcoded secrets, SQL injection, missing auth)
- **High**: Exploitable with authenticated access (IDOR, XSS, path traversal)
- **Medium**: Requires specific conditions (weak crypto, missing rate limiting)
- **Low**: Defense-in-depth issues (verbose errors, missing security logs)

## Output Format

For each finding:
- **[SEVERITY] Brief title**
- **File**: `path/to/file:line`
- **Rule**: OWASP category
- **Issue**: What is wrong
- **Fix**: Specific remediation

End with summary: total findings by severity. "No security issues found" if clean.

## Important

- Only flag real issues. Do not flag code style or non-security concerns.
- If SECURITY-POLICY.md exists in the repo root, read it for additional org-specific rules.
- Focus on the diff — don't review unchanged code unless it provides context for a vulnerability.
