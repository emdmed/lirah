import { createContext } from 'react';

// Whether the enclosing tab is on screen (`visible`) and focused (`active`)
// as of this render. ProjectTab hands its contents both a frame late (see
// there); what has to change in the very frame that shows the tab reads this.
export const TabShownContext = createContext({ visible: true, active: true });
