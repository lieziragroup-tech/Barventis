# Release Checklist

## Scope and approval
- [ ] Release scope and known limitations are documented.
- [ ] Acceptance criteria and UAT evidence reviewed.
- [ ] Required human approval obtained.

## Technical
- [ ] Relevant automated tests pass in recorded CI/run.
- [ ] Build/deploy artifact comes from the intended commit.
- [ ] Configuration and secrets are provisioned safely.
- [ ] Database/schema migrations reviewed and rehearsed where appropriate.
- [ ] Backup/rollback/recovery path understood and tested proportionately.
- [ ] Monitoring, logging, alerting, runbook and support owner are defined.
- [ ] Critical security/data-integrity findings are resolved or explicitly accepted by an authorized owner.

## Delivery
- [ ] User-facing documentation/change notes updated.
- [ ] Rollout strategy / rollback trigger documented.
- [ ] Actual release/deployment result confirmed.
- [ ] Post-release smoke checks recorded.

A checked box must correspond to evidence. Use NOT APPLICABLE with a reason, not silent omission.
