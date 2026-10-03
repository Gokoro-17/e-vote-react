# Security and privacy model

The server validates a Supabase identity and active provider session. Application role assignments remain in the private database. Organization checks protect tenant resources; no browser API role can query the private application schema. Anonymous ballots use a separate encryption key from identity documents and notification bodies.

Participation and ballot content are separate tables. A ballot has no voter ID, receipt, session, IP, or precise timestamp. Receipts contain no selections. Transactions provide concurrency control, but **database transaction/WAL records, infrastructure logs, timings, encrypted payload lengths, and small-group results can still correlate participation and choices**. A privileged operator with keys/database control is a trusted party. Tenant isolation and encryption alone do not remove these risks.

The ballot commitment is a SHA-256 digest of stored ciphertext; it detects ciphertext corruption when tallying. It is not a voter-verifiable cryptographic commitment protocol. Hash-linked append-only audit records can detect changes within ordinary application privileges; a database owner can bypass triggers or reconstruct a chain. Independent external anchoring, key custody separation and verified infrastructure controls would strengthen auditability.

Higher-security options require a separate design and independent analysis:

- Blind signatures or anonymous credentials can unlink credential issuance from ballot submission, but require robust issuance, replay prevention, revocation, coercion analysis and independently reviewed cryptographic protocols.
- End-to-end verifiable voting combines encrypted ballots, proofs of valid ballot formation, published verifiable tally evidence, and suitable trustee/key procedures. It also needs accessible independent verification and explicit threat assumptions.
- Public bulletin boards and external commitment/audit anchoring can help detect record replacement, but must account for ballot secrecy, availability, small election inference and dispute handling.

These are research directions, not implemented or claimed guarantees. The [Helios paper](https://www.usenix.org/legacy/event/sec08/tech/full_papers/adida/adida.pdf) is a primary example of an auditable web voting system with specific threat assumptions. Adopting a cryptographic technique does not substitute for protocol review, independent implementation testing, accessible operations, or electoral authority approval.

Rate and abuse signals are review aids. Repeated failures, shared-IP registration bursts, bot failures, endpoint validation patterns and activity spikes can have legitimate explanations. They never independently suspend users; platform suspension is an explicit authorized administrative action.

Documents are encrypted before private storage upload. PDF/image signatures and MIME/size checks do not replace malware scanning or authoritative identity verification. Downloads use attachment/no-store responses; campaign images are decoded/re-encoded with pixel limits and metadata removed. Higher-security operations should add an independently operated malware scanner and quarantine service.

Account deletion removes personal account information and queues durable Auth/object cleanup. Pseudonymous participation and unique identity fingerprints remain to prevent duplicate participation. Public candidate election information may remain part of the election record. Legal retention and re-registration/correction procedures must be defined by the deployment operator.

No official government election certification, legal authorization, comprehensive penetration test, load test, browser/device acceptance, or independent security audit is represented by this implementation.
