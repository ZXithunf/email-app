# Security Specification

## Data Invariants
1. Only authenticated administrators can read and write contacts, campaigns, templates, logs, and settings.
2. Every contact must have a valid non-empty name, email matching an email format, phone number, and status of subscribed, unsubscribed, or bounced.
3. Every campaign must have a name, non-empty channels list, active boolean, sendTime (HH:mm), dayOfMonth (1-31).
4. Every message log record must have a campaignId, contactId, channel, monthCycle (YYYY-MM), status, and scheduledAt.
5. MessageLogs are immutable once written to preserve audit integrity.
6. Identity integrity: Users can only write their own user profile document.
7. System settings can only be read/updated by authenticated users.

## The Dirty Dozen Payloads (Rejection Invariants)
1. Unauthenticated client attempting to list contacts.
2. Unauthenticated client attempting to write to messageLogs.
3. Contact payload missing email or with invalid email format.
4. Contact payload with name exceeding 150 characters.
5. Contact with unbounded arbitrary fields (shadow update injection).
6. Campaign payload with invalid dayOfMonth (e.g. 35 or 0).
7. Campaign payload with oversized email body exceeding bounds.
8. Message log record with invalid channel (e.g. "carrier_pigeon").
9. Modifying an existing immutable message log's audit history.
10. Attempting to write another user's UID profile document.
11. Attempting to inject document IDs containing illegal non-alphanumeric characters.
12. Attempting to update campaign createdAt field (immortal field violation).
