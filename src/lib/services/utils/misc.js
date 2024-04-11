/**
 * Check if the given input is a simple object.
 * @param {any} input - Input, probably an object.
 * @returns {boolean} Result.
 */
export const isObject = (input) =>
  input !== null && typeof input === 'object' && !Array.isArray(input);

/**
 * Check if the given input is an array of objects.
 * @param {any} input - Input, probably an array.
 * @returns {boolean} Result.
 */
export const isObjectArray = (input) =>
  Array.isArray(input) && /** @type {any[]} */ (input).every((item) => isObject(item));

/**
 * Return a simple `Promise` to resolve in the given time, making it easier to wait for a bit in the
 * code, particularly while making sequential HTTP requests.
 * @param {number} [ms] - Milliseconds to wait.
 * @returns {Promise<void>} Nothing.
 */
export const sleep = (ms = 1000) =>
  new Promise((resolve) => {
    window.setTimeout(() => {
      resolve();
    }, ms);
  });

/**
 * Wait until the given element enters the viewport.
 * @param {HTMLElement} element - Element to observe.
 * @returns {Promise<void>} Nothing.
 */
export const waitForVisibility = (element) =>
  new Promise((resolve) => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        resolve(undefined);
      }
    });

    window.requestAnimationFrame(() => {
      observer.observe(element);
    });
  });
