#!/usr/bin/env node

/**
 * Convert design tokens from $value + aliasData to $ref format
 * 
 * This script converts tokens that reference the Brand collection
 * to use direct $ref references instead of storing resolved values.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const designSystemPath = path.join(__dirname, '../design-system.json');

// Read the design system file
const designSystem = JSON.parse(fs.readFileSync(designSystemPath, 'utf8'));

let convertedCount = 0;

/**
 * Recursively process tokens and convert those with Brand collection references
 */
function convertTokens(obj, path = '') {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  // Check if this is a token object with aliasData pointing to Brand collection
  if (
    obj.$extensions?.['com.figma.aliasData']?.targetVariableSetName === 'Brand' &&
    obj.$extensions?.['com.figma.aliasData']?.targetVariableName
  ) {
    const aliasData = obj.$extensions['com.figma.aliasData'];
    const targetName = aliasData.targetVariableName;
    
    // Convert "scale/2500 (96)" to "#/scale/2500 (96)"
    const refPath = `#/${targetName}`;
    
    // Create new token structure with $ref
    const newToken = {
      $ref: refPath,
      $extensions: {
        'com.figma.variableId': obj.$extensions['com.figma.variableId'],
      }
    };
    
    // Preserve scopes if they exist
    if (obj.$extensions['com.figma.scopes']) {
      newToken.$extensions['com.figma.scopes'] = obj.$extensions['com.figma.scopes'];
    }
    
    // Replace the old token structure
    Object.keys(obj).forEach(key => {
      if (key !== '$extensions') {
        delete obj[key];
      }
    });
    
    Object.assign(obj, newToken);
    
    convertedCount++;
    console.log(`Converted: ${path} → ${refPath}`);
  }
  
  // Recursively process nested objects
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      convertTokens(obj[key], path ? `${path}.${key}` : key);
    }
  }
}

// Convert all tokens
console.log('Starting token conversion...\n');
convertTokens(designSystem);

// Write the updated design system
fs.writeFileSync(
  designSystemPath,
  JSON.stringify(designSystem, null, 2),
  'utf8'
);

console.log(`\n✅ Conversion complete! Converted ${convertedCount} tokens.`);
