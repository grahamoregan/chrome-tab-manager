import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Tab Sort',
  description: pkg.description,
  version: pkg.version,
  icons: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  action: { default_title: 'Open Tab Sort' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['tabs', 'tabGroups', 'storage', 'unlimitedStorage', 'contextMenus', 'favicon'],
  host_permissions: ['<all_urls>'],
  incognito: 'not_allowed',
  commands: {
    'open-manager': {
      suggested_key: { default: 'Alt+Shift+T' },
      description: 'Open the Tab Sort manager',
    },
  },
});
