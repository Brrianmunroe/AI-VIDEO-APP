import React from 'react';
import iconPaths from './icons/iconPaths.jsx';
import './styles/Icon.css';

/**
 * Icon Component
 * 
 * Matches the Figma "Icon" component (node 403:715).
 * Renders inline SVG icons with design-token-based colors.
 * 
 * @param {string} type - Icon name (e.g., 'home', 'play', 'settings')
 * @param {string} state - 'primary' | 'secondary' | 'selected' | 'hover' | 'disabled'
 * @param {string} size - 'sm' (16px) | 'md' (24px) | 'lg' (44px)
 * @param {string} className - Additional CSS classes
 */
function Icon({
  type,
  state = 'primary',
  size = 'md',
  className = '',
  ...rest
}) {
  const path = iconPaths[type];

  if (!path) {
    console.warn(`Icon type "${type}" not found`);
    return null;
  }

  const classes = [
    'icon',
    `icon--${state}`,
    `icon--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );
}

export default Icon;
