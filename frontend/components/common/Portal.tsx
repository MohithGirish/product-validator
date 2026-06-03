import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into `document.body`, escaping any ancestor that establishes a
 * containing block for fixed elements (an ancestor with a `transform`/`filter`/
 * `animation` leaves `position: fixed` positioned relative to *it*, not the
 * viewport — which clips full-screen modals). All dialogs/overlays should be
 * wrapped in this so `fixed inset-0` always means the true viewport.
 */
const Portal: React.FC<{ children: ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

export default Portal;
