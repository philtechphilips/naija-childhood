"use client";

import { useState, type CSSProperties } from "react";
import { photos, photoSrc, photoSrcSet, type PhotoName } from "@/lib/photos";
import styles from "./Photo.module.css";

/**
 * Responsive photo with a blurred inline placeholder, so cards never flash
 * empty on slow networks.
 */
export function Photo({
  name,
  alt,
  sizes = "100vw",
  priority = false,
  className,
  position,
  style,
}: {
  name: PhotoName;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  position?: string;
  style?: CSSProperties;
}) {
  const info = photos[name];
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`${styles.frame} ${className ?? ""}`} style={{ backgroundImage: `url(${info.blur})`, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc(name, 960)}
        srcSet={photoSrcSet(name)}
        sizes={sizes}
        alt={alt}
        width={info.width}
        height={info.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setLoaded(true);
        }}
        className={`${styles.img} ${loaded ? styles.loaded : ""}`}
        style={position ? { objectPosition: position } : undefined}
      />
    </div>
  );
}
