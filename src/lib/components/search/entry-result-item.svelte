<script>
  import { GridCell, GridRow, TruncatedText } from '@sveltia/ui';
  import { sleep } from '@sveltia/utils/misc';
  import { locale as appLocale } from 'svelte-i18n';

  import Image from '$lib/components/assets/shared/image.svelte';
  import { goto } from '$lib/services/app/navigation';
  import { getCollectionLabel } from '$lib/services/contents/collection';
  import {
    getCollectionFileLabel,
    getCollectionFilesByEntry,
  } from '$lib/services/contents/collection/files';
  import { getAssociatedCollections } from '$lib/services/contents/entry';
  import { getEntryThumbnail } from '$lib/services/contents/entry/assets';
  import { getEntrySummary } from '$lib/services/contents/entry/summary';
  import { DEFAULT_I18N_CONFIG } from '$lib/services/contents/i18n/config';

  /**
   * @import {
   * Entry,
   * EntryCollection,
   * InternalCollection,
   * InternalCollectionFile,
   * } from '$lib/types/private';
   */

  /**
   * @typedef {object} RowArgs
   * @property {InternalCollection} collection Collection.
   * @property {InternalCollectionFile} [collectionFile] Collection file. File/singleton collection
   * only.
   */

  /**
   * @typedef {object} Props
   * @property {Entry} entry Single entry.
   */

  /** @type {Props} */
  let {
    /* eslint-disable prefer-const */
    entry,
    /* eslint-enable prefer-const */
  } = $props();

  const { locales, subPath } = $derived(entry);
</script>

{#snippet resultRow(/** @type {RowArgs} */ { collection, collectionFile })}
  {@const { defaultLocale } = (collectionFile ?? collection)._i18n ?? DEFAULT_I18N_CONFIG}
  {@const { content } = locales[defaultLocale] ?? Object.values(locales)[0] ?? {}}
  {#if content}
    <GridRow
      onclick={() => {
        goto(`/collections/${collection.name}/entries/${collectionFile?.name || subPath}`, {
          transitionType: 'forwards',
        });
      }}
    >
      <GridCell class="image">
        {#if collection._type === 'entry'}
          {#await getEntryThumbnail(/** @type {EntryCollection} */ (collection), entry) then src}
            {#if src}
              <Image {src} variant="icon" cover />
            {/if}
          {/await}
        {/if}
      </GridCell>
      <GridCell class="collection">
        {#key $appLocale}
          {getCollectionLabel(collection)}
        {/key}
      </GridCell>
      <GridCell class="title">
        <div role="none" class="label">
          <TruncatedText lines={2}>
            {#if collectionFile}
              {getCollectionFileLabel(collectionFile)}
            {:else}
              {#key $appLocale}
                {@html getEntrySummary(collection, entry, {
                  useTemplate: true,
                  allowMarkdown: true,
                })}
              {/key}
            {/if}
          </TruncatedText>
        </div>
      </GridCell>
    </GridRow>
  {/if}
{/snippet}

{#each getAssociatedCollections(entry) as collection (collection.name)}
  {#await sleep() then}
    {#each getCollectionFilesByEntry(collection, entry) as collectionFile (collectionFile.name)}
      {#await sleep() then}
        {@render resultRow({ collection, collectionFile })}
      {/await}
    {:else}
      {@render resultRow({ collection })}
    {/each}
  {/await}
{/each}
