import { useEffect, useState } from "react";
import { Pause, Play, ShieldCheck } from "lucide-react";

export default function VotingScene() {
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setPaused(preference.matches);
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  return (
    <div
      className={"hero-visual voting-visual" + (paused ? " scene-paused" : "")}
    >
      <div className="visual-top">
        <span>E-VOTE / A MOMENT THAT MATTERS</span>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>
      <svg
        className="voting-scene"
        viewBox="0 0 440 320"
        role="img"
        aria-labelledby="voting-scene-title voting-scene-desc"
      >
        <title id="voting-scene-title">
          Your vote, from screen to submission
        </title>
        <desc id="voting-scene-desc">
          An illustrated voter selects a choice on an electronic voting screen.
          Their ballot moves into a locked digital box, and a confirmation
          appears.
        </desc>
        <ellipse cx="218" cy="287" rx="181" ry="15" fill="#102b21" />
        <path
          d="M38 275V81M38 81H99M343 81H403V275"
          fill="none"
          stroke="#60846b"
          strokeWidth="1"
          opacity=".5"
        />
        <circle cx="98" cy="56" r="3" fill="#b9dc94" />
        <path
          d="M99 56H183M329 56H378"
          stroke="#60846b"
          strokeWidth="1"
          opacity=".6"
        />
        <text x="206" y="60" fill="#b1c7ba" fontSize="9" letterSpacing="2">
          YOUR DIGITAL BALLOT
        </text>

        {/* The voter, drawn as an original vector illustration. */}
        <path
          d="M79 206C71 231 66 253 63 281H87L101 232L116 281H142L127 207Z"
          fill="#102b21"
          stroke="#66846a"
          strokeWidth="1.5"
        />
        <path
          d="M61 278H88V287H50C50 281 54 278 61 278ZM117 278H141L151 287H114Z"
          fill="#d5a483"
        />
        <path
          d="M81 119C64 125 57 148 61 178L75 212H130L137 163C136 138 125 119 108 116Z"
          fill="#bfd0ab"
        />
        <path
          d="M94 108L92 122C103 132 114 125 116 118L113 100Z"
          fill="#ba805a"
        />
        <path
          d="M119 75C132 88 127 114 113 117C98 120 86 104 87 91C88 74 105 65 119 75Z"
          fill="#d5a483"
        />
        <path
          d="M84 97C76 73 93 61 109 66C124 60 136 75 128 92L120 87L117 77C107 81 98 81 93 83L92 101Z"
          fill="#102b21"
        />
        <circle cx="118" cy="94" r="1.7" fill="#102b21" />
        <path
          d="M116 105L121 104"
          stroke="#81543c"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M77 145L84 176L112 185"
          fill="none"
          stroke="#8faa8e"
          strokeWidth="17"
          strokeLinecap="round"
        />
        <path
          d="M112 185L126 183"
          stroke="#d5a483"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Electronic voting terminal. */}
        <path
          d="M169 243H244L257 278H156Z"
          fill="#133026"
          stroke="#6f987d"
          strokeWidth="1.5"
        />
        <path d="M180 226H233V245H180Z" fill="#355b43" />
        <rect
          x="151"
          y="97"
          width="118"
          height="134"
          rx="12"
          fill="#0b251b"
          stroke="#7fa58a"
          strokeWidth="1.5"
        />
        <rect x="159" y="107" width="102" height="114" rx="7" fill="#244732" />
        <circle cx="210" cy="102" r="1.5" fill="#b1c7ba" />
        <text x="171" y="125" fontSize="8" fill="#f1f4e9" letterSpacing="1">
          MAKE YOUR CHOICE
        </text>
        <rect x="169" y="137" width="82" height="23" rx="4" fill="#35543c" />
        <circle cx="180" cy="148" r="4" fill="none" stroke="#a6c19e" />
        <path
          d="M193 145H237M193 151H223"
          stroke="#90ac8a"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect
          className="scene-selection"
          x="169"
          y="164"
          width="82"
          height="23"
          rx="4"
          fill="#b9dc94"
        />
        <circle
          className="scene-option-detail"
          cx="180"
          cy="175"
          r="4"
          fill="none"
          stroke="#0b251b"
        />
        <circle
          className="scene-choice-dot"
          cx="180"
          cy="175"
          r="2"
          fill="#0b251b"
        />
        <path
          className="scene-option-detail"
          d="M193 172H237M193 178H225"
          stroke="#183d26"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect x="169" y="196" width="82" height="15" rx="4" fill="#b9dc94" />
        <text
          x="210"
          y="206"
          textAnchor="middle"
          fontSize="6.7"
          fontWeight="700"
          letterSpacing="1"
          fill="#0b251b"
        >
          CONFIRM VOTE
        </text>
        <g className="scene-voter-arm">
          <path
            d="M117 142L134 167L165 175"
            fill="none"
            stroke="#bfd0ab"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M165 175L177 175L183 173"
            fill="none"
            stroke="#d5a483"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </g>
        <circle
          className="scene-tap"
          cx="181"
          cy="175"
          r="11"
          fill="none"
          stroke="#f1f4e9"
          strokeWidth="1.5"
        />

        {/* The ballot travels without a voter identifier. */}
        <path
          d="M280 165H309V205H326"
          stroke="#81a588"
          strokeWidth="1.5"
          strokeDasharray="3 7"
          fill="none"
        />
        <g className="scene-ballot">
          <rect x="277" y="149" width="25" height="30" rx="3" fill="#f1f4e9" />
          <path
            d="M283 162L288 167L296 158"
            stroke="#183d26"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M282 173H297" stroke="#9caf96" strokeWidth="1" />
        </g>
        <path d="M301 215L341 198L386 217L346 235Z" fill="#b9dc94" />
        <path d="M301 215V259L346 280V235Z" fill="#7c995e" />
        <path d="M346 235L386 217V260L346 280Z" fill="#9dba78" />
        <path
          d="M324 214L348 223"
          stroke="#183d26"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <g
          transform="translate(358 239)"
          fill="none"
          stroke="#183d26"
          strokeWidth="1.6"
        >
          <rect y="6" width="13" height="11" rx="2" />
          <path d="M3 6V3C3-2 10-2 10 3V6" />
          <path d="M6.5 10V13" />
        </g>
        <g className="scene-receipt">
          <rect
            x="298"
            y="98"
            width="109"
            height="45"
            rx="8"
            fill="#163927"
            stroke="#81a88a"
          />
          <circle cx="315" cy="119" r="8" fill="#b9dc94" />
          <path
            d="M311 119L314 122L319 116"
            stroke="#0b251b"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x="329" y="117" fill="#f1f4e9" fontSize="8" fontWeight="600">
            Vote submitted
          </text>
          <text x="329" y="129" fill="#b1c7ba" fontSize="6.7">
            Your choice stays private.
          </text>
        </g>
      </svg>
      <div className="voting-scene-caption">
        <span className="visual-number">SELECT. CONFIRM. COUNT.</span>
        <h3>
          A small action.
          <br />
          <span className="serif">A shared future.</span>
        </h3>
        <p>
          From your screen to a private ballot.
          <br />
          Every step, thoughtfully considered.
        </p>
      </div>
      <div className="visual-bottom">
        <span>
          <ShieldCheck size={15} /> Built around your voice
        </span>
        <button
          className="scene-control"
          onClick={() => setPaused(!paused)}
          aria-label={
            paused ? "Play voting animation" : "Pause voting animation"
          }
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
      </div>
    </div>
  );
}
