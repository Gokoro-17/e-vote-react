import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Fingerprint,
  LockKeyhole,
  FileCheck2,
  Users,
  GraduationCap,
  Trophy,
  Building2,
} from "lucide-react";
import { useLoad } from "../components.jsx";
import VotingScene from "../components/VotingScene.jsx";
const steps = [
  [
    "Create your election",
    "Set the schedule, add candidates, and choose the rules that fit your community.",
  ],
  [
    "Bring your people in",
    "Invite eligible voters with a private link, or share your public page and QR code.",
  ],
  [
    "Make every voice count",
    "Voters review their ballot, confirm their choice, and receive a private receipt.",
  ],
  [
    "Share the decision",
    "Close voting, review participation, and publish results when you’re ready.",
  ],
];
const faq = [
  [
    "Who can use E-Vote?",
    "Schools, associations, clubs, companies, communities, and event organizers can create voting events and manage their own eligibility rules.",
  ],
  [
    "Can I change a submitted vote?",
    "Submitted ballots are final. You can review and edit your selection before confirming it.",
  ],
  [
    "Can an organizer see my choices?",
    "Organizer dashboards show eligibility, participation, and permitted aggregate results. They do not show individual ballots. Ballot records carry no voter identifier.",
  ],
  [
    "When are results published?",
    "Organizers choose hidden, live, or scheduled results. Formal-election demonstrations use hidden or delayed results.",
  ],
];
export default function Home() {
  const { data: stats } = useLoad("/public/stats"),
    events = useLoad("/elections?status=VOTING_OPEN");
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="tiny-dot" /> THE VOTING WORKSPACE FOR YOUR
            COMMUNITY
          </div>
          <h1>
            Secure Voting.
            <br />
            <span className="serif">
              Built for Every
              <br className="hero-break" /> Election.
            </span>
          </h1>
          <p className="sub">
            Create, manage, and participate in secure digital voting events for
            organizations, competitions, schools, communities, and more.
          </p>
          <div className="row hero-actions">
            <Link className="btn" to="/workspace/elections">
              Create an Election <ArrowUpRight size={18} />
            </Link>
            <Link className="btn alt" to="/elections">
              Vote Now <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-trust">
            <ShieldCheck size={19} />
            <span>Private ballots. Verified access. Clear outcomes.</span>
          </div>
        </div>
        <VotingScene />
      </section>
      <div className="use-strip">
        <span>
          FOR THE PEOPLE
          <br />
          WHO BRING PEOPLE TOGETHER
        </span>
        <b>
          <GraduationCap size={21} /> Schools
        </b>
        <b>
          <Users size={21} /> Associations
        </b>
        <b>
          <Trophy size={21} /> Awards
        </b>
        <b>
          <Building2 size={21} /> Companies
        </b>
      </div>
      <section className="s how-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              FROM FIRST INVITATION TO FINAL COUNT
            </span>
            <h2>
              Less administration.
              <br />
              <span className="serif">More participation.</span>
            </h2>
          </div>
          <p className="muted">
            Everything your organization needs to move a decision forward, in
            one considered workflow.
          </p>
        </div>
        <div className="steps-grid">
          {steps.map(([title, detail], i) => (
            <article className="step" key={title}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="security-feature s">
        <div>
          <span className="eyebrow">TRUST STARTS WITH THE DETAILS</span>
          <h2>
            A private choice.
            <br />
            <span className="serif">A transparent process.</span>
          </h2>
          <p>
            Participation and ballot choices are stored separately. Access is
            checked on the server, submissions are recorded in a transaction,
            and administrative actions leave an audit trail.
          </p>
          <Link className="text-link" to="/security">
            See how we protect the process <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="security-lines">
          {[
            [
              Fingerprint,
              "Eligibility before participation",
              "Your organization verifies who can take part.",
            ],
            [
              LockKeyhole,
              "Encrypted, separate ballots",
              "A ballot carries no account or receipt reference.",
            ],
            [
              FileCheck2,
              "Receipts without selections",
              "Confirm that you participated while keeping your choice private.",
            ],
          ].map(([Icon, title, detail]) => (
            <div className="security-line" key={title}>
              <Icon size={24} />
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="s">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ONE WORKSPACE. MANY COMMUNITIES.</span>
            <h2>Make it your election.</h2>
          </div>
          <Link className="text-link" to="/organizations">
            Explore organizations <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="use-case-grid">
          {[
            [
              GraduationCap,
              "Student leadership",
              "Elect your next student union, class representative, or school council.",
              "Schools & institutions",
            ],
            [
              Users,
              "Community decisions",
              "Bring members into the decisions that shape your association or club.",
              "Associations & communities",
            ],
            [
              Trophy,
              "People’s choice",
              "Organize award categories, competitions, fan voting, and event polls.",
              "Awards & events",
            ],
          ].map(([Icon, title, text, label]) => (
            <article className="use-case" key={title}>
              <Icon size={32} strokeWidth={1.4} />
              <span className="eyebrow">{label}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      {stats && (
        <section
          className="platform-statistics"
          aria-label="Actual platform statistics"
        >
          {[
            ["Organizations", stats.organizations],
            ["Published public elections", stats.publishedElections],
            ["Ballots in published public elections", stats.publicBallots],
          ].map(([label, n]) => (
            <div key={label}>
              <strong>{n.toLocaleString()}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
      )}
      {events.data?.length > 0 && (
        <section className="s">
          <div className="section-heading">
            <div>
              <span className="eyebrow">HAPPENING NOW</span>
              <h2>Open for your voice.</h2>
            </div>
            <Link to="/elections" className="text-link">
              All elections <ArrowRight size={17} />
            </Link>
          </div>
          <div className="event-rows">
            {events.data.slice(0, 3).map((e) => (
              <Link key={e.id} to={"/elections/" + e.slug}>
                <div>
                  <small className="eyebrow">{e.organization.name}</small>
                  <h3>{e.name}</h3>
                </div>
                <span>
                  View election <ArrowUpRight size={18} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="s faq-section">
        <div>
          <span className="eyebrow">A LITTLE CLARITY</span>
          <h2>
            Good questions.
            <br />
            <span className="serif">Straight answers.</span>
          </h2>
          <Link className="text-link" to="/faq">
            Visit the help centre <ArrowRight size={17} />
          </Link>
        </div>
        <div>
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="plan-teaser">
        <div>
          <span className="eyebrow">START SMALL. MAKE ROOM.</span>
          <h2>
            50 voters, free.
            <br />
            <span className="serif">More voices when you need them.</span>
          </h2>
        </div>
        <div>
          <p>
            Plans for 100, 1,000, or unlimited voters per election. One
            subscription for your organization. The same care for every ballot.
          </p>
          <Link className="btn alt" to="/pricing">
            Find your plan <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="contact-cta">
        <div>
          <span className="eyebrow">YOUR NEXT DECISION STARTS HERE</span>
          <h2>
            Bring everyone
            <br />
            <span className="serif">into the conversation.</span>
          </h2>
        </div>
        <div>
          <p>
            Create a home for your organization’s elections. Give your people a
            clear, simple way to take part.
          </p>
          <Link className="btn light-btn" to="/register">
            Start your workspace <ArrowUpRight size={18} />
          </Link>
          <Link className="cta-contact" to="/contact">
            Talk to the team <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
