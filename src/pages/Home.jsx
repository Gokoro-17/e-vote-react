import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";
import { useLoad } from "../components.jsx";
import VotingScene from "../components/VotingScene.jsx";

const voterSteps = [
  "Open the election link",
  "Sign in and confirm you are eligible",
  "Choose, review, and submit your vote",
];
const organizerSteps = [
  "Create your organization",
  "Add the election, positions, and candidates",
  "Share the link and open voting",
];
const faq = [
  [
    "Do voters need an account?",
    "Yes. An account helps the organizer confirm access and prevents the same account from voting twice where one vote is allowed.",
  ],
  [
    "Can an organizer see who I voted for?",
    "No. Participation records and ballot choices are stored separately. Organizers see participation and permitted totals, not individual choices.",
  ],
  [
    "How many voters can I have?",
    "The free plan supports up to 50 registered voters per election. Paid plans support 100, 1,000, or unlimited voters.",
  ],
];

export default function Home() {
  const { data: stats } = useLoad("/public/stats"),
    events = useLoad("/elections?status=VOTING_OPEN");
  return (
    <>
      <section className="hero simple-hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="tiny-dot" /> SIMPLE ONLINE VOTING
          </div>
          <h1>
            Secure voting.
            <br />
            <span className="serif">Easy for everyone.</span>
          </h1>
          <p className="sub">
            Vote in an election or create one for your school, organization,
            community, company, or event.
          </p>
          <div className="row hero-actions">
            <Link className="btn" to="/elections">
              Find an election <ArrowRight size={18} />
            </Link>
            <Link className="btn alt" to="/workspace">
              Create an election <ArrowUpRight size={18} />
            </Link>
          </div>
          <p className="hero-help">
            Already have an invitation? Open the link your organizer sent you.
          </p>
        </div>
        <VotingScene />
      </section>

      <section className="journey-section" aria-labelledby="journey-title">
        <div className="simple-heading">
          <span className="eyebrow">START HERE</span>
          <h2 id="journey-title">What do you want to do?</h2>
        </div>
        <div className="journey-grid">
          <article className="journey-card">
            <span className="journey-icon">
              <Vote size={25} />
            </span>
            <div>
              <span className="eyebrow">FOR VOTERS</span>
              <h3>I want to vote</h3>
              <ol>
                {voterSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <Link className="btn" to="/elections">
                Find my election <ArrowRight size={16} />
              </Link>
            </div>
          </article>
          <article className="journey-card">
            <span className="journey-icon">
              <Users size={25} />
            </span>
            <div>
              <span className="eyebrow">FOR ORGANIZERS</span>
              <h3>I want to organize</h3>
              <ol>
                {organizerSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <Link className="btn alt" to="/workspace">
                Start an election <ArrowUpRight size={16} />
              </Link>
            </div>
          </article>
        </div>
      </section>

      {events.data?.length > 0 && (
        <section className="s compact-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">OPEN NOW</span>
              <h2>Current elections</h2>
            </div>
            <Link to="/elections" className="text-link">
              See all <ArrowRight size={17} />
            </Link>
          </div>
          <div className="event-rows">
            {events.data.slice(0, 3).map((election) => (
              <Link key={election.id} to={"/elections/" + election.slug}>
                <div>
                  <small className="eyebrow">
                    {election.organization.name}
                  </small>
                  <h3>{election.name}</h3>
                </div>
                <span>
                  View <ArrowUpRight size={18} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="simple-trust s" aria-labelledby="trust-title">
        <div>
          <span className="eyebrow">BUILT FOR TRUST</span>
          <h2 id="trust-title">Your vote stays private.</h2>
          <p className="muted">
            E-Vote checks whether you can participate without attaching your
            identity to your ballot choice.
          </p>
          <Link className="text-link" to="/security">
            Read how it works <ArrowRight size={16} />
          </Link>
        </div>
        <div className="trust-points">
          <p>
            <ShieldCheck size={20} /> Eligibility checked before voting
          </p>
          <p>
            <LockKeyhole size={20} /> Ballots stored separately from voters
          </p>
          <p>
            <CheckCircle2 size={20} /> Private confirmation after submission
          </p>
        </div>
      </section>

      <section className="simple-plan s">
        <div>
          <span className="eyebrow">SIMPLE PRICING</span>
          <h2>Start free with 50 voters.</h2>
          <p className="muted">
            Upgrade only when your election needs more capacity.
          </p>
        </div>
        <Link className="btn alt" to="/pricing">
          See plans <ArrowRight size={16} />
        </Link>
      </section>

      {stats && (
        <section
          className="platform-statistics simple-statistics"
          aria-label="Current platform activity"
        >
          {[
            ["Organizations", stats.organizations],
            ["Public elections", stats.publishedElections],
            ["Recorded ballots", stats.publicBallots],
          ].map(([label, number]) => (
            <div key={label}>
              <strong>{number.toLocaleString()}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
      )}

      <section className="s simple-faq">
        <div className="simple-heading">
          <span className="eyebrow">QUICK ANSWERS</span>
          <h2>Before you begin</h2>
        </div>
        <div>
          {faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="simple-cta">
        <div>
          <Link2 size={26} />
          <h2>Ready to get started?</h2>
          <p>Choose the path that matches what you came here to do.</p>
        </div>
        <div className="row">
          <Link className="btn light-btn" to="/elections">
            Vote now
          </Link>
          <Link className="btn simple-dark-btn" to="/workspace">
            Organize an election
          </Link>
        </div>
      </section>
    </>
  );
}
