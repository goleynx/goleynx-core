# Goleynx Beacon Event System Specification

This document is the specification of the Goleynx multi-agent beacon event system. Structured for machine parsing. Every statement is verifiable against the reference implementation.

---

## 1. Beacon Grammar

### 1.1 Four-Segment Structure

Every beacon consists of up to four orthogonal segments. Segments are separated by hyphens.

```
{WINDOW}{ROUND}[-QUALIFIER[-TARGET]]
```

| Segment | Position | Type | Values | Required |
|---------|----------|------|--------|----------|
| Window | 1 | uppercase letter | A, B, C, D, E, F | yes |
| Round | 2 | 4-digit zero-padded integer | 0001–9999 | yes |
| Qualifier | 3 (after first `-`) | lowercase letter(s) + digits | -d0X, -sXXXX-XX, -vXX-XX, -rXX-XX, -rcXX-XX, -acXX | if hyphen present |
| Target | 4 (last segment) | uppercase letter | -D, -E, -F, -G, -H | directed beacons only |

### 1.2 Case Rules

- Window identifiers: ALWAYS UPPERCASE (A, B, C, D, E, F)
- Qualifier/action markers: ALWAYS LOWERCASE (d, s, v, r, rc, ac)
- Control words: ALWAYS LOWERCASE (off, stp)

### 1.3 Beacon Types (12 total)

| Window | Format | Meaning | Example | Regex Pattern |
|--------|--------|---------|---------|---------------|
| A | `A{ROUND}` | Round trigger (user submitted) | A0001 | `^A\d{4}$` |
| B | `B{ROUND}` | Hub conclusion (goals refined) | B0001 | `^B\d{4}$` |
| C | `C{ROUND}` | Review conclusion (architecture ready) | C0001 | `^C\d{4}$` |
| B/C | `{B|C}{ROUND}-d0X` | Blueprint delivery (D01-D06) | B0001-d01 | `^[BC]\d{4}-d0[1-6]$` |
| B/C | `{B|C}{ROUND}-s{GROUP}-00` | Dispatch trigger (wake e10) | B0001-s0001-00 | `^[BC]\d{4}-s\d{4}-00$` |
| B | `B{ROUND}-s{GROUP}-{VERSION}-{WINDOW}` | Work order dispatch | B0001-s0001-01-D | `^B\d{4}-s\d{4}-\d{2}-[DEF]$` |
| D/E/F | `{WINDOW}{ROUND}-v{VERSION}-{ITERATION}` | Submission for review | D0001-v01-01 | `^[DEF]\d{4}-v\d{2}-\d{2}$` |
| C | `C{ROUND}-r{VERSION}-{ITERATION}-{WINDOW}` | Directed rejection | C0001-r01-01-D | `^C\d{4}-r\d{2}-\d{2}-[DEF]$` |
| D/E/F | `{WINDOW}{ROUND}-rc{VERSION}-{ITERATION}` | Historical reconciliation submission | D0001-rc01-01 | `^[DEF]\d{4}-rc\d{2}-\d{2}$` |
| C | `C{ROUND}-rc{VERSION}-{ITERATION}-{WINDOW}` | Reconciliation rejection | C0001-rc01-01-D | `^C\d{4}-rc\d{2}-\d{2}-[DEF]$` |
| C | `C{ROUND}-ac{SEQ}-{WINDOW}` | Advisory opinion (supervisor) | C0001-ac01-D | `^C\d{4}-ac\d{2}-[DEF]$` |
| C | `C{ROUND}-00` | Architecture regen notification (E08/E09 → E05 rebuild steps) | C0001-00 | `^C\d{4}-00$` |
| B | `B{ROUND}-00` | Steps regen complete handshake (E05 → E08/E09 fire off) | B0001-00 | `^B\d{4}-00$` |
| — | `off{ROUND}` | Normal round completion | off0001 | `^off\d{4}$` |
| — | `stp{ROUND}` | Forced round termination | stp0001 | `^stp\d{4}$` |

### 1.4 Qualifier Reference

| Qualifier | Meaning | Producing Engine/Window |
|-----------|---------|------------------------|
| -d01 | goals.md updated | e01 (B), e07 (C, correction) |
| -d02 | requirements.md updated | e02 (C) |
| -d03 | architecture.md updated | e03 (C) |
| -d05 | steps.md + step files updated | e05 (B) |
| -d06 | summary.md updated | e06 (B) |
| -sXXXX-00 | Dispatch trigger (not a work order) | e05 (B) or e07 (C) |
| -sXXXX-VV-W | Work order for executor window W | e10 (B) |
| -vVV-II | Submission, version VV, iteration II | Executor windows (D/E/F) |
| -rVV-II-W | Rejection, version VV, iteration II, to window W | e08 (C) |
| -rcVV-II | Reconciliation submission | Executor windows (D/E/F) |
| -rcVV-II-W | Reconciliation rejection, to window W | e09 (C) |
| -acSS-W | Advisory, sequence SS, to window W | e08 supervisor (C) |
| -00 | Architecture regen handshake (C0001-00=E08/E09→E05, B0001-00=E05→E08/E09) | E08/E09 (C) / e05 (B) |

---

## 2. Window & Round System

### 2.1 Window Identifiers

| Window | ID | Name | Role |
|--------|-----|------|------|
| A | 101 | Dialogue | Receives user input; emits A{ROUND} |
| B | 201 | Hub | Goal refinement, step decomposition, dispatch |
| C | 301 | Supervisor | Review, supervision, slot convergence, architecture audit |
| D | 401 | Executor | Produces output per work orders; expandable to D→E→F… |
| E | — | Executor | Horizontal extension |
| F | — | Executor | Horizontal extension |

### 2.2 Round System

- Rounds are 4-digit zero-padded integers: 0001–9999
- Round advances by +1 when `off` or `stp` is received
- `off`: normal completion (all executors passed review)
- `stp`: forced termination (user action or iteration meltdown)
- Both `off` and `stp` trigger round +1

---

## 3. Engine System

### 3.1 Engine Auto-Registration

Window agent (`window-agent.ts`) scans the `engines/` directory on startup and after each round step. For each `.json` file with a non-null `trigger.pattern`, it registers a listener on the event bus. Beacons matching the regex trigger `runEngine()`.

### 3.2 Engine Registry (9 engines)

| Engine | Trigger Regex | Runs On | Output | Behavior |
|--------|--------------|---------|--------|----------|
| e01 | `^A\d{4}$` | B(201) | D01 goals.md | Goal extraction from dialogue |
| e02 | null (chain) | C(301) | D02 requirements.md | Requirement list; invoked by e07 via chain_engine |
| e03 | null (chain) | C(301) | D03 architecture.md | Architecture tree + scaffold; invoked by e02 via chain_engine |
| e04 | — | — | D04 review-rules.md | MISSING: D04 produced statically by project.ts template |
| e05 | `^C\d{4}(?:-00)?$` | B(201) | D05 steps.md + split steps | Step decomposition: normal=emit B{ROUND}-s{ROUND}-00 dispatch; REGEN mode (-00 trigger)=rebuild steps only, emit B{ROUND}-00 handshake, no dispatch |
| e06 | `^off\d{4}$` | B(201) | D06 summary.md | Terminal engine; writes round summary; emits no beacons |
| e07 | `^B\d{4}$` | C(301) | Cross-validation | Routing hub: CHANGED=false→emit C{ROUND}-s{ROUND}-00; CHANGED=true→chain e02 |
| e08 | `^[A-Z]\d{4}-v\d{2}-\d{2}$` | C(301) | Review verdict + reject instructions | 5-dimension review; max_iterations=6; four exits: off/chain e09/r/ac |
| e09 | `^[A-Z]\d{4}-rc\d{2}-\d{2}$` | C(301) | Reconciliation verdict | Dual-mode (init/reconcile); drift detection→partition→review→arch sync |
| e10 | `^[BC]\d{4}-s\d{4}-00$` | B(201) | Dispatch work orders | Capacity decision (CAP=10) + LLM partition + work order generation + validate_dispatch + broadcast_all |

### 3.3 Engine Action Types (14 total)

read_file, write_file, llm_call, parse, broadcast, chain_engine, user_confirm, scaffold, foreach_executor, split_steps, resolve_steps, prepare_dispatch, apply_partition, broadcast_all

---

## 4. Beacon Flow

### 4.1 Round 1 (complete sequence, 14 steps)

```
Step  Beacon              From       To         Action                  Output
1     A0001               Dialogue   e01(201)   Goal extraction         core/goals.md
2     B0001-d01           e01        Panels     Goal delivery notice     D01 displayed
3     B0001               e01        e07(301)   Cross-validation        CHANGED determined
4     (chain e02)         e07        e02(301)   Requirement list        core/requirements.md
5     (chain e03)         e02        e03(301)   Architecture+scaffold   core/architecture.md
6     C0001-d03           e03        Panels     Architecture notice      D03 displayed
7     C0001               e03        e05(201)   Step decomposition      core/steps.md + split JSONs
8     B0001-d05           e05        Panels     Step delivery notice     D05 displayed
9     B0001-s0001-00      e05        e10(201)   Dispatch trigger         —
10    B0001-s0001-01-D    e10        401(D)     Work order dispatch      dispatch/B{beacon}.json
11    D0001-v01-01        401(D)     e08(301)   Submission               workspace/ files
12    C0001-r01-01-D(*)   e08        401(D)     Rejection                reject/C{beacon}.json
13    C0001-ac01-D(*)     e08 sup    401(D)     Advisory                 advisory/C{beacon}.json
14    off0001             e08        Global     Round complete           summary.md; round+1
```

`(*)` indicates conditional steps (only if review fails or supervisor intervenes).

### 4.2 Round 2+ Branch A — Goals Unchanged (CHANGED=false)

```
Step  Beacon              From       To         Action
1     A0002               Dialogue   e01(201)   Goal extraction (no change detected)
2     B0002-d01           e01        Panels     Goals appended "unchanged"
3     B0002               e01        e07(301)   Cross-validation → CHANGED=false
4     C0002-s0002-00      e07        e10(201)   Direct dispatch trigger (skip e02/e03/e05)
5     B0002-s0002-01-D    e10        401(D)     Work order (continuing from existing step files)
6     D0002-v01-01        401(D)     e08(301)   Submission
7     off0002             e08        Global     Round complete
```

### 4.3 Round 2+ Branch B — Goals Changed (CHANGED=true)

```
Step  Beacon              From       To         Action
1     A0002               Dialogue   e01(201)   Goal extraction (change detected)
2     B0002-d01           e01        Panels     New goals appended
3     B0002               e01        e07(301)   Cross-validation → CHANGED=true
4     (chain e02)         e07        e02(301)   Full rebuild: requirements
5     (chain e03)         e02        e03(301)   Full rebuild: architecture
6     C0002               e03        e05(201)   Full rebuild: step decomposition
7     B0002-s0002-00      e05        e10(201)   Dispatch trigger (new steps)
8     B0002-s0002-01-D    e10        401(D)     Work order
9     D0002-v01-01        401(D)     e08(301)   Submission
10    (chain e09)         e08        e09(301)   Historical reconciliation init
11    C0002-rc01-01-D     e09        401(D)     Reconciliation work order
12    D0002-rc01-01       401(D)     e09(301)   Reconciliation submission
13    off0002             e09        Global     Round complete (after architecture consistency check)
```

---

### 4.4 Architecture Change → Steps Regeneration

When E08 merges or E09 syncs the architecture tree, the tree is updated but development steps still reflect the old tree. E08/E09 notify E05 via C{ROUND}-00 to rebuild steps.

```
Step  Beacon             From      To         Action
1     C0001-00           E08/E09   e05(201)   Notify architecture changed → trigger steps rebuild
2     (e05 REGEN mode)   e05       201        Read runtime/arch-files.json → LLM regenerates all steps
3     B0001-00           e05       E08/E09    Notify steps rebuild complete
4     off0001            Supervisor Global     Emit off (B{ROUND}-00 handler verifies regen marker cleared)
```

E05 in REGEN mode:
- Reads `runtime/arch-regen.json` to determine trigger source (E08 or E09)
- Appends D05 steps.md (`## d05 Round X Steps Micro-adjustment`)
- Deletes old `d{ROUND}/` step files → rebuilds all group JSONs
- Clears `runtime/arch-regen.json`
- Emits `B{ROUND}-00` (instead of `B{ROUND}-s{ROUND}-00`)

---

## 5. Review & Supervision

### 5.1 Review Cycle

- Executor submits via `{WINDOW}{ROUND}-v{VERSION}-{ITERATION}`
- e08 performs 5-dimension review: instruction completeness, architecture compliance, rule compliance (7 rules + D04), quantitative redlines (file≥400 lines reject, function≥80 lines reject, nesting≥4 warn), overall verdict
- Pass → check convergence → if ALL_PASSED and TARGET_CHANGED=false → emit off
- Pass → check convergence → if ALL_PASSED and architecture changed (E08 merge or E09 sync) → write runtime/arch-regen.json + emit C{ROUND}-00 → E05 rebuilds steps → B{ROUND}-00 → supervisor verifies and emits off
- Pass → check convergence → if ALL_PASSED and TARGET_CHANGED=true and HISTORICAL_DONE≠true → chain e09
- Fail → write reject instruction to `reject/C{ROUND}-r{VERSION}-{ITERATION}-{WINDOW}.json` → broadcast `C{ROUND}-r{VERSION}-{ITERATION}-{WINDOW}`

### 5.2 Meltdown (max_iterations=6)

When a window reaches iteration 6 of submission (e.g., D0001-v01-06) and review fails:
- Window agent writes `melted` mark to terminal
- No rejection beacon is emitted
- Supervisor watchdog detects melted state → reassign or abandon slot
- All slots abandoned → emit `stp{ROUND}`

### 5.3 Supervisor Layer (slot tracking + watchdog)

The supervisor (part of e08) maintains a slot ledger tracking every executor window:
- `pending` → window received work order, not yet submitted
- `delivered` → window passed review
- `abandoned` → window irrecoverably failed

Watchdog runs every 5 seconds:
- Slots inactive > 60 seconds → check terminal status
- melted → immediate reassign to another window
- transient failure (timeout/parse/empty) → diagnose up to 2 times → reassign
- empty work order → immediately abandon

Advisory beacons: `C{ROUND}-ac{SEQ}-{WINDOW}` with kind `diagnose` (rerun own work order) or `reassign` (take over another slot's work order).

### 5.4 Three-Layer Verification

| Layer | Trigger | Responsible | Action |
|-------|---------|-------------|--------|
| 1 | Normal round convergence | e08 convergence point | Coverage-based architecture audit: disk code vs architecture tree → overwrite if mismatch |
| 2 | Goal-change round | e09 architecture sync | Post-rebuild consistency check: workspace files vs architecture tree → append sync section |
| 3 | Pre-dispatch | e10 validate_dispatch | Pre-broadcast gate: scan work order paths against architecture tree → strip spurious directory layers |

---

## 6. Dispatch & Execution

### 6.1 Capacity Decision (CAP=10)

Each executor window handles at most 10 files per work order.

```
TARGET = min(open_windows, max(1, ceil(total_files / 10)))
```

### 6.2 Partition Allocation

- LLM performs intelligent partition: assign file list completely and non-duplicatively across TARGET windows
- `apply_partition` validates: full coverage, zero duplicates, correct window count
- On validation failure: fallback to deterministic modulo slicing

### 6.3 Pre-Dispatch Validation Gateway (validate_dispatch)

After e10 generates dispatch work orders and before broadcast_all:
1. Read architecture tree (D03) to extract legal top-level directories
2. Scan each work order's workspace/ paths
3. If a top-level directory is not in the architecture tree but the second level is a legal root → strip the spurious layer
4. Correct work order instructions, executor terminals, and hub terminals/panels
5. All validated → broadcast_all emits all dispatch beacons concurrently

### 6.4 File Mapping

Beacon string equals filename within the dispatch/reject/advisory directories:

| Beacon | File Path |
|--------|-----------|
| B0001-s0001-01-D | dispatch/B0001-s0001-01-D.json |
| C0001-r01-01-D | reject/C0001-r01-01-D.json |
| C0001-ac01-D | advisory/C0001-ac01-D.json |

### 6.5 Executor Operating Modes

| Mode | Trigger Beacon | Behavior |
|------|---------------|----------|
| First execution | `B{ROUND}-s{GROUP}-{VERSION}-{WINDOW}` | Read work order → LLM produces all files → write to workspace/ → emit v submission |
| Rejection rewrite | `C{ROUND}-r{VERSION}-{ITERATION}-{WINDOW}` | Read reject file → LLM corrects per review instructions → write → emit v with iteration+1 |
| Reconciliation | `C{ROUND}-rc{VERSION}-{ITERATION}-{WINDOW}` | Read reconciliation work order → LLM corrects historical files per new architecture → write result summary → emit rc submission |

---

## 7. State Machine & Boundaries

### 7.1 Runner State Machine

| State | Meaning | Submit Button | Stop Button |
|-------|---------|---------------|-------------|
| IDLE | Idle | Clickable (start first round) | Disabled |
| RUNNING | A{N} executing | Disabled (prevent duplicate) | Clickable (emit stp) |
| QUEUED | A{N+1} queued | Disabled | Disabled |
| STOPPED | A{N} stopped | Clickable (rerun current round) | Disabled |

### 7.2 Asymmetric Turn Segmentation

| Window | Segmentation Timing | Effect |
|--------|---------------------|--------|
| A (101) | On emitting or intercepting A{ROUND} | Subsequent input attributed to next round (early segmentation) |
| B/C/D (201/301/401) | On intercepting off{ROUND} or stp{ROUND} | Assets attributed to next round only after round ends (delayed segmentation) |

### 7.3 Specification Boundaries

This specification covers:
- Beacon grammar, encoding rules, and regex patterns
- Window identity and round system
- Engine trigger patterns and auto-registration mechanism
- Complete beacon flows for all round scenarios
- Review, supervision, dispatch, and execution rules
- State machine and turn segmentation

This specification does NOT cover:
- Implementation language, framework, or runtime
- File system layout beyond the beacon=filename mapping principle
- LLM prompt content (system_prompt and user_prompt_template are implementation details)
- UI rendering, panel layout, or visual design
- Network transport or inter-process communication (reference implementation uses in-process event bus)

### 6.6 True Concurrent Dispatch (Future)

Current implementation dispatches one step group per round (S-number aligned with round number).
The beacon system supports finer-grained concurrency: within a single round, the B{ROUND}
prefix remains constant, while multiple different S-numbers are dispatched to different
executor windows simultaneously.

Round and step are independent dimensions:
  · Round (B0001) is determined by the hub's round manager — only increments on off.
  · Step (S0001) is a task group number produced by e05 step decomposition.
  · They are not bound to each other.

Example — Round 0001 dispatches three windows, each receiving a different step:
  B0001-S0001-01-D  (window D receives step S0001)
  B0001-S0002-01-E  (window E receives step S0002)
  B0001-S0003-01-F  (window F receives step S0003)

Progress Marker: At round completion, the system MUST persist the last completed step.
Marker file: runtime/progress.json → {"lastStep": "S0003"}.
When round 0002 starts, e10 reads the marker and dispatches from S0004 onward:
  B0002-S0004-01-D, B0002-S0005-01-E, B0002-S0006-01-F

Constraints:
  · Step numbers (S0001-S9999) form a global incrementing sequence, produced once by e05
    and immutable thereafter.
  · If goals change, e05 re-decomposes and produces a new step sequence; the old progress
    marker is invalidated and counting restarts from S0001.
