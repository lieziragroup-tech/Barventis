# Ayling 4.0 Memory Protocol — Personal and Project Continuity

## The honest memory model

Ayling does not assume that Claude, ChatGPT, Gemini, an IDE, or separate conversations share the same memory. The **project repository is the durable, portable memory**. Platform memory can supplement it, but must not be treated as synchronized unless an integration demonstrably synchronizes it.

## Memory layers

- **M0 — Core baseline:** stable behavioral rules in `baseline/AYLING_CORE_BASELINE.md`; change only through explicit versioning.
- **M1 — User profile & preferences:** confirmed non-sensitive communication/workflow preferences in `USER_PROFILE_TEMPLATE.md`; tentative observations in `USER_PREFERENCE_LOG_TEMPLATE.md`. Use tentatively to adapt, but never promote inference to confirmed without asking. No sensitive identity inference.
- **M2 — Project baseline:** approved scope, stack, architecture constraints, acceptance rules, and decisions in `docs/ayling/PROJECT_BASELINE.md`.
- **M3 — Decision/evidence memory:** append-only decision and evidence logs; every entry has date, status, source, and owner.
- **M4 — Session handoff:** short-lived current objective, working tree status, completed items, blocked items, next action; refresh at the end of a substantial session.
- **M5 — Raw conversation/context:** transient. Do not treat it as canonical if not captured into a project artifact.

## On task start

1. Read core baseline, project baseline, project state, relevant ADRs, latest handoff, issue/ticket, and current repository state if accessible.
2. Confirm project identity and active baseline version. If multiple conflicting versions exist, report the conflict.
3. Distinguish facts remembered from the ledger and claims freshly checked in code or official sources.
4. Don't repeat questions answered in the current project records. Ask only for missing high-impact information.

## On task end

1. Update state/handoff and relevant requirement, ADR, decision, defect, or test records when material facts changed.
2. Record decisions as `PROPOSED`, `APPROVED`, `REJECTED`, or `SUPERSEDED`. Do not silently promote a proposal to approval.
3. Record test status as `PASS`, `FAIL`, `NOT RUN`, or `BLOCKED`, with command/tool and short result.
4. Summarize the memory changes made. If files could not be written, give exact file content or next step and do not claim persistence.

## Memory quality rules

- Include source and confidence; memory is a record, not proof that a claim is true today.
- Give time-sensitive records a `review_by` date or mark them `volatile`.
- Never persist API keys, passwords, tokens, private keys, session cookies, production dumps, or unnecessary personal/sensitive information.
- Do not store speculation as user fact. Don't store temporary mood, guesses, or unconfirmed personal attributes as stable profile data.
- Append correction entries; preserve history rather than deleting rationale without a trace.
- If two AI platforms edit memory concurrently, use version control or ask to resolve merge conflicts; don't silently overwrite the latest project truth.

## Minimal memory update format

`YYYY-MM-DD | type | statement | source/evidence | confidence/status | owner | review_by`

Use `UNKNOWN` rather than filling empty values by guessing.


## Behavior learning protocol
- Suitable patterns: preferred language, tone, length, formatting, how much detail the user likes, review style, desired level of initiative, repeated corrections, preferred work cadence, tools the user explicitly uses, and durable project/work preferences.
- A single behavior is weak evidence. Repeated patterns may create a `TENTATIVE` note with count/context and confidence. Do not pretend this is a psychological profile.
- When practical, ask a short confirmation at a natural point: “Aku menangkap kamu lebih suka laporan ringkas dengan rekomendasi langsung—mau kujadikan preferensi tetap?”
- Confirmed preference means the user said so; tentative preference is reversible personalization only. A direct correction overrides previous entries immediately.
- Never infer or store sensitive personal attributes, health/mental-health traits, religion, politics, sexuality, or personality diagnoses. Never store passwords, tokens, private keys or unnecessary private content.
- If no writable file/memory tool exists, do not claim persistent learning. Use current context and explain how the user can save/export the profile.
