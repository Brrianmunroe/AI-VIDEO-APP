import React, { useState } from 'react';
import './styles/TextInput.css';

/**
 * TextInput Component
 * 
 * Matches the Figma "Text Input" component (node 403:1908).
 * 5 states: default, hover, selected (active), disabled, focused.
 * 
 * @param {string} label - Optional label text shown above the input
 * @param {string} placeholder - Placeholder text
 * @param {string} value - Controlled value
 * @param {function} onChange - Change handler
 * @param {boolean} disabled - Disables the input
 * @param {string} className - Additional CSS classes
 */
function TextInput({
  label,
  placeholder = '',
  value,
  onChange,
  disabled = false,
  className = '',
  ...rest
}) {
  const [isFocused, setIsFocused] = useState(false);
  const id = React.useId();

  const wrapperClasses = [
    'text-input',
    isFocused ? 'text-input--focused' : '',
    disabled ? 'text-input--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses}>
      {label && <label className="text-input__label" htmlFor={id}>{label}</label>}
      <input
        id={id}
        className="text-input__field"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...rest}
      />
    </div>
  );
}

export default TextInput;
