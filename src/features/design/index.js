// Components
export { DesignButton } from './DesignButton';
export { DesignDialog } from './DesignDialog';

// Selection → prompt
export { ASK_ACTIONS, buildAskPrompt, filesOfSelection } from './designAsk';

// Hooks
export { useDesignExtraction } from './useDesignExtraction';

// Spec model
export { validateSpec, normalizeSpec, parseSpecJson, NODE_KINDS, NODE_STATUSES, NODE_CAP } from './spec';
