import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withLight } from './vitest.shared.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// In the monorepo, run against the core client's source; in the published repo, the installed `referalli`.
const coreSource = here('../sdk-js/src/index.ts');

export default withLight({
  resolve: {
    alias: {
      // Native modules are mocked; tests never load React Native.
      'react-native': here('./test/mocks/react-native.ts'),
      react: here('./test/mocks/react.ts'),
      ...(existsSync(coreSource) ? { referalli: coreSource } : {}),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
