
"use client";

import { useEffect, useState } from "react";
import "./BaraMascot.css";

type PartProps = {
  src: string;
  className: string;
};

function AutoCrop({ src, className }: PartProps) {
  const [image, setImage] = useState("");

  useEffect(() => {
    let active = true;
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) return;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      const pixels = ctx.getImageData(
        0, 0, canvas.width, canvas.height
      ).data;

      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = pixels[(y * canvas.width + x) * 4 + 3];

          if (alpha > 12) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        if (active) setImage(src);
        return;
      }

      const padding = Math.max(
        2,
        Math.round(Math.max(canvas.width, canvas.height) * 0.008)
      );

      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width - 1, maxX + padding);
      maxY = Math.min(canvas.height - 1, maxY + padding);

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;

      const cropped = document.createElement("canvas");
      cropped.width = width;
      cropped.height = height;

      const croppedCtx = cropped.getContext("2d");

      if (!croppedCtx) return;

      croppedCtx.drawImage(
        canvas,
        minX, minY, width, height,
        0, 0, width, height
      );

      if (active) setImage(cropped.toDataURL("image/png"));
    };

    img.onerror = () => {
      if (active) setImage(src);
    };

    img.src = src;

    return () => {
      active = false;
    };
  }, [src]);

  return (
    <img
      src={image || src}
      className={className}
      alt=""
      draggable={false}
    />
  );
}

export default function BaraMascot() {
  return (
    <div className="bara-character">
      <AutoCrop
        src="/mascot/kakikiri.png"
        className="bara-part leg-left"
      />

      <AutoCrop
        src="/mascot/kakikanan.png"
        className="bara-part leg-right"
      />

      <AutoCrop
        src="/mascot/badan.png"
        className="bara-part body"
      />

      <AutoCrop
        src="/mascot/tangankiri.png"
        className="bara-part arm-left"
      />

      <AutoCrop
        src="/mascot/tangankanan.png"
        className="bara-part arm-right"
      />

      <AutoCrop
        src="/mascot/kepala.png"
        className="bara-part head"
      />
    </div>
  );
      }
