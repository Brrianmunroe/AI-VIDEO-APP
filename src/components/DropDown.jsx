import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import './styles/DropDown.css';

/**
 * DropDown Component
 *
 * Matches the Figma "Drop Down" component (node 403:1920).
 * 5 states: default, hover, selected (open), disabled, focused.
 * Composes: TextInput-style trigger + chevron Icon + floating options list.
 * Options are rendered in a portal so they appear over modals and avoid overflow clipping.
 *
 * @param {string} label - Optional label text
 * @param {string} placeholder - Placeholder when nothing selected
 * @param {Array} options - Array of { value, label } objects
 * @param {string} value - Currently selected value
 * @param {function} onChange - Called with selected value
 * @param {boolean} disabled - Disables the dropdown
 * @param {string} className - Additional CSS classes
 */
function DropDown({
  label,
  placeholder = 'Default',
  options = [],
  value,
  onChange,
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [optionsStyle, setOptionsStyle] = useState({});
  const ref = useRef(null);
  const optionsRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const updateOptionsPosition = () => {
    if (!ref.current || !isOpen) return;
    const rect = ref.current.getBoundingClientRect();
    setOptionsStyle({
      position: 'fixed',
      top: rect.bottom,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (isOpen && ref.current) {
      updateOptionsPosition();
    }
  }, [isOpen]);

  // Close on outside click; account for portal (options may be outside ref)
  useEffect(() => {
    function handleClickOutside(e) {
      const inTrigger = ref.current?.contains(e.target);
      const inOptions = optionsRef.current?.contains(e.target);
      if (!inTrigger && !inOptions) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reposition on scroll/resize when open
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updateOptionsPosition, true);
    window.addEventListener('resize', updateOptionsPosition);
    return () => {
      window.removeEventListener('scroll', updateOptionsPosition, true);
      window.removeEventListener('resize', updateOptionsPosition);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled) setIsOpen((prev) => !prev);
  };

  const handleSelect = (optionValue) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const wrapperClasses = [
    'dropdown',
    isOpen ? 'dropdown--open' : '',
    disabled ? 'dropdown--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  const optionsEl = isOpen && (
    <ul
      ref={optionsRef}
      className="dropdown__options dropdown__options--portal"
      role="listbox"
      style={optionsStyle}
    >
      {options.map((option) => (
        <li
          key={option.value}
          className={`dropdown__option ${option.value === value ? 'dropdown__option--selected' : ''}`}
          onClick={() => handleSelect(option.value)}
          role="option"
          aria-selected={option.value === value}
        >
          {option.label}
        </li>
      ))}
    </ul>
  );

  return (
    <div className={wrapperClasses} ref={ref}>
      {label && <label className="dropdown__label">{label}</label>}
      <button
        className="dropdown__trigger"
        onClick={handleToggle}
        disabled={disabled}
        type="button"
        aria-expanded={isOpen}
      >
        <span className={`dropdown__value ${!selectedOption ? 'dropdown__value--placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon
          type="chevron-down"
          size="sm"
          state={disabled ? 'disabled' : 'secondary'}
          className={`dropdown__chevron ${isOpen ? 'dropdown__chevron--open' : ''}`}
        />
      </button>
      {optionsEl && createPortal(optionsEl, document.body)}
    </div>
  );
}

export default DropDown;
