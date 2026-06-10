interface AnimatedBackgroundProps {
  className?: string;
}

export function AnimatedBackground({ className = '' }: AnimatedBackgroundProps) {
  return (
    <div className={`animated-bg ${className}`} aria-hidden="true">
      <svg className="animated-bg-svg" viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="bg-dot-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.25" className="bg-grid-dot" />
          </pattern>
        </defs>

        <g className="bg-flow-field" fill="none" strokeLinecap="round">
          <path className="bg-flow bg-flow-a" d="M-80 110 C 140 60, 310 170, 500 120 S 880 40, 1090 120 S 1380 220, 1520 130" />
          <path className="bg-flow bg-flow-b" d="M-100 210 C 150 290, 330 130, 560 220 S 920 330, 1160 210 S 1410 80, 1540 220" />
          <path className="bg-flow bg-flow-c" d="M-120 360 C 110 260, 330 430, 570 350 S 900 240, 1160 360 S 1420 520, 1560 360" />
          <path className="bg-flow bg-flow-d" d="M-90 510 C 160 610, 350 440, 590 520 S 940 650, 1190 510 S 1430 350, 1540 520" />
          <path className="bg-flow bg-flow-e" d="M-120 690 C 120 570, 360 760, 600 680 S 940 560, 1180 690 S 1430 850, 1560 700" />
          <path className="bg-flow bg-flow-f" d="M-70 830 C 180 910, 360 760, 610 840 S 970 940, 1210 830 S 1430 690, 1530 830" />
        </g>

        <rect className="bg-grid" width="1440" height="960" fill="url(#bg-dot-grid)" />

        <g className="bg-flow-lines" fill="none" strokeLinecap="round">
          <path className="bg-line bg-line-a" d="M-80 250 C 180 120, 330 390, 560 250 S 960 60, 1220 250 S 1510 410, 1600 210" />
          <path className="bg-line bg-line-b" d="M-120 560 C 130 690, 320 430, 560 570 S 960 780, 1220 560 S 1510 350, 1600 620" />
          <path className="bg-line bg-line-c" d="M130 100 C 320 250, 280 540, 510 640 S 980 620, 1060 820" />
          <path className="bg-line bg-line-d" d="M1180 80 C 1020 230, 1110 430, 910 520 S 520 610, 420 880" />
        </g>

        <g className="bg-rings" fill="none">
          <circle className="bg-ring bg-ring-a" cx="330" cy="680" r="76" />
          <circle className="bg-ring bg-ring-b" cx="1110" cy="690" r="108" />
          <circle className="bg-ring bg-ring-c" cx="910" cy="210" r="64" />
        </g>

        <g className="bg-dots">
          {[
            [150, 350], [260, 450], [390, 330], [540, 430], [690, 320], [820, 440],
            [980, 340], [1120, 450], [1260, 330], [210, 730], [470, 760], [740, 690],
            [990, 780], [1240, 720], [1160, 130], [620, 160], [320, 160],
          ].map(([cx, cy], index) => (
            <circle
              key={`${cx}-${cy}`}
              className={`bg-dot bg-dot-${index % 4}`}
              cx={cx}
              cy={cy}
              r={index % 3 === 0 ? 5 : 3.5}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
