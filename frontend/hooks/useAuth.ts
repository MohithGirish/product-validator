// FIX: Removed unused imports that were causing an error.
// This is a re-export for convenience, but the primary definition is in AuthContext.
// This allows for a cleaner import path: `import { useAuth } from '../hooks/useAuth';`
export { useAuth } from '../context/AuthContext';
