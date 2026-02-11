import React from 'react';
import Button from './Button';

function GenerateSelectsButton({ onClick, disabled = false }) {
  return (
    <Button
      variant="primary"
      onClick={onClick}
      disabled={disabled}
    >
      Generate Selects
    </Button>
  );
}

export default GenerateSelectsButton;
