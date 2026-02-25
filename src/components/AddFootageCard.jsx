import React from 'react';
import Icon from './Icon';
import './styles/AddFootageCard.css';

function AddFootageCard({ onClick }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      className="add-footage-card"
      role="button"
      tabIndex={0}
      aria-label="Add footage"
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <Icon type="add" size="md" state="primary" />
      <div className="add-label">Add Footage</div>
    </div>
  );
}

export default AddFootageCard;
