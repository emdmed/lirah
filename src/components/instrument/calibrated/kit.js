// The calibrated kit, vendored from the calibrated skills
// (~/projects/calibrated/skills/calibrated-figures and calibrated-components).
// The scripts are classic IIFEs that build window.Calibrated; the order
// matters: figures, then recipes, then the custom elements.
import '@/vendor/calibrated/calibrated-figures.js';
import '@/vendor/calibrated/calibrated-recipes.js';
import '@/vendor/calibrated/calibrated-components.js';
import './recipes';
import '@/vendor/calibrated/calibrated-components.css';
import './calibrated.css';

export const Calibrated = window.Calibrated;
