# Seansai Constitution

## Core Principles

### I. Code Quality

- Code MUST pass the project's formatter, linter, and type checker (where the language has one)
  with zero errors before it is merged. Warnings MUST NOT be silenced without an inline reason.
- Every change MUST be reviewed by at least one person (or reviewer agent plus the author's
  self-review for solo work) against this constitution before merging.
- Errors MUST be handled explicitly: no swallowed exceptions, no empty catch blocks, and failures
  MUST surface a clear message to the caller or user.
- Dead code, commented-out code, and unused dependencies MUST be removed, not left behind.
- Duplication is tolerated once; the third occurrence of the same logic MUST be extracted.

**Rationale**: Consistent, automatically enforced quality keeps defects cheap to catch and keeps
the codebase safe to change.

### II. Readability First

- Code is written for the next reader. Names MUST describe intent (what and why), not mechanics;
  avoid abbreviations that are not universally understood in the domain.
- Functions SHOULD do one thing and stay short enough to read without scrolling; a function over
  ~50 lines or with more than 3 levels of nesting MUST be justified in review or split.
- Comments MUST explain *why*, not restate *what* the code does. Non-obvious decisions, workarounds,
  and constraints MUST be commented.
- Project structure MUST be predictable: related code lives together, and file and folder names
  follow one consistent convention across the repository.

**Rationale**: Code is read far more often than it is written; readable code is faster to review,
debug, and extend.

### III. Simplicity Over Complexity

- Build the simplest solution that satisfies the current, specified requirements (YAGNI). Do not
  add abstractions, configuration, or extension points for hypothetical future needs.
- Prefer the standard library and well-established, maintained dependencies over custom
  frameworks. Every new dependency MUST be justified by a concrete need it fulfils.
- Any added complexity (new layer, pattern, service, or dependency) MUST be recorded in the
  plan's Complexity Tracking table with the simpler alternative that was rejected and why.
- When two designs meet the requirements equally, the one with fewer moving parts wins.

**Rationale**: Every piece of complexity is a permanent maintenance cost; simplicity keeps the
system understandable, testable, and fast to evolve.

### IV. Testing Is Mandatory (NON-NEGOTIABLE)

- Every feature and bug fix MUST ship with automated tests that cover its acceptance criteria.
  Untested code MUST NOT be merged.
- Bug fixes MUST start with a test that reproduces the bug and fails before the fix.
- Tests MUST be deterministic, independent of execution order, and fast enough to run on every
  change. Flaky tests MUST be fixed or quarantined with an owner within one working day.
- Coverage expectations: unit tests for business logic, integration tests for boundaries
  (database, network, external services, public contracts), and end-to-end tests for each
  critical user journey.
- The full test suite MUST pass in CI before merging; a red main branch is fixed before any new
  feature work continues.

**Rationale**: Tests are the safety net that makes refactoring, simplification, and scaling
possible without fear of regressions.

### V. Great User Experience

- Every feature MUST be specified from the user's perspective, with user stories and measurable
  acceptance criteria, before implementation begins.
- The interface MUST be consistent: shared components, terminology, and interaction patterns are
  reused rather than reinvented per feature.
- Every user action MUST give visible feedback; loading, empty, error, and success states MUST be
  designed and implemented, not left to defaults.
- Error messages MUST be written in plain language and tell the user what happened and what they
  can do next. Raw technical errors MUST NOT be shown to end users.
- User-facing interfaces MUST meet WCAG 2.1 AA accessibility and work on the supported screen
  sizes and input methods defined in the plan.

**Rationale**: The product is judged by how it feels to use; polish in the details builds trust.

### VI. Performance by Design

- Each feature plan MUST state explicit performance budgets (e.g., response time, render time,
  memory, payload size) appropriate to its context. Unless the plan defines stricter targets:
  user-visible feedback within 100 ms, interactive operations complete within 1 s, and server
  requests at p95 under 300 ms.
- Performance-critical paths MUST be measured, not guessed: optimisations require a benchmark or
  profile showing the problem and the improvement.
- Known anti-patterns MUST be avoided by default: N+1 queries, unbounded result sets, blocking work
  on the UI or request thread, and loading data that is not displayed or used.
- A change that regresses an agreed budget MUST NOT be merged without an explicit, documented
  exception.

**Rationale**: Performance is part of the user experience; designing for it up front is far
cheaper than retrofitting it.

### VII. Scalability in Mind

- Designs MUST state the expected load (users, data volume, request rate) and identify the first
  bottleneck that would appear at 10x that load.
- Components MUST be stateless where practical; state lives in well-defined stores, so instances
  can be added without coordination.
- All list and query operations over growing data MUST be paginated or bounded; long-running work
  MUST run asynchronously rather than inside a user request.
- Scalability is planned, not prematurely built (see Principle III): choose designs that *can*
  scale without a rewrite, but do not add infrastructure until measured load requires it.

**Rationale**: Keeping scale in mind avoids dead-end designs while simplicity prevents paying for
capacity that is not yet needed.

## Quality Standards

- **Definition of Done**: a change is done only when it meets its acceptance criteria, has passing
  tests (Principle IV), passes lint/format/type checks (Principle I), handles all UX states
  (Principle V), stays within its performance budgets (Principle VI), and has updated user- or
  developer-facing documentation where behaviour changed.
- **Security baseline**: secrets MUST NOT be committed to the repository; all external input MUST be
  validated; dependencies with known critical vulnerabilities MUST be upgraded or replaced before
  release.
- **Observability**: production code paths MUST emit structured logs for errors and significant
  events, without logging secrets or personal data, so issues can be diagnosed without a debugger.

## Development Workflow & Quality Gates

1. **Specify** (`/speckit-specify`): define user value, user stories, and measurable acceptance
   criteria. No implementation details.
2. **Plan** (`/speckit-plan`): the plan MUST pass the Constitution Check against all seven
   principles, declare performance budgets and expected load, and justify any complexity.
3. **Tasks** (`/speckit-tasks`): test tasks MUST be included for every user story.
4. **Implement** (`/speckit-implement`): work in small, focused, independently reviewable commits;
   tests are written with (or before) the code they verify.
5. **Review & Merge**: the reviewer verifies constitution compliance; CI (tests, lint, type checks)
   MUST be green before merge.

## Governance

- This constitution supersedes all other development practices and guidelines in this project.
  Where a guideline conflicts with it, the constitution wins.
- **Amendments** MUST be proposed as a change to this file with a written rationale, reviewed, and
  approved by the project maintainer(s). Amendments that change how existing code is judged MUST
  include a migration note for affected areas.
- **Versioning** follows semantic versioning:
  - MAJOR: a principle is removed or redefined in a backward-incompatible way.
  - MINOR: a principle or section is added, or guidance is materially expanded.
  - PATCH: clarifications, wording, and typo fixes with no change in meaning.
- **Compliance**: every plan includes a Constitution Check gate, and every review verifies
  compliance. Deviations MUST be documented and justified in the plan's Complexity Tracking table;
  undocumented deviations are grounds to block a merge.
- The constitution SHOULD be reviewed at least once per quarter to confirm it still serves the
  project.

**Version**: 1.0.0 | **Ratified**: 2026-10-30 | **Last Amended**: 2026-10-30
