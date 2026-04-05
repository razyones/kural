# Security Policy

## Supported versions

| Version            | Supported |
| ------------------ | --------- |
| 0.x (latest alpha) | Yes       |

## Reporting a vulnerability

If you discover a security vulnerability in Kural, please report it responsibly. **Do not open a public issue.**

Email **[security@razyones.com](mailto:security@razyones.com)** with:

1. A description of the vulnerability
2. Steps to reproduce
3. The impact you believe it has

You should receive an acknowledgment within 72 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

Kural parses arbitrary TypeScript codebases and executes the TypeScript compiler API on user-provided source files. Areas of particular concern include:

- **Path traversal** — the filesystem walker should not escape the target directory
- **Code execution** — parsing must not evaluate user code, only analyze its AST
- **API key handling** — embedding provider credentials must not leak into snapshots, logs, or error output
- **SQLite injection** — all database writes use parameterized statements
- **Dependency supply chain** — transitive dependencies should be audited for known vulnerabilities
