import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import './styles/DropDown.css';

/**
 * DropDown Component
 * 
 * Matches the Figma "Drop Down" component (node 403:1920).
 * 5 states: default, hover, selected (open), disabled, focused.
 * Composes: TextInput-style trigger + chevron Icon + floating options list.
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
  const ref = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      {isOpen && (
        <ul className="dropdown__options" role="listbox">
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
      )}
    </div>
  );
}

export default DropDown;
