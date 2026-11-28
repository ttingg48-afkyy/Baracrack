
.bara-character {
  position: relative;
  width: 230px;
  height: 270px;
  flex: 0 0 230px;
  margin: auto;
  isolation: isolate;
  overflow: visible;
}

/* Semua PNG disesuaikan ke kotak masing-masing */
.bara-part {
  position: absolute;
  display: block;
  object-fit: contain;
  object-position: center;
  user-select: none;
  pointer-events: none;
  -webkit-user-drag: none;
}

/* KAKI: DIAM */
.bara-character .leg-left {
  width: 29%;
  height: 29%;
  left: 21%;
  bottom: 1%;
  z-index: 1;
}

.bara-character .leg-right {
  width: 29%;
  height: 29%;
  right: 21%;
  bottom: 1%;
  z-index: 1;
}

/* BADAN: NAIK TURUN HALUS */
.bara-character .body {
  width: 57%;
  height: 45%;
  left: 21.5%;
  top: 37%;
  z-index: 2;
  transform-origin: 50% 20%;
  animation: bara-body-breathe 2s ease-in-out infinite;
}

/* TANGAN KIRI: LAMBAI */
.bara-character .arm-left {
  width: 43%;
  height: 40%;
  left: -1%;
  top: 37%;
  z-index: 4;
  transform-origin: 88% 22%;
  animation: bara-left-wave 1.1s ease-in-out infinite;
}

/* TANGAN KANAN: GESTURE MENGEJEK */
.bara-character .arm-right {
  width: 43%;
  height: 40%;
  right: -1%;
  top: 37%;
  z-index: 4;
  transform-origin: 12% 22%;
  animation: bara-right-mock 1.25s ease-in-out infinite;
}

/* KEPALA: ANGGUK DAN SEDIKIT MENENGOK */
.bara-character .head {
  width: 61%;
  height: 39%;
  left: 19.5%;
  top: 1%;
  z-index: 5;
  transform-origin: 50% 88%;
  animation: bara-head-nod 2.4s ease-in-out infinite;
}

/* ANIMASI BADAN */
@keyframes bara-body-breathe {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4px) scale(1.015);
  }
}

/* ANIMASI KEPALA */
@keyframes bara-head-nod {
  0%, 100% {
    transform: rotate(-2deg) translateY(0);
  }
  35% {
    transform: rotate(2deg) translateY(-3px);
  }
  70% {
    transform: rotate(-1deg) translateY(1px);
  }
}

/* TANGAN KIRI */
@keyframes bara-left-wave {
  0%, 100% {
    transform: rotate(-9deg);
  }
  25% {
    transform: rotate(17deg);
  }
  50% {
    transform: rotate(-3deg);
  }
  75% {
    transform: rotate(19deg);
  }
}

/* TANGAN KANAN */
@keyframes bara-right-mock {
  0%, 100% {
    transform: rotate(5deg) translateY(0);
  }
  30% {
    transform: rotate(-12deg) translateY(-4px);
  }
  60% {
    transform: rotate(8deg) translateY(1px);
  }
}

/* NOTIFIKASI: JANGAN BIARKAN KARAKTER MENGECIL */
.portNotice .bara-character {
  flex-shrink: 0;
}

/* MOBILE */
@media (max-width: 480px) {
  .bara-character {
    width: 190px;
    height: 225px;
    flex-basis: 190px;
  }

  .portNotice > div:first-of-type {
    flex-direction: column !important;
    align-items: center !important;
    gap: 4px !important;
  }

  .portNotice .bara-character {
    margin: 0 auto 8px;
  }
}

/* HENTIKAN ANIMASI JIKA DIMINTA PENGATURAN PERANGKAT */
@media (prefers-reduced-motion: reduce) {
  .bara-part {
    animation: none !important;
  }
}
