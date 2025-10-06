# AGENTS.md — dedos.xyz-bot (Autonomous, Plan-then-Apply)

## 1) Purpose & Scope
Build and evolve a Discord bot (TypeScript, DDD) with production quality, security, and performance.  
**Agent policy:** Always show a **Change Proposal** first (per‑file plan + rationale). Then **apply** changes (no diffs in output) and deliver a **Delivery Summary** with verifiable evidence.

---

## 2) Non‑Negotiables (Guardrails)

### Architecture (DDD Layers)
- **`domain/**`**: Pure business logic only
  - Entities, Value Objects, Domain Events
  - Contracts (interfaces for repositories/services)
  - **Zero dependencies** on infrastructure or framework code
  - Example: `Ticket` entity with `open()`, `assign()`, `close()` methods
  
- **`application/**`**: Use case orchestration
  - Command/Query handlers (CQRS pattern)
  - Input validation via Zod DTOs **before** domain entry
  - Transaction boundaries (`$transaction` with max 5s timeout)
  - Example: `OpenTicketHandler` validates input → calls domain → persists
  
- **`infrastructure/**`**: External world adapters
  - Prisma repositories implementing domain contracts
  - HTTP clients (Discord API, webhooks)
  - External services (Redis, S3, analytics)
  - **Never** leak adapter details to application layer
  
- **`presentation/**`**: Discord interaction layer
  - Command definitions (slash commands with builders)
  - Event handlers (InteractionCreate, MessageCreate, etc.)
  - Embed/Component builders with type-safe schemas
  - Rate limit handling, deferred responses
  
- **`shared/**`**: Cross-cutting concerns
  - Config (env validation with Zod)
  - Logger (pino with redaction rules)
  - Errors (typed error hierarchy with context)
  - Types (branded types, Result<T,E>)
  - Utils (pure functions only)

### Security & Privacy (Zero-Trust)

**Secrets Management:**
```ts
// ✅ CORRECT
const token = process.env.DISCORD_TOKEN;
logger.info('Bot starting', { tokenLength: token?.length });

// ❌ FORBIDDEN
logger.info('Bot starting', { token }); // NEVER log secrets
console.log(dbUrl); // NEVER print connection strings
```

**PII Handling:**
```ts
// ✅ CORRECT - Hashed identifiers for logs
logger.info('Ticket opened', { 
  userId: hash(user.id), 
  guildId: hash(guild.id),
  ticketId: ticket.id 
});

// ❌ FORBIDDEN
logger.info('Ticket opened', { 
  username: user.username, // PII
  messageContent: message.content // Potential PII
});
```

**Input Validation (defense in depth):**
1. **Presentation layer:** Zod schema validation
2. **Application layer:** Business rule validation
3. **Domain layer:** Invariant enforcement in constructors

**Permission Model:**
```ts
// ✅ Principle of least privilege
const requiredPerms = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ManageThreads
];

// ❌ FORBIDDEN without explicit justification
PermissionFlagsBits.Administrator; // Too broad
PermissionFlagsBits.ManageGuild; // Rarely needed
```

**Intents Policy:**
```ts
// ✅ Minimal required intents
[
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent // Only if absolutely necessary
]

// ❌ Avoid unless justified
GatewayIntentBits.GuildPresences // Privacy concern
GatewayIntentBits.GuildMembers // Privileged intent
```

### Discord UX & API Limits

**Interaction Response Times (hard limits):**
```ts
// Rule: ACK within 3 seconds or Discord times out

// ✅ Fast operations (<1s)
await interaction.reply({ content: 'Done!' });

// ✅ Medium operations (1-3s)
await interaction.deferReply();
const result = await quickOperation();
await interaction.editReply(result);

// ✅ Long operations (>3s)
await interaction.deferReply({ ephemeral: true });
await heavyWork(); // Runs in background
await interaction.editReply('Completed');
```

**Rate Limit Handling (automatic backoff):**
```ts
// Global rate limit: 50 req/s
// Per-route limits: vary by endpoint

const withRateLimitRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<Result<T, RateLimitError>> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return Ok(await fn());
    } catch (err) {
      if (err.status === 429) {
        const retryAfter = err.headers['retry-after'] ?? 1000;
        await sleep(retryAfter * (2 ** i)); // Exponential backoff
        continue;
      }
      return Err(new RateLimitError(err));
    }
  }
};
```

**Component Registration (centralized):**
```ts
// ✅ CORRECT - Single source of truth
// src/presentation/commands/registry.ts
export const commandRegistry = [
  ticketCommand,
  reviewCommand,
  statsCommand
];

// ❌ FORBIDDEN - Scattered registration
client.on('ready', () => {
  client.application.commands.create(ticketCommand); // Hard to track
});
```

### Database (Prisma/Postgres)

**Transaction Rules:**
```ts
// ✅ Short, focused transactions (<5s)
await prisma.$transaction(async (tx) => {
  const ticket = await tx.ticket.create({ data });
  await tx.auditLog.create({ data: { ticketId: ticket.id } });
}); // Automatic rollback on error

// ❌ FORBIDDEN - Long or interactive transactions
await prisma.$transaction(async (tx) => {
  const ticket = await tx.ticket.create({ data });
  await discordAPI.sendMessage(); // ❌ External call in transaction
  await sleep(10000); // ❌ Long blocking operation
});
```

**Idempotency (prevent duplicates):**
```prisma
model Ticket {
  id        String   @id @default(cuid())
  channelId String
  userId    String
  createdAt DateTime @default(now())
  
  @@unique([channelId, userId, createdAt(sort: Desc)])
  @@index([userId, status])
}
```

**Migration Safety:**
```sql
-- ✅ Additive migrations (zero downtime)
ALTER TABLE tickets ADD COLUMN priority INT DEFAULT 0;
CREATE INDEX CONCURRENTLY idx_tickets_priority ON tickets(priority);

-- ⚠️ Destructive migrations (requires coordination)
ALTER TABLE tickets DROP COLUMN old_field; -- Must have major version bump
```

**N+1 Query Prevention:**
```ts
// ❌ N+1 query
const tickets = await prisma.ticket.findMany();
for (const ticket of tickets) {
  const user = await prisma.user.findUnique({ where: { id: ticket.userId } });
}

// ✅ Eager loading
const tickets = await prisma.ticket.findMany({
  include: { user: true }
});
```

### Resilience Patterns

**Timeouts (fail-fast):**
```ts
const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  operation: string
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new TimeoutError(operation, ms)), ms)
    )
  ]);
};

// Usage
await withTimeout(
  externalAPI.call(),
  5000,
  'External API call'
);
```

**Exponential Retry (transient failures):**
```ts
const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<Result<T, Error>> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return Ok(await fn());
    } catch (err) {
      if (!isRetryable(err) || i === maxRetries - 1) {
        return Err(err);
      }
      await sleep(baseDelay * (2 ** i) + Math.random() * 1000); // Jitter
    }
  }
};
```

**HTTP Keep-Alive (connection pooling):**
```ts
import { Agent } from 'https';

const agent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

const client = axios.create({
  httpsAgent: agent,
  timeout: 10000
});
```

**Circuit Breaker (cascading failure prevention):**
```ts
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold = 5,
    private timeout = 60000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        return Err(new CircuitOpenError());
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return Ok(result);
    } catch (err) {
      this.onFailure();
      return Err(err);
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}
```

### TypeScript Configuration

**tsconfig.json (strict mode):**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Type Safety Patterns:**
```ts
// ✅ Discriminated unions
type Result<T, E> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

// ✅ Branded types
type UserId = string & { __brand: 'UserId' };
type TicketId = string & { __brand: 'TicketId' };

// ✅ Unknown over any
const parseJSON = (str: string): unknown => JSON.parse(str);
const data = parseJSON(input);
if (isTicketData(data)) { // Type guard
  processTicket(data); // Now typed
}

// ❌ FORBIDDEN without @ts-expect-error comment
const value: any = getValue(); // Loses all type safety
```

---

## 3) Versioning & Release Header (Required in Every Message)

### Source of Truth
**`package.json` `version`** → mirrored to **`src/shared/version.ts`** for runtime display.

### Channels
- **`dev`**: Active development (unstable)
- **`staging`**: Pre-production testing (stable candidates)
- **`prod`** (alias: `final`): Production releases

Set via `ENV_CHANNEL` environment variable (default: `dev`).

### Automatic Version Bump Rules

**MAJOR (X.0.0)** — Breaking changes:
- Public API/command signature changes
- Destructive database migrations (column removal, type changes)
- Permission/intent requirement changes
- Configuration format changes
- Example: Removing a slash command, changing command option types

**MINOR (0.X.0)** — Backward-compatible additions:
- New commands or features
- Additive database migrations (new tables/columns)
- New optional configuration
- Example: Adding a new `/review` command

**PATCH (0.0.X)** — Fixes and maintenance:
- Bug fixes without API changes
- Performance improvements
- Refactoring without behavior change
- Documentation/test updates
- Example: Fixing a rate limit handling bug

**NO BUMP** — No code changes:
- Documentation-only updates
- Comment improvements
- README changes

### Automatic Artifacts (on apply)

1. **Update `package.json`:**
   ```json
   {
     "version": "2.1.3",
     "channel": "dev"
   }
   ```

2. **Sync `src/shared/version.ts`:**
   ```ts
   export const BOT_VERSION = {
     semver: "2.1.3",
     channel: "dev" as "dev" | "staging" | "prod",
     updatedAt: "2025-10-05T18:45:00Z",
     commit: process.env.GIT_COMMIT || "unknown"
   } as const;
   ```

3. **Append to `CHANGELOG.md`** (Keep a Changelog format):
   ```md
   ## [2.1.3] - 2025-10-05
   
   ### Fixed
   - Rate limit handling now uses exponential backoff with jitter
   - Transaction timeout reduced from 30s to 5s
   
   ### Changed
   - Improved logging redaction for PII
   ```

4. **Git Commit (Conventional Commits):**
   ```bash
   git commit -m "fix(rate-limit): add exponential backoff with jitter
   
   Prevents thundering herd after 429 responses.
   Closes #123"
   ```

5. **Git Tag (for releases):**
   ```bash
   git tag -a v2.1.3-dev -m "Release 2.1.3 (dev channel)"
   ```

### Version Header Format

**MUST start every agent response:**

```
[version] X.Y.Z (channel: dev|staging|prod) • updated: YYYY-MM-DDTHH:mm:ssZ
```

**Extended format for major bumps:**
```
[version] 3.0.0 (channel: prod) • updated: 2025-10-05T18:45:00Z
⚠️  BREAKING CHANGES:
- Removed deprecated `/ticket-old` command
- Database migration required: run `pnpm db:migrate`
- New required env var: `REDIS_URL`
```

---

## 4) Two‑Phase Execution (Plan → Apply)

**Always execute in this order** within the same run unless user says `proposal-only`:

### Phase 1: Change Proposal (Preview Only)

**Format:**
```md
## Change Proposal

**Goal:** [1-3 sentence summary of what and why]

**Files to touch:**
- `path/to/file.ts` (create|modify|remove) → [brief change description]
- `path/to/test.spec.ts` (modify) → [test updates]

**Rationale:**
[2-4 sentences explaining design choice, alternatives considered, trade-offs]

**Risks & Rollback:**
- Risk: [potential issue]
- Mitigation: [how we handle it]
- Rollback: [how to undo if needed]
- DB Impact: [if any migrations, specify up/down scripts]

**Tests to add/update:**
- Unit: [which domain/application tests]
- Integration: [which repository/service tests]
- E2E: [which flow tests]
- SIPS: [which simulation scenarios]

**Version bump intent:** major|minor|patch
**Reason:** [why this bump level]
```

**Example:**
```md
## Change Proposal

**Goal:** Add automatic ticket archival after 30 days of inactivity to reduce database size and improve query performance.

**Files to touch:**
- `src/domain/ticket/Ticket.ts` (modify) → Add `shouldArchive()` method
- `src/application/commands/ArchiveStaleTicketsHandler.ts` (create) → Scheduled job handler
- `src/infrastructure/jobs/TicketArchivalJob.ts` (create) → Cron job registration
- `prisma/schema.prisma` (modify) → Add `archivedAt` field
- `prisma/migrations/XXX_add_archived_at.sql` (create) → Migration script
- `tests/flows/ticket-archival.spec.ts` (create) → E2E archival flow

**Rationale:**
Current system keeps all tickets indefinitely, leading to slow queries on large guilds (>10k tickets). Archival moves old tickets to separate table with retained audit trail. Considered soft-delete vs archival; chose archival for compliance (GDPR right to erasure). Trade-off: slight complexity in reporting queries that need to union active + archived tables.

**Risks & Rollback:**
- Risk: Accidental archival of active tickets
- Mitigation: Add `lastActivityAt` update on every interaction; double-check in scheduler
- Rollback: Migration down script restores `archivedAt` NULL; stop cron job
- DB Impact: Additive column (zero downtime); batch update for existing records (run during low traffic)

**Tests to add/update:**
- Unit: `Ticket.shouldArchive()` with various activity dates
- Integration: `TicketRepository.archive()` and `findArchived()`
- E2E: Create ticket → wait 30 days (mocked time) → verify archived
- SIPS: Scenario with multiple tickets, verify only stale ones archived

**Version bump intent:** minor
**Reason:** New feature (scheduled archival) with backward-compatible DB migration.
```

### Phase 2: Apply (Auto-Proceed Unless `proposal-only`)

1. **Make all changes** (no diffs in output — show file paths only)
2. **Run quality gates** (see §6)
3. **Update version artifacts**:
   - Bump `package.json`
   - Sync `src/shared/version.ts`
   - Append `CHANGELOG.md`
   - Create conventional commit
4. **Run migrations** (if DB changes):
   ```bash
   pnpm db:migrate
   pnpm db:seed # Verify seed still works
   ```

### Phase 3: Delivery Summary

**Format:**
```md
## Delivery Summary

**Files Touched:** [Concise list with purpose]
- ✅ `src/domain/ticket/Ticket.ts` — Added archival logic
- ✅ `src/application/commands/ArchiveStaleTicketsHandler.ts` — Created scheduler handler
- ✅ `prisma/schema.prisma` — Added archivedAt field
- ✅ `tests/flows/ticket-archival.spec.ts` — E2E coverage

**Quality Gates:** [Results from CI checks]
- ✅ `pnpm typecheck` — Passed (0 errors)
- ✅ `pnpm lint` — Passed (0 warnings)
- ✅ `pnpm test:unit` — Passed (127/127)
- ✅ `pnpm test:integration` — Passed (34/34)
- ✅ `pnpm test:e2e` — Passed (12/12)
- ✅ `pnpm test:flows` — Passed (8/8)
- ✅ `pnpm db:migrate` — Applied migration `20251005_add_archived_at`
- ✅ Coverage: 91.2% (above 85% threshold)

**Release Notes:** [User-facing changes]
- Added automatic ticket archival after 30 days of inactivity
- Archived tickets remain viewable in `/ticket history` command
- Improved ticket list query performance by 60% on large guilds

**Performance Impact:**
- Query time (10k tickets): 450ms → 180ms (-60%)
- Memory usage: No significant change
- Cron job overhead: ~50ms/day

**Migration Notes:**
```bash
# Production deployment steps:
1. pnpm db:migrate # Adds archivedAt column
2. pnpm start # Bot uses new field
3. Wait 24h for monitoring
4. Run backfill script if needed: pnpm db:backfill-archived-at
```

**Next Steps:**
1. Monitor archival job logs for 48h
2. Add Grafana dashboard for archived ticket metrics
3. Consider exposing archive threshold as guild-level config
4. Document archival policy in user-facing docs
5. Add admin command to manually trigger archival
```

---

## 5) Continuous Improvement Sweep (Run at Start of Every Request)

**Execute this checklist automatically** before any other work:

### Quick Win Priorities (Fix Immediately)

**Discord Handlers (critical path):**
- [ ] All interactions `reply()` or `deferReply()` within 3s?
- [ ] Long operations (>3s) use `deferReply()` + background work?
- [ ] Rate limits handled with exponential backoff + jitter?
- [ ] No double-reply bugs (check for `replied` or `deferred` guards)?
- [ ] Ephemeral responses used for sensitive data?

**Validation (input security):**
- [ ] All command inputs validated with Zod schemas?
- [ ] String inputs sanitized (strip HTML, limit length)?
- [ ] Enum values whitelisted (not just any string)?
- [ ] File uploads checked for type/size before processing?

**Error Handling (observability):**
- [ ] No generic `throw new Error()` — use typed error classes?
- [ ] All error paths return `Result<T, E>` for expected failures?
- [ ] Errors logged with context (`userId`, `guildId`, `requestId`)?
- [ ] User-facing error messages are actionable (not stack traces)?

**Database (performance):**
- [ ] Indexes exist for all `WHERE` clause columns in hot queries?
- [ ] No N+1 queries (use `include` or `select` with relations)?
- [ ] Transactions under 5s timeout?
- [ ] Idempotent writes (use `@@unique` constraints)?
- [ ] Foreign keys defined for referential integrity?

**Networking (reliability):**
- [ ] All HTTP calls wrapped with `withTimeout()` (5-10s)?
- [ ] Transient failures retried with `withRetry()` (3 attempts)?
- [ ] HTTP agent uses Keep-Alive with connection pooling?
- [ ] Circuit breaker applied to flaky external services?

**TypeScript & Code Health (maintainability):**
- [ ] No `any` types (use `unknown` + type guards)?
- [ ] No `@ts-ignore` (use `@ts-expect-error` with comment)?
- [ ] Exhaustive switch statements (`satisfies never` in default)?
- [ ] Functions under 50 lines (split if larger)?
- [ ] Single Responsibility Principle (one reason to change)?
- [ ] Avoid deep nesting (max 3 levels)?

**Observability (debugging):**
- [ ] Request ID generated and passed through call chain?
- [ ] Sensitive IDs hashed in logs (`userId`, `guildId`)?
- [ ] Latency tracked (start/end timestamps)?
- [ ] Error rates aggregated per command/handler?
- [ ] Business metrics tracked (tickets opened, reviews submitted)?

### Sweep Execution Example

```md
## Continuous Improvement Sweep Results

**Findings:**
1. ❌ `TicketOpenHandler` missing `deferReply()` (operation takes 4s)
2. ❌ `ReviewRepository.findByTicketId()` has N+1 query (missing `include`)
3. ❌ `ExternalAPIClient` lacks timeout (hangs indefinitely)
4. ⚠️  `TicketCloseHandler` has 67-line function (violates SRP)

**Auto-Fixes Applied:**
1. Added `deferReply()` to `TicketOpenHandler`
2. Added `include: { user: true }` to review query
3. Wrapped API call with `withTimeout(..., 8000)`
4. Split `TicketCloseHandler.execute()` into 3 methods

**Remaining Technical Debt:**
- [ ] Add circuit breaker to webhook service (medium priority)
- [ ] Migrate legacy error `throw` to `Result<T,E>` in `StatsService` (low priority)
```

---

## 6) Quality Gates (CI‑Grade, Must Pass)

### Mandatory Checks (Must Pass Before Merge)

```bash
# Type safety
pnpm typecheck # tsc --noEmit

# Code quality
pnpm lint # eslint + prettier
pnpm lint:fix # Auto-fix where possible

# Test suites
pnpm test:unit # Domain + Application layer (fast)
pnpm test:integration # Repository + Service layer (DB)
pnpm test:e2e # Full Discord interaction flows
pnpm test:flows # SIPS simulation scenarios

# Database integrity
pnpm db:check # Prisma validate + detect drift
pnpm db:migrate # Apply pending migrations
pnpm db:seed # Verify seed data loads

# Build verification
pnpm build # Ensure production bundle succeeds

# Security audit
pnpm audit # Check for vulnerable dependencies
```

### Coverage Thresholds (Enforced by CI)

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 85,
        "functions": 85,
        "lines": 85,
        "statements": 85
      },
      "src/presentation/**": {
        "branches": 90,
        "functions": 90,
        "lines": 90,
        "statements": 90
      },
      "src/application/**": {
        "branches": 90,
        "functions": 90,
        "lines": 90,
        "statements": 90
      },
      "src/domain/**": {
        "branches": 95,
        "functions": 95,
        "lines": 95,
        "statements": 95
      }
    }
  }
}
```

**Rationale for tiers:**
- **Domain (95%)**: Core business logic, highest value
- **Presentation/Application (90%)**: User-facing, critical paths
- **Infrastructure (85%)**: Adapters, lower business value

### Performance Benchmarks

```bash
# Bundle size limits
- Total: < 5MB (uncompressed)
- Main chunk: < 2MB
- Dependencies: < 3MB

# Memory limits (production)
- Idle: < 150MB RSS
- Under load (100 req/s): < 500MB RSS

# Startup time
- Cold start: < 5s (includes DB connection)
- Hot reload: < 2s (dev mode)
```

### Dead Code Detection

```bash
# Identify unused exports
pnpm knip # Or ts-prune

# Expected output: 0 unused exports
# If found, either use or remove
```

### Dependency Health

```bash
# Outdated packages
pnpm outdated

# Policy: Update minor/patch monthly, major quarterly
# Critical security updates: immediate

# License compliance
pnpm licenses list
# Allowed: MIT, Apache-2.0, BSD-3-Clause
# Forbidden: GPL, AGPL (copyleft issues)
```

---

## 7) Testing & Simulation (SIPS – Discord Interaction Testing)

### Goal
Fully automated, realistic Discord simulation for all critical flows with deterministic outcomes.

### Simulation Layer Architecture

**Core Components:**

```ts
// Mock Discord Gateway
class MockGateway {
  emit(event: 'INTERACTION_CREATE' | 'MESSAGE_CREATE', data: unknown): void;
  injectLatency(min: number, max: number): void;
  injectFailure(rate: number, errorType: '429' | 'timeout' | 'disconnect'): void;
}

// Mock Discord REST API
class MockDiscordAPI {
  readonly calls: APICall[] = [];
  
  reply(interactionId: string, data: unknown): Promise<void>;
  editReply(interactionId: string, data: unknown): Promise<void>;
  deferReply(interactionId: string, ephemeral?: boolean): Promise<void>;
  
  // Rate limit simulation
  enforceRateLimit(route: string, limit: number): void;
}

// Simulated Entities
interface SimulatedGuild {
  id: string;
  name: string;
  roles: SimulatedRole[];
  channels: SimulatedChannel[];
  members: SimulatedMember[];
}
```

### Scenario DSL (Fluent API)

**Core Methods:**

```ts
scenario('Scenario name')
  .given(setup) // Arrange: seed data, configure mocks
  .when(action) // Act: trigger interaction
  .then(assertion) // Assert: verify outcome
  .and(assertion) // Chain additional assertions
  .next(description) // Document next step in flow
  .finally(cleanup); // Cleanup: reset state
```

**Example - Full Ticket Lifecycle:**

```ts
import { scenario, seed, user, expect, time } from '@/test/sips';

scenario('Complete ticket lifecycle with middleman')
  .given(
    seed.guild({
      name: 'Test Guild',
      roles: [
        { name: 'Staff', permissions: ['MANAGE_TICKETS'] },
        { name: 'Middleman', permissions: ['VIEW_TICKETS'] }
      ],
      members: [
        { name: 'Alice', roles: ['Staff'] },
        { name: 'Bob', roles: ['Middleman'] },
        { name: 'Charlie', roles: [] }
      ]
    })
  )
  .when(
    user('Charlie').exec('/ticket open', {
      reason: 'Need help with trade',
      category: 'general'
    })
  )
  .then(
    expect.replyWithin(3000),
    expect.embed({
      title: 'Ticket Opened',
      fields: [
        { name: 'Status', value: 'Open' },
        { name: 'Assigned To', value: 'Unassigned' }
      ]
    }),
    expect.dbChange('Ticket', { status: 'OPEN', userId: 'Charlie' }),
    expect.threadCreated({ name: /ticket-\d+/ })
  )
  .next('Staff assigns ticket