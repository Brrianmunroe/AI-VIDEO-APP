import React from 'react';
import Icon from './Icon';
import './styles/NavBarButton.css';

/**
 * NavBarButton Component
 * 
 * Matches the Figma "Nav Bar Buttons" component (node 403:2046).
 * Icon (md) + label stacked vertically, 56x60px.
 * 5 types: home, projects, search, footage, settings
 * 5 states: default, hover, selected, disabled, focused
 * 
 * @param {string} type - 'home' | 'projects' | 'search' | 'footage' | 'settings'
 * @param {string} label - Display label (defaults to capitalized type)
 * @param {boolean} active - Whether this button is the active/selected nav item
 * @param {boolean} disabled - Disables the button
 * @param {function} onClick - Click handler
 * @param {string} className - Additional CSS classes
 */
function NavBarButton({
  type,
  label,
  active = false,
  disabled = false,
  onClick,
  className = '',
}) {
  const displayLabel = label || type.charAt(0).toUpperCase() + type.slice(1);

  // Map component state to icon state (default = secondary fill)
  let iconState = 'secondary';
  if (active) iconState = 'selected';
  if (disabled) iconState = 'disabled';

  const classes = [
    'nav-btn',
    active ? 'nav-btn--active' : '',
    disabled ? 'nav-btn--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={disabled}
      type="button"
      title={displayLabel}
    >
      <Icon type={type} state={iconState} size="md" />
      <span className="nav-btn__label">{displayLabel}</span>
    </button>
  );
}

export default NavBarButton;
