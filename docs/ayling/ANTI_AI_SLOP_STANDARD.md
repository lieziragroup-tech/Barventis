# Anti-AI-Slop Engineering Standard

The goal is useful, specific, maintainable work—not maximum output volume or surface polish.

## Reject or correct these failure patterns

- Generic advice that ignores repository, user, business process or constraints.
- Hallucinated files, APIs, endpoints, commands, package versions, benchmark numbers, test output or citations.
- Large rewrites when a small, reversible patch would meet the requirement.
- Unnecessary frameworks, dependencies, state managers, services, abstractions, queues, microservices, databases or hosting products without evidence of need.
- Fake features: buttons that do nothing, forms without validation, mock data presented as real, integrations represented by hardcoded responses, non-functional filters, fake success/error toasts, empty dashboard charts.
- Code with missing imports, undefined symbols, ellipses, unimplemented branches, swallowed exceptions, unsafe fallback behavior, secrets in source, or TODOs masquerading as completed work.
- Repeated boilerplate, huge prompt dumps, irrelevant checklists, inflated estimates, invented KPI improvements, and claims like “enterprise-grade” without a concrete control set.
- UI decoration that hurts task completion, information hierarchy, accessibility, responsive design, or performance.
- Tests that merely repeat implementation logic and fail to test acceptance criteria, boundary conditions, failure behavior, authorization and regressions.

## Required replacement behavior

1. Tie each proposed feature to a user problem, requirement, acceptance criterion or explicitly stated experiment.
2. State what's real, mocked, deferred, and not implemented.
3. Prefer small vertical slices that can be run and reviewed.
4. Use existing conventions unless there is a concrete reason to change them.
5. Include actual empty/loading/success/error/permission states when applicable.
6. Use test data that is labeled synthetic; never fabricate production findings or business metrics.
7. If an output needs placeholders (API key, domain, schema, assets, credentials), identify each one with an exact setup instruction and don't present the result as ready until they are configured.
8. Make trade-offs explicit only when material; don't bury straightforward work in architecture theatre.
9. Before handing off, perform the slop gate below.

## Slop gate (must pass or disclose exceptions)

- [ ] Does every material feature map to user need / requirement?
- [ ] Were repository conventions and actual files inspected?
- [ ] Are imports, paths, types, dependencies, endpoints, and scripts real or explicitly marked assumptions?
- [ ] Are controls functional and integration status honest?
- [ ] Is mock/demo data labeled?
- [ ] Are exceptions handled without hiding useful failure evidence?
- [ ] Are security, authorization, privacy and data integrity considered at relevant boundaries?
- [ ] Are tests targeted to acceptance criteria and failure modes?
- [ ] Did the change avoid unnecessary expansion of scope?
- [ ] Are limitations and NOT RUN checks visible?

## UI-specific slop gate

- Does the layout support the main task and content hierarchy?
- Are responsive behavior, focus/keyboard use, readable contrast, semantic structure and common states handled?
- Are animations respectful of reduced-motion preferences and not used as substitutes for usability?
- Are menu/catalog views manageable for the data volume rather than showing everything by default?
- Are all links, filters, dialogs and form actions connected to real behavior?

## Output-specific slop gate

Don't create lengthy prose when a decision, patch or artifact is needed. Avoid fabricated metrics and inflated claims. Mention the most important evidence, trade-off, uncertainty and next action.
