# HumanBoard Push Notification Schema

HumanBoard notifications are second-subconscious interventions, not generic reminders. Each notification must reveal a pattern, resurface meaningful context, or invite a useful next action.

## Supported types

- `daily_synthesis`
- `weekly_pattern`
- `memory_resurfaced`
- `contradiction_detected`
- `theme_recurrence`
- `unfinished_loop`
- `decision_support`
- `capture_prompt`
- `streak_nudge`
- `system_observation`

## Object contract

The code-ready contract lives in `src/lib/notifications/schema.ts`.

Every notification includes:

- identity: `id`, `type`
- message: `title`, `body`, `insight`, `tone`
- evidence: `trigger.kind`, `trigger.entityIds`, `trigger.ruleId`, `trigger.observedAt`
- confidence: `insightConfidence` from `0` to `1`
- action: optional `label` and internal `deepLink`
- scheduling: `scheduledFor`, optional `expiresAt`
- suppression: `cooldownHours`, stable `dedupeKey`
- delivery: requested `channels` and `deliveryState`
- lifecycle timestamps: created, delivered, read, dismissed

## Trigger constraints

- Never deliver below the user's minimum confidence.
- Never deliver more than the user's daily maximum.
- Suppress matching `dedupeKey` records during cooldown.
- Respect quiet hours for browser delivery.
- Prefer one useful insight over several weak nudges.
- Do not manufacture contradictions or patterns from insufficient evidence.
- A notification must have a concrete evidence source or use `system` for transparent operational observations.

## Tone guidance

- `quiet`: resurfacing and synthesis without urgency.
- `curious`: pattern or contradiction framed as a question.
- `direct`: a clear decision or unfinished-loop intervention.
- `encouraging`: capture and streak nudges without guilt.

## V0 delivery boundary

V0 persists notifications per Firebase UID in browser local storage, renders an in-app notification center, and can use the browser Notification API while HumanBoard is open.

Background Web Push is a later deployment step requiring HTTPS, a service worker, push subscriptions, and a server-side delivery worker/VAPID or FCM credentials.
