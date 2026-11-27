# Ayling Reference Registry — Primary Sources

**Registry checked:** 2026-10-22. This means links were located/consulted during package preparation; it does not mean every version will remain current. Re-check the source for volatile claims before relying on it.

Use this as a curated entry point, not as a substitute for reading the relevant pages. If a URL redirects or changes, locate the current official documentation and update the ledger.

| ID | Domain | Official primary reference | Use for | Freshness / caveat |
|---|---|---|---|---|
| REF-PLAT-01 | OpenAI | https://help.openai.com/en/articles/20001066-skills-in-chatgpt | ChatGPT Skills UI, eligibility, uploading and workspace controls | Help page checked 2026-10-22; eligibility can vary by product/workspace |
| REF-PLAT-02 | OpenAI | https://learn.chatgpt.com/docs/build-skills | Skill structure, progressive disclosure, ChatGPT/Codex skills | Product docs can change; distinguish ChatGPT app from API/Codex |
| REF-PLAT-03 | OpenAI API | https://developers.openai.com/api/docs/guides/tools-skills | API skill packaging, versioning, local/hosted execution and risks | API-specific; does not imply every consumer app exposes these controls |
| REF-PLAT-04 | OpenAI Help | https://help.openai.com/en/articles/8554397-gpts | Custom GPT instructions and knowledge files | Account eligibility/product UI may vary |
| REF-PLAT-05 | Anthropic | https://support.claude.com/en/articles/12512198-how-to-create-custom-skills | Skill authoring, ZIP root structure, validation and security | Checked 2026-10-22; plan/feature availability can vary |
| REF-PLAT-06 | Anthropic | https://support.claude.com/en/articles/12512180-use-skills-in-claude | Upload/enable custom skills in Claude | Check current Claude surface; Claude Code is different from claude.ai |
| REF-PLAT-07 | Anthropic | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview | Agent Skills format and Claude Code behavior | Platform docs, re-check if paths/API change |
| REF-PLAT-08 | Google | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md | Gemini CLI skill discovery/install/consent | GitHub `main` is mutable; check commit/date before claims about current behavior |
| REF-PLAT-09 | Google | https://support.google.com/gemini/answer/14903178?co=GENIE.Platform%3DDesktop&hl=id-ID | Gemini app file upload, ZIP limits and available file types | Product plan and admin settings may change limits |
| REF-PLAT-10 | OpenAI | https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra | Skill/AGENTS.md design and avoiding bloated context | Published Sep 11, 2026; model-specific guidance, principles may evolve |
| REF-ARCH-01 | C4 model | https://c4model.com/ | System context/container/component/code diagram approach | Official model site; use only diagram levels that add value |
| REF-SEC-01 | OWASP | https://asvs.owasp.org/ | Application security verification requirements | Latest stable version must be checked at use time; 5.0.0 identified as stable during review |
| REF-SEC-02 | OWASP GenAI | https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/ | Threats and risks in LLM/GenAI applications | OWASP GenAI LLM Top 10 2026 release noted on Aug 4, 2026; check current edition |
| REF-SEC-03 | OWASP GitHub | https://github.com/OWASP/ASVS | Source repository for ASVS release files/history | Prefer tagged stable release for production checklists over a moving branch |
| REF-RISK-01 | NIST | https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence | AI RMF Generative AI Profile (NIST AI 600-1) | Published July 2024, updated listing checked 2026-10-22; voluntary risk-management guidance |
| REF-CI-01 | GitHub | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository | Branch/tag rulesets, required checks, merge controls | Plan/repository features differ |
| REF-GIT-01 | GitHub | https://docs.github.com/en/actions | GitHub Actions workflows/CI automation | Use current docs and repository-specific workflow permissions |
| REF-SKILL-01 | Agent Skills | https://agentskills.io/ | Open Agent Skills format and ecosystem | Specification/implementations can differ; validate per host |

## Preferred source policy

- Product UI or access claim: use that product's current Help Center for the exact surface.
- API behavior: use current API reference/versioned docs, not consumer help pages.
- Security requirements: use versioned standards or official project releases; write the exact version into the project decision/test plan.
- Architecture diagrams: use the official C4 site and choose diagram levels based on audience/need.
- AI risk: supplement application security with NIST AI RMF GenAI Profile and the current OWASP GenAI LLM Top 10 as appropriate.

## Do not do this

Do not claim that the package has embedded complete copies of these standards. It contains source links and concise working guidance. Check licenses before redistributing source materials. Do not present a checklist as proof the system complies with a standard without executing the applicable checks.


## Personal assistant, memory, and multi-agent orchestration (reviewed 2026-10-22)

| Source | Official URL | Useful for | Limitations / note |
|---|---|---|---|
| OpenAI Agents SDK — Agents | https://github.com/openai/openai-agents-python/blob/main/docs/agents.md | Defines agents, tools, guardrails, structured output and agent manager patterns | Applies to software built with the SDK, not an automatic capability of ChatGPT UI |
| OpenAI Agents SDK — Orchestration | https://github.com/openai/openai-agents-python/blob/main/docs/multi_agent.md | Compare manager-as-tools and handoff patterns | Requires configured runtime/tool definitions |
| OpenAI Agents SDK — Handoffs | https://github.com/openai/openai-agents-python/blob/main/docs/handoffs.md | Explicit delegation to another configured agent | Handoffs are runtime behavior, not prompt-only |
| OpenAI Help — GPTs FAQ | https://help.openai.com/id-id/articles/8554407-gpts-in-chatgpt | Custom GPT boundaries including memory/conversation behavior | Recheck for future product changes; this registry is not real-time product state |
| Claude Code — Extend Claude Code | https://code.claude.com/docs/id/features-overview | Distinguishes instructions, skills, subagents, MCP, hooks and plugins | Native code workspace features; not all available in Claude chat UI |
| Gemini CLI — Agent Skills | https://geminicli.com/docs/cli/skills/ | Standard skill directory and progressive disclosure | Depends on installed Gemini CLI and configuration |
| Gemini CLI — Subagents | https://geminicli.com/docs/core/subagents/ | Specialized workers callable inside Gemini CLI | Does not imply Gemini web app has identical functionality |
| Gemini CLI — Skills best practices | https://geminicli.com/docs/cli/skills-best-practices/ | Skill descriptions, triggering, separation and progressive disclosure | Agent routing still needs correct environment setup |

Verify source pages on use for changes to product features, API signatures, availability, plans or installation commands. A URL in this registry is a research starting point, not proof that a platform feature is enabled on the user's account.


## User-requested upstream skill integrations (reviewed 2026-10-22)

The following are upstream source pages, not evidence that the source is installed in this package. Read `integrations/SOURCE_REGISTRY.yaml` and `integrations/INSTALLATION_GUIDE.md` before installing.

- UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Superpowers: https://github.com/obra/superpowers
- MarketingSkills: https://github.com/coreyhaines31/marketingskills
- No AI Slop: https://github.com/petergyang/no-ai-slop
- Ponytail: https://github.com/DietrichGebert/ponytail
- Anthropic Skills: https://github.com/anthropics/skills
- REA: https://github.com/morluto/rea
- Paperclip: https://github.com/paperclipai/paperclip
- Open Design: https://github.com/nexu-io/open-design
- Taste Skill: https://github.com/Leonxlnx/taste-skill
- Archify: https://github.com/tt-a1i/archify
- Awesome Claude Skills: https://github.com/ComposioHQ/awesome-claude-skills
