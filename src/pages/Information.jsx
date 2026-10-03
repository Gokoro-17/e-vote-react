import { Link } from "react-router-dom";
import {
  ShieldCheck,
  LockKeyhole,
  Fingerprint,
  FileCheck2,
  ArrowRight,
} from "lucide-react";
import { PageHeading, ActionForm, Field, Captcha } from "../components.jsx";
import { api } from "../store.jsx";
const faq = [
  [
    "How do I create an election?",
    "Create and confirm your account, then create an organization in your workspace. Add the election schedule, eligibility rules, positions, and candidates before opening registration.",
  ],
  [
    "How do I join my organization?",
    "Find your organization in the directory and request membership. An organization administrator reviews your request. Election eligibility is a separate check.",
  ],
  [
    "What voting methods are supported?",
    "Single choice, multiple choice, approval, ranked choice, and weighted voting. An organizer sets the method for each position and may enable runoff review.",
  ],
  [
    "Why can’t I vote yet?",
    "Your email must be confirmed, the election must be open, and you must meet the election’s eligibility rules. Your voting page shows any outstanding requirement.",
  ],
  [
    "Does uploading an ID verify my identity?",
    "No. A document can support an eligibility review. Authoritative identity and verified date of birth require a configured authorized verification provider.",
  ],
  [
    "Can I change my ballot?",
    "You can edit your selection before confirmation. Once a ballot is submitted, it cannot be changed.",
  ],
  [
    "What does my receipt prove?",
    "It confirms that the application recorded your submission. It contains no candidate selection and is not an end-to-end cryptographic proof of election correctness.",
  ],
  [
    "When can I see results?",
    "The organizer chooses hidden, live, or delayed publication. Formal-election demonstrations keep results hidden until authorized publication.",
  ],
  [
    "Can this conduct government elections?",
    "Official government use requires separate certification, electoral-authority approval, legal compliance, accessibility review, secure infrastructure, and independent security auditing. The software alone does not provide this authorization.",
  ],
];
export function Information({ page }) {
  if (page === "faq")
    return (
      <div className="pg reading">
        <PageHeading eyebrow="HELP & FAQ" title="A clearer way to participate.">
          Answers for voters, candidates, and organizers.
        </PageHeading>
        {faq.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
        <p className="sub">
          Need help with a specific election? Contact your organization. For
          platform questions, <Link to="/contact">contact the team</Link>.
        </p>
      </div>
    );
  if (page === "security")
    return (
      <div className="pg">
        <PageHeading
          eyebrow="SECURITY & TRUST"
          title="Trust is in the details."
        >
          A clear view of how access, privacy, and election records are handled.
        </PageHeading>
        <div className="trust-overview">
          {[
            [
              Fingerprint,
              "Verified access",
              "Supabase Auth handles confirmed email accounts, Google sign-in, and optional authenticator protection. The server checks election eligibility independently.",
            ],
            [
              LockKeyhole,
              "Private ballots",
              "Encrypted ballot records contain no voter, session, receipt, or exact submission timestamp. Participation status is maintained separately.",
            ],
            [
              FileCheck2,
              "An inspectable process",
              "Administrative actions use append-only, hash-linked audit records. Receipts confirm submission without revealing a selection.",
            ],
            [
              ShieldCheck,
              "Controlled data access",
              "Organization roles are checked on the server. Application tables use a private database schema and documents are encrypted in private Supabase storage.",
            ],
          ].map(([Icon, title, detail]) => (
            <article key={title}>
              <Icon size={28} />
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <section className="s reading">
          <h2>Security has practical limits.</h2>
          <p>
            Account uniqueness is different from person uniqueness. General
            events rely on the organizer’s eligibility checks; formal
            demonstrations require an authorized provider’s stable identity
            reference. A database owner or an operator with encryption keys
            remains a trusted party. Timing and infrastructure metadata can also
            create correlation risks.
          </p>
          <p>
            This version does not implement blind signatures, anonymous
            credentials, or end-to-end verifiable cryptographic voting.
            Independent testing and a formal security review are required before
            higher-security use.
          </p>
          <h3>Report a concern</h3>
          <p>
            Send a platform security concern through our{" "}
            <Link to="/contact">contact page</Link>. Avoid including identity
            documents, passwords, or ballot selections.
          </p>
        </section>
      </div>
    );
  if (page === "privacy")
    return (
      <div className="pg reading">
        <PageHeading
          eyebrow="YOUR PRIVACY"
          title="Your information has a purpose."
        >
          This notice describes the application’s data handling. Your
          organization is responsible for explaining its election-specific
          processing and lawful basis.
        </PageHeading>
        <h2>What is collected</h2>
        <p>
          Organization subscriptions also retain the coordinator’s billing
          email, payment references, amounts, plan, and paid-through dates.
          Paystack processes payment details; this application does not store
          card numbers or CVV.
        </p>
        <p>
          Account name, confirmed email, consent, organization membership,
          election eligibility, verification evidence when required,
          participation status, and administrative security records. Date of
          birth is optional account information and does not establish age
          eligibility until verified by an authorized provider. Public candidate
          profiles and campaign images are visible to election participants or
          the public according to election access.
        </p>
        <h2>Ballots and participation</h2>
        <p>
          The platform records that you participated separately from your
          encrypted ballot. Your receipt and account export exclude candidate
          selections. Authorized organizers can review eligibility and aggregate
          results; their dashboards do not expose individual ballot content.
        </p>
        <h2>Verification documents</h2>
        <p>
          Documents are encrypted before upload to private Supabase storage.
          Only authorized organization reviewers can download them. The default
          retention is 30 days, with administrator settings between 1 and 90
          days. You can delete a document in your account. Scheduled cleanup
          must be running for expiration to remove stored files.
        </p>
        <h2>Account controls</h2>
        <p>
          You can change your display name and email notification preference,
          export account data, and request account deletion from{" "}
          <Link to="/account">account settings</Link>. Deletion removes personal
          profile data and documents while preserving pseudonymous participation
          records, verified identity fingerprints, anonymous ballots, and
          necessary audit history to protect election integrity. Backup
          retention follows the deployment operator’s separate recovery policy.
        </p>
        <h2>Service providers and requests</h2>
        <p>
          Supabase processes authentication, database, and storage data. The
          deployment may use configured transactional email, bot protection, and
          authorized identity services. Contact your organization or{" "}
          <Link to="/contact">the platform team</Link> about corrections,
          retention, or applicable data rights.
        </p>
        <h2>Deployment responsibilities</h2>
        <p>
          The operator must publish its legal identity, privacy contact, lawful
          basis, geographic processing locations, retention schedule, and
          applicable rights before collecting real identity data.
          Nigeria-focused deployments require an assessment of applicable
          Nigerian data-protection requirements and professional legal review.
        </p>
      </div>
    );
  return (
    <div className="pg reading">
      <PageHeading
        eyebrow="TERMS OF USE"
        title="A responsible voting workspace."
      >
        Use E-Vote for elections and voting events you are authorized to
        organize.
      </PageHeading>
      <h2>Account and organization responsibilities</h2>
      <p>
        Provide accurate account information, protect your sign-in credentials,
        and use only organization permissions granted to you. Organizers must
        define eligibility, communicate schedules and rules, obtain required
        consent, and resolve election disputes through their authorized
        procedures.
      </p>
      <h2>Participation and results</h2>
      <p>
        Ballots are final after confirmation. Eligibility and participation
        limits are enforced by the server. Organizers control result publication
        and must explain how ties or runoff procedures are resolved. Results are
        software-calculated records and require appropriate operational review.
      </p>
      <h2>Permitted use</h2>
      <p>
        Do not impersonate voters, bypass eligibility checks, submit
        unauthorized documents, abuse platform endpoints, or interfere with
        another organization’s election. Suspicious activity signals support
        review and do not independently establish wrongdoing.
      </p>
      <h2>Organization subscriptions</h2>
      <p>
        Free includes 50 registered voters per election. Pro includes 100 at
        ₦15,000 monthly; Business includes 1,000 at ₦25,000 monthly; Unlimited
        has no subscription voter cap at ₦40,000 monthly. Pending and rejected
        registrations occupy places. Voters participate without a subscription.
      </p>
      <p>
        Paid plans renew automatically each month through Paystack. An
        administrator must accept recurring billing before checkout. Cancel
        renewal in the billing workspace; paid access remains through its
        expiry. After expiry, new registrations follow the current plan.
        Existing registrations and recorded ballots remain.
      </p>
      <p>
        An upgrade starts a new full-price monthly period and requests
        cancellation of the previous renewal after the new subscription is
        confirmed. Payments are not prorated. Smaller plans can be chosen after
        the current paid period ends. Contact the team for payment disputes and
        refund requests.
      </p>
      <Link className="text-link" to="/pricing">
        View plans and capacity <ArrowRight size={16} />
      </Link>
      <h2>Official elections</h2>
      <p>
        Formal-election capability is configurable and intended for
        demonstrations until separately certified and authorized. Platform
        access is not authorization to conduct government elections.
      </p>
      <h2>Operator terms</h2>
      <p>
        The deployment operator must provide its identity, support contact,
        applicable jurisdiction, and approved contractual terms before public
        commercial operation. These application rules do not replace
        professional legal review.
      </p>
      <Link className="text-link" to="/contact">
        Contact the platform team <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function Contact() {
  return (
    <div className="pg contact-layout">
      <PageHeading eyebrow="CONTACT THE TEAM" title="Let’s talk.">
        Have a platform question or a security concern? Send a message to the
        team. Your organization can help with election-specific questions.
      </PageHeading>
      <ActionForm
        success="Your message has been sent to the platform team."
        onSubmit={(f) => api("/contact", { ...f, consent: f.consent === "on" })}
      >
        <Field
          label="Your name"
          name="name"
          minLength={2}
          maxLength={100}
          required
          autoComplete="name"
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <Field
          label="Your message"
          hint="Keep passwords, identity documents, and ballot selections out of your message."
        >
          <textarea
            name="message"
            minLength={20}
            maxLength={3000}
            required
            rows={6}
          />
        </Field>
        <label className="check-label">
          <input name="consent" type="checkbox" required />
          <span>
            I agree to the <Link to="/privacy">privacy notice</Link> for
            handling this request.
          </span>
        </label>
        <Captcha />
        <button className="btn">
          Send message <ArrowRight size={17} />
        </button>
      </ActionForm>
    </div>
  );
}
