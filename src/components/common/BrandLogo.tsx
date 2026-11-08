import React from 'react';
import logo128 from '../../assets/brand/logo-128.png';
import logo256 from '../../assets/brand/logo-256.png';
import logo512 from '../../assets/brand/logo-512.png';

interface BrandLogoProps {
  /** Rendered width and height in CSS pixels. */
  size?: number;
  className?: string;
}

// The official Global Chinar badge. Never redraw or recolour it; only change `size`.
// An asset at least 2x the display size is chosen so it stays sharp on high-density screens.
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 44, className = '' }) => {
  const src = size * 2 <= 128 ? logo128 : size * 2 <= 256 ? logo256 : logo512;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="Global Chinar Digital Marketing School logo"
      draggable={false}
      decoding="async"
      className={`select-none object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
