
"use client";

import "./BaraMascot.css";

export default function BaraMascot() {
  return (
    <div className="bara-character">
      <img src="/mascot/kakikiri.png" className="bara-part leg-left" alt="" />
      <img src="/mascot/kakikanan.png" className="bara-part leg-right" alt="" />

      <img src="/mascot/badan.png" className="bara-part body" alt="" />

      <img src="/mascot/tangankiri.png" className="bara-part arm-left" alt="" />
      <img src="/mascot/tangankanan.png" className="bara-part arm-right" alt="" />

      <img src="/mascot/kepala.png" className="bara-part head" alt="Bara angry mascot" />
    </div>
  );
}
