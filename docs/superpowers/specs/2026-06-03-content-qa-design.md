# Content QA Design

## Goal

Verify that all launch content is complete, coherent, legally safe, Hebrew-first where needed, and published in the correct admin-managed versions.

## Current Context

The system stores versioned questionnaires, prompt templates, archetypes, report output sections, match settings, and admin-published content. Seed data includes the paid-report questionnaire, report prompt, archetypes, matching questionnaire, and match settings.

## Recommended Approach

Create a content QA checklist and admin review pass that verifies published content in the same data shape the app uses at runtime. Keep content edits in draft/publish workflows so historical answered versions remain reproducible.

## Content Surfaces

Public funnel:

- Homepage copy.
- Quiz intro and question text.
- Payment pending, failed, cancelled, and ready states.
- Report page section labels and disclaimer.
- Registration claim copy.

Matching:

- Matching profile labels and validation copy.
- 95-question depth questionnaire.
- Deal-breaker taxonomy labels.
- Match card summary and trait explanation copy.

Admin-managed:

- Report prompt template.
- 12 archetype versions.
- Matching settings labels and hard-filter descriptions.
- Questionnaire block titles and option labels.

Operational:

- Admin payment recovery labels.
- Report retry labels.
- Moderation/reporting labels.

## QA Rules

- No medical or mental-health diagnosis language.
- Report disclaimer is present and understandable.
- Prompt template includes required variables: `{{displayName}}`, `{{answersJson}}`, and `{{archetypeName}}`.
- Questionnaire answer options are ordered and complete.
- Published versions are intentional and draft versions are not accidentally used.
- Hebrew-first surfaces are checked by a Hebrew speaker before launch.
- English fallback labels are acceptable for internal/admin-only MVP surfaces but should be listed for later localization.

## Data Validation

Add or run checks for:

- Paid report questionnaire has 22 required multiple-choice questions.
- Matching questionnaire has 95 required questions in expected blocks.
- Every multiple-choice question has at least two options.
- Published archetypes include non-empty name, descriptions, scoring rules, and matching meaning.
- Prompt and archetype content produce valid `reportOutputSchema`.

## Testing

- Existing seed-data and admin-content tests remain required.
- Add content snapshot or contract tests for all published seed counts.
- Run one mock report generation and inspect resulting report sections.
- Run E2E smoke to ensure public content renders without broken sections.

## Launch Criteria

- Product owner approves published questionnaires, archetypes, and prompt.
- Hebrew-first user-facing copy is reviewed.
- Legal/product disclaimer is present.
- No placeholder or draft-only content is visible in production.
