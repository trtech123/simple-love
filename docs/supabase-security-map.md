# Supabase Browser Access Map

This map documents the intended direct browser posture after `202606030001_rls_security_audit.sql`. Server routes and admin actions may still use the service-role client when protected by app-level guards or claim/payment tokens.

| Table | Browser posture | Notes |
| --- | --- | --- |
| `profiles` | Owner read/update | `user_id = auth.uid()`. Profile creation and privileged changes stay server-mediated. |
| `profile_traits` | Owner read | Trait writes stay server-mediated. |
| `profile_deal_breakers` | Owner read | Matching profile writes stay on `PUT /api/profile/matching` through service role. |
| `matches` | Participant read | Direct browser writes are not allowed. |
| `conversations` | Participant read | Direct browser inserts are not allowed. |
| `messages` | Participant read | Message creation stays on server routes. |
| `user_reports` | Insert-only | Participants can file a report through the existing insert policy; reads stay server/admin-only. |
| `user_blocks` | Owner read/insert/delete | Only the blocker can manage their own block rows. |
| `reports` | Owner read | Claimed users can read reports where `user_id = auth.uid()`. |
| `report_artifacts` | Owner read | Artifacts are visible only through an owned report; writes are server-only. |
| `quiz_sessions` | Owner read | Only claimed sessions with `user_id = auth.uid()` are visible. |
| `quiz_answers` | Owner read | Answers are visible only through an owned claimed session. |
| `payments` | Server-only | No direct browser policies. |
| `registration_claim_tokens` | Server-only | Claim flows stay mediated by server routes. |
| `questionnaires`, `questionnaire_versions`, `questionnaire_blocks`, `questions`, `question_options` | Server-only | Public quiz/content loading stays server-mediated. |
| `prompt_versions`, `archetypes`, `archetype_versions`, `match_settings`, `match_settings_versions` | Server-only | Admin/config/content reads and writes stay behind admin pages/actions. |
| `match_explanations` | Server-only | Internal matching/debug information is not exposed directly. |
| `admin_audit_logs` | Server-only | Audit entries are written by guarded admin actions only. |

The `public.save_matching_profile(...)` RPC is executable by `service_role` only. Browser clients should call `PUT /api/profile/matching`, which authenticates the user and invokes the RPC from the server.
