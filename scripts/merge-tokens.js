import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read all three token files
const mode1Tokens = JSON.parse(
  readFileSync(join(rootDir, 'Mode 1.tokens.json'), 'utf-8')
);
const colorTokens = JSON.parse(
  readFileSync(join(rootDir, 'Color.tokens.json'), 'utf-8')
);
const valueTokens = JSON.parse(
  readFileSync(join(rootDir, 'Value.tokens.json'), 'utf-8')
);

// Start with the current design-system.json as base
const currentDesignSystem = JSON.parse(
  readFileSync(join(rootDir, 'design-system.json'), 'utf-8')
);

// Create merged design system
const merged = {
  // Base colors from Value.tokens.json (keep existing structure)
  color: {
    ...currentDesignSystem.color,
    // Add semantic color scales from Color.tokens.json
    primary: colorTokens.color.primary,
    info: colorTokens.color.info,
    warning: colorTokens.color.warning,
    error: colorTokens.color.error,
    neutral: colorTokens.color.neutral,
    success: colorTokens.color.success,
  },
  
  // Font tokens - merge from both Color.tokens.json and current
  font: {
    'font-style': {
      ...currentDesignSystem.font['font-style'],
      // Keep existing semantic names (headings, body, etc.)
    },
    'font-weight': {
      ...currentDesignSystem.font['font-weight'],
    },
    'font-size': {
      ...currentDesignSystem.font['font-size'],
    },
    'line-height': {
      ...currentDesignSystem.font['line-height'],
    },
  },
  
  // Spacing - merge from Color.tokens.json (adds xxs)
  spacing: {
    ...colorTokens.spacing,
  },
  
  // Border radius - from Color.tokens.json
  'border-radius': {
    ...colorTokens['border-radius'],
  },
  
  // Stroke width - from Color.tokens.json
  'stroke-width': {
    ...colorTokens['stroke-width'],
  },
  
  // Scale - from Value.tokens.json
  scale: {
    ...valueTokens.scale,
  },
  
  // Icon size - from Color.tokens.json (NEW)
  'icon size': {
    ...colorTokens['icon size'],
  },
  
  // Semantic tokens from Mode 1.tokens.json
  text: {
    ...mode1Tokens.text,
  },
  
  surface: {
    ...mode1Tokens.surface,
  },
  
  icon: {
    ...mode1Tokens.icon,
  },
  
  border: {
    ...mode1Tokens.border,
  },
};

// Write merged design system
writeFileSync(
  join(rootDir, 'design-system.json'),
  JSON.stringify(merged, null, 2),
  'utf-8'
);

console.log('✅ Successfully merged all token files into design-system.json');
console.log('📦 Merged from:');
console.log('   - Mode 1.tokens.json (semantic tokens)');
console.log('   - Color.tokens.json (semantic colors, spacing, typography)');
console.log('   - Value.tokens.json (base colors, scale)');
