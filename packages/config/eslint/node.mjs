// ESLint preset for Node runtimes (apps/api, tooling scripts).
import globals from 'globals';
import base from './base.mjs';

export default [...base, { languageOptions: { globals: { ...globals.node } } }];
