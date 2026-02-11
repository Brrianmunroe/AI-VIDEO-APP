import React from 'react';
import './styles/Button.css';

/**
 * Button Component
 * 
 * Matches the Figma "Button" component (node 403:1874).
 * 3 variants x 5 states, all using design system tokens.
 * 
 * @param {string} variant - 'primary' | 'secondary' | 'ghost'
 * @param {boolean} disabled - Disables the button
 * @param {string} className - Additional CSS classes
 * @param {React.ReactNode} children - Button label
 * @param {function} onClick - Click handler
 */
function Button({
  children,
  variant = 'primary',
  disabled = false,
  className = '',
  onClick,
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    disabled ? 'btn--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
