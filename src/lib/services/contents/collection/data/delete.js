import { get } from 'svelte/store';

import { allAssets } from '$lib/services/assets';
import { saveChanges } from '$lib/services/backends/save';
import { allEntries } from '$lib/services/contents';
import { selectedCollection } from '$lib/services/contents/collection';
import {
  contentUpdatesToast,
  UPDATE_TOAST_DEFAULT_STATE,
} from '$lib/services/contents/collection/data';

/**
 * @import { FileChange } from '$lib/types/private';
 */

/**
 * Update the stores after deleting entries.
 * @param {object} args Arguments.
 * @param {string[]} args.ids List of entry IDs.
 * @param {string[]} args.assetPaths List of associated asset paths.
 */
export const updateStores = ({ ids, assetPaths }) => {
  const _allEntries = get(allEntries);

  allEntries.set(_allEntries.filter((file) => !ids.includes(file.id)));

  contentUpdatesToast.set({
    ...UPDATE_TOAST_DEFAULT_STATE,
    deleted: true,
    count: ids.length,
  });

  if (assetPaths.length) {
    allAssets.update((assets) => assets.filter((asset) => !assetPaths.includes(asset.path)));
  }
};

/**
 * Delete entries by slugs.
 * @param {string[]} ids List of entry IDs.
 * @param {string[]} [assetPaths] List of associated asset paths.
 */
export const deleteEntries = async (ids, assetPaths = []) => {
  const _allEntries = get(allEntries);

  const changes = /** @type {FileChange[]} */ (
    ids
      .map((id) => {
        const { locales, slug } = _allEntries.find((e) => e.id === id) ?? {};

        if (locales) {
          return Object.values(locales).map(
            ({ path }) => /** @type {FileChange} */ ({ action: 'delete', slug, path }),
          );
        }

        return undefined;
      })
      .flat(1)
      // Remove duplicate paths for single file i18n
      .filter((item, index, arr) => item && arr.findIndex((i) => i?.path === item.path) === index)
  );

  if (assetPaths.length) {
    changes.push(
      ...assetPaths.map((path) => /** @type {FileChange} */ ({ action: 'delete', path })),
    );
  }

  await saveChanges({
    changes,
    options: {
      commitType: 'delete',
      collection: get(selectedCollection),
    },
  });

  updateStores({ ids, assetPaths });
};
