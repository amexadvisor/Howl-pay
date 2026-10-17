import React from 'react';

export default function NightSky() {
  return (
    <div className="night-sky-bg">
      <div className="stars"></div>
      <div className="moon-glow"></div>
      <div className="wolf-art">
        <svg
          viewBox="0 0 800 400"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMax slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,400 L0,350 Q100,320 200,340 T400,280 Q450,260 480,210 Q485,190 495,195 Q500,185 510,180 C515,160 530,130 550,110 L545,100 C540,95 535,90 535,85 C550,80 560,85 570,95 C580,85 585,75 590,65 L595,70 C600,60 610,65 615,75 C625,90 620,110 615,130 Q630,150 640,180 Q660,240 700,280 T800,350 L800,400 Z"
            fill="#02040f"
          />
        </svg>
      </div>
    </div>
  );
}
