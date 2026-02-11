import React from 'react';
import Icon from './Icon';
import './styles/AddFootageCard.css';

function AddFootageCard({ onClick }) {
  return (
    <div className="add-footage-card" onClick={onClick} role="button" tabIndex={0}>
      <Icon type="add" size="md" state="primary" />
      <div className="add-label">Add Footage</div>
    </div>
  );
}

export default AddFootageCard;
