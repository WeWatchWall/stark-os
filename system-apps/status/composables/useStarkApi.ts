/**
 * Composable for accessing the Stark API in the Status app.
 *
 * createStarkAPI() picks up credentials from localStorage
 * and resolves the API URL from location.origin — no token relay needed.
 */

import { createStarkAPI, type StarkAPI } from '@stark-o/browser-runtime';

let _api: StarkAPI | null = null;

export function useStarkApi(): StarkAPI {
  if (!_api) {
    _api = createStarkAPI();
  }
  return _api;
}
