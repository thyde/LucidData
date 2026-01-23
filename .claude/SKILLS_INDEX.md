# LucidData Agent Skills

This directory contains specialized agent skills following the [Agent Skills specification](https://agentskills.io/specification) for the LucidData personal data bank MVP.

## Available Skills

### 1. GitHub Issues Management (`github-issues`)
**Location:** [skills/github-issues/SKILL.md](skills/github-issues/SKILL.md)
**Triggers:** "create issue", "bug report", "feature request", "update issue", "add label", "file a bug"
**Purpose:** Manage GitHub issues with LucidData-specific templates, labels (security, privacy, encryption, consent, audit-log), and security considerations. Use MCP tools to create, update, search, and comment on issues.

### 2. npm Package Manager (`npm-package-manager`)
**Location:** [skills/npm-package-manager/SKILL.md](skills/npm-package-manager/SKILL.md)
**Triggers:** "install package", "update dependency", "npm audit", "add package", "remove package", "check for outdated"
**Purpose:** Manage Node.js dependencies following LucidData version pinning strategies (exact for crypto/auth, caret for UI). Includes Prisma-specific workflows, security auditing, and package.json/package-lock.json management.

### 3. Next.js Internationalization (`nextjs-i18n`)
**Location:** [skills/nextjs-i18n/SKILL.md](skills/nextjs-i18n/SKILL.md)
**Triggers:** "add language", "translate", "internationalization", "i18n", "localization", "l10n", "multi-language"
**Purpose:** Implement multi-language support using next-intl for global data sovereignty compliance. Includes consent form localization with legal accuracy for GDPR, locale routing, and translation file management.

### 4. Web Design Reviewer (`web-design-reviewer`)
**Location:** [skills/web-design-reviewer/SKILL.md](skills/web-design-reviewer/SKILL.md)
**Triggers:** "review design", "check responsive", "accessibility", "Tailwind", "visual inspection", "check layout", "design issues"
**Purpose:** Perform visual QA, responsive design testing (375px to 2560px viewports), Tailwind CSS consistency checks, shadcn/ui component validation, and WCAG 2.1 AA accessibility testing with automated screenshot capture.

### 5. Web Application Testing (`webapp-testing`)
**Location:** [skills/webapp-testing/SKILL.md](skills/webapp-testing/SKILL.md)
**Triggers:** "run tests", "test", "playwright", "vitest", "e2e", "unit test", "debug test failure", "test coverage"
**Purpose:** Execute and debug tests using Playwright (E2E with multi-browser support) and Vitest (unit/integration). Includes LucidData-specific test patterns for auth, vault CRUD, consent management, and audit logging with 80% coverage target.

## Skill Architecture

Each skill follows the **progressive disclosure** pattern recommended by the Agent Skills specification:

- **Metadata** (~100 tokens): Name, description, and trigger phrases loaded at startup for skill discovery
- **Instructions** (<5000 tokens): Main SKILL.md content loaded when skill is activated by trigger phrase
- **Resources** (on demand): Reference files in `references/` and scripts in `scripts/` loaded only when needed

This architecture minimizes token usage while providing comprehensive guidance when skills are actively used.

## For Claude Code Users

Skills are loaded automatically when you use trigger phrases in your requests. For example:

- "Run the e2e tests for the vault feature" → Activates `webapp-testing` skill
- "Install the date-fns package" → Activates `npm-package-manager` skill
- "Review the dashboard design on mobile devices" → Activates `web-design-reviewer` skill
- "Create a bug report for the encryption issue" → Activates `github-issues` skill
- "Set up internationalization for Spanish" → Activates `nextjs-i18n` skill

Claude Code will follow the skill instructions and use configured MCP tools (GitHub, Playwright) to complete your request.

### MCP Configuration

The required MCP servers are configured in [.claude/settings.local.json](.claude/settings.local.json):

- **GitHub MCP** - For issue management (requires `GITHUB_TOKEN` environment variable)
- **Playwright MCP** - For web design review and testing (uses `http://localhost:3000`)
- **Supabase MCP** - Already configured for database operations

## For GitHub Copilot Users

GitHub Copilot skills will be added in a future phase. When available, they will be located in `.github/copilot/skills/` and use CLI commands (`gh`, `npm`, `npx playwright`) instead of MCP tools.

## Skill Validation

To validate that skill specifications are correctly formatted:

```bash
# Check YAML frontmatter syntax
npx js-yaml .claude/skills/*/SKILL.md

# Test skill activation
# Use trigger phrases in Claude Code and verify skill loads correctly
```

## Skill Customizations for LucidData

All skills are customized for the LucidData tech stack and conventions:

### Tech Stack Integration
- **Next.js 15 App Router** with route groups, Server Components, and API routes
- **Prisma 6.19.1** with dotenv-based commands and migration workflows
- **Supabase Auth** with SSR integration patterns
- **Tailwind CSS 3.4.1** with LucidData design system (colors, spacing, typography)
- **shadcn/ui** component library patterns (Button, Dialog, Input, etc.)

### Testing Infrastructure
- **Vitest 3.2.4** for unit/integration tests with jsdom environment
- **Playwright 1.57.0** for E2E tests with multi-browser support (chromium, firefox, webkit, mobile)
- **Coverage targets** at 80% for lines, functions, branches, statements
- **Test data** fixtures in `test/fixtures/` and mocks in `test/mocks/`

### Code Conventions
- **File naming**: kebab-case (e.g., `vault-list.tsx`, `consent.service.ts`)
- **Components/Types**: PascalCase (e.g., `VaultData`, `ConsentDialog`)
- **Functions/Variables**: camelCase (e.g., `handleSubmit`, `userId`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `ENCRYPTION_KEY`, `MAX_FILE_SIZE`)
- **Imports**: Use `@/` path alias for project imports

### Security & Privacy
- **Encryption**: AES-256-GCM with envelope encryption patterns
- **Audit Logging**: Hash-chained immutable audit trail
- **Consent Management**: Granular data access control with time-bound permissions
- **PII Protection**: All skill examples use synthetic data, never real user information

## Contributing

When adding new skills to this collection:

1. Follow the [Agent Skills specification](https://agentskills.io/specification) structure
2. Keep main SKILL.md files under 500 lines for optimal loading
3. Move detailed content to `references/` subdirectories
4. Use relative paths for all file references
5. Update this index with skill metadata and trigger phrases
6. Test skills with Claude Code before committing
7. Follow LucidData naming conventions (kebab-case for files)

## Project-Specific Notes

- **No .NET/C# Components**: LucidData is pure Node.js/TypeScript; NuGet skill has been adapted to npm package manager
- **No Existing i18n**: Next.js i18n skill is future-proofing for international expansion and GDPR compliance
- **MCP Token Required**: Set `GITHUB_TOKEN` environment variable for GitHub issue management skill to work
- **Local Dev Server**: Web design reviewer and testing skills expect dev server running at `http://localhost:3000`

## Quick Reference

| Skill | Primary Use Case | Tools Used |
|-------|------------------|------------|
| github-issues | Issue tracking, bug reports, feature requests | GitHub MCP |
| npm-package-manager | Dependency management, security audits | npm CLI, Bash |
| nextjs-i18n | Multi-language support, GDPR localization | npm CLI, Write, Edit |
| web-design-reviewer | Visual QA, responsive design, accessibility | Playwright MCP, Read |
| webapp-testing | TDD workflow, test execution, debugging | Playwright, Vitest, Bash |

## Version History

- **v1.0** (2026-01-13): Initial release with 5 skills customized for LucidData MVP
  - github-issues: GitHub workflow integration with MCP
  - npm-package-manager: Node.js dependency management
  - nextjs-i18n: Internationalization with next-intl
  - web-design-reviewer: Visual QA with Playwright
  - webapp-testing: Comprehensive testing with Vitest + Playwright
