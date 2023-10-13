import { _ } from 'svelte-i18n';
import { get, writable } from 'svelte/store';
import { backend, backendName } from '$lib/services/backends';
import { siteConfig } from '$lib/services/config';
import LocalStorage from '$lib/services/utils/local-storage';
import { isObject } from '$lib/services/utils/misc';

/**
 * @type {import('svelte/store').Writable<User?>}
 */
export const user = writable();

user.subscribe((_user) => {
  (async () => {
    try {
      if (_user) {
        await LocalStorage.set('sveltia-cms.user', _user);
      } else if (_user === null) {
        await LocalStorage.delete('sveltia-cms.user');
      }
    } catch {
      //
    }
  })();
});

/**
 * @type {import('svelte/store').Writable<string>}
 */
export const authError = writable('');

/**
 * @type {import('svelte/store').Writable<boolean>}
 */
export const unauthenticated = writable(false);

/**
 * Log an authentication error on the UI and in the browser console.
 * @param {Error} ex Exception.
 */
const logError = (ex) => {
  authError.set(/** @type {object} */ (ex.cause)?.message || get(_)('unexpected_error'));
  // eslint-disable-next-line no-console
  console.error(ex.message, ex.cause);
};

/**
 * Check if the user info is cached, set the backend, and automatically start loading files if the
 * backend is Git-based and user’s auth token is found.
 */
export const signInAutomatically = async () => {
  // Find cached user info, including a compatible Netlify/Decap CMS user object
  const userCache =
    (await LocalStorage.get('sveltia-cms.user')) ||
    (await LocalStorage.get('decap-cms-user')) ||
    (await LocalStorage.get('netlify-cms-user'));

  const _user = isObject(userCache) && !!userCache.backendName ? userCache : {};
  // Local editing needs a secure context, either `http://localhost` or `http://*.localhost`
  // https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
  const isLocal = !!window.location.hostname.match(/^(?:.+\.)?localhost$/);
  const { backendName: name = isLocal ? 'local' : get(siteConfig).backend?.name, token } = _user;

  backendName.set(name);

  // Don’t try to sign in automatically if the local backend is being used, because it requires user
  // interaction to acquire file/directory handles. Also, ignore the `proxy` backend that was set
  // when using the Netlify/Decap CMS local proxy server.
  if (['local', 'proxy'].includes(name)) {
    return;
  }

  // Use the cached user to start fetching files
  if (get(backend) && token && !get(unauthenticated)) {
    user.set(_user);

    try {
      await get(backend).fetchFiles();
    } catch (ex) {
      // The API request may fail if the cached token has been expired or revoked. Then let the user
      // sign in again
      if ([401, 403].includes(ex.cause?.status)) {
        unauthenticated.set(true);
      } else {
        logError(ex);
      }
    }
  }
};

/**
 * Sign in with the given backend.
 * @param {string} [savedToken] User’s auth token. Can be empty for the local backend or when a
 * token is not saved in the local storage.
 */
export const signInManually = async (savedToken = '') => {
  let _user;

  try {
    _user = await get(backend).signIn(savedToken);
  } catch (ex) {
    logError(ex);

    return;
  }

  user.set(_user);

  try {
    await get(backend).fetchFiles();
  } catch (ex) {
    logError(ex);
  }
};