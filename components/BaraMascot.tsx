
"use client";

import "./BaraMascot.css";

export default function BaraMascot() {
  return (
    <div className="bara-mascot">

      {/* KAKI */}
      <img
        src="/mascot/kakikiri.png"
        className="bara-part bara-kakikiri"
        alt=""
      />

      <img
        src="/mascot/kakikanan.png"
        className="bara-part bara-kakikanan"
        alt=""
      />

      {/* BADAN */}
      <img
        src="/mascot/badan.png"
        className="bara-part bara-badan"
        alt=""
      />

      {/* TANGAN */}
      <img
        src="/mascot/tangankiri.png"
        className="bara-part bara-tangankiri"
        alt=""
      />

      <img
        src="/mascot/tangankanan.png"
        className="bara-part bara-tangankanan"
        alt=""
      />

      {/* KEPALA + MUKA */}
      <img
        src="/mascot/kepala.png"
        className="bara-part bara-kepala"
        alt="Bara angry mascot"
      />

    </div>
  );
}
