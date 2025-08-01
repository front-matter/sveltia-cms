<script>
  import { Button } from '@sveltia/ui';
  import { getPathInfo } from '@sveltia/utils/file';
  import { sleep } from '@sveltia/utils/misc';
  import mime from 'mime';
  import { _, locale as appLocale } from 'svelte-i18n';

  import AssetPreview from '$lib/components/assets/shared/asset-preview.svelte';
  import StaticMap from '$lib/components/common/static-map.svelte';
  import { goto } from '$lib/services/app/navigation';
  import { defaultAssetDetails, getAssetDetails } from '$lib/services/assets/info';
  import { isMediaKind } from '$lib/services/assets/kinds';
  import { getCollectionLabel } from '$lib/services/contents/collection';
  import {
    getCollectionFileLabel,
    getCollectionFilesByEntry,
  } from '$lib/services/contents/collection/files';
  import { getAssociatedCollections } from '$lib/services/contents/entry';
  import { getEntrySummary } from '$lib/services/contents/entry/summary';
  import { DATE_TIME_FORMAT_OPTIONS } from '$lib/services/utils/date';
  import { formatSize } from '$lib/services/utils/file';
  import { formatDuration } from '$lib/services/utils/media/video';

  /**
   * @import { Asset, AssetDetails } from '$lib/types/private';
   */

  /**
   * @typedef {object} Props
   * @property {Asset} asset Asset.
   * @property {boolean} [showPreview] Whether to show the media preview.
   */

  /** @type {Props} */
  let {
    /* eslint-disable prefer-const */
    asset,
    showPreview = false,
    /* eslint-enable prefer-const */
  } = $props();

  /** @type {AssetDetails} */
  let details = $state({ ...defaultAssetDetails });

  const { path, size, kind, commitAuthor, commitDate } = $derived(asset);
  const { publicURL, repoBlobURL, dimensions, duration, createdDate, coordinates, usedEntries } =
    $derived(details);
  const { extension = '' } = $derived(getPathInfo(path));
  const canPreview = $derived(isMediaKind(kind) || path.endsWith('.pdf'));

  /**
   * Format the date to a localized string.
   * @param {Date} date Date to format.
   * @returns {string} Formatted date string.
   */
  const formatDate = (date) =>
    date.toLocaleString($appLocale ?? undefined, DATE_TIME_FORMAT_OPTIONS);

  /**
   * Update the properties above.
   */
  const updateProps = async () => {
    details = asset ? await getAssetDetails(asset) : { ...defaultAssetDetails };
  };

  $effect(() => {
    void [asset];
    updateProps();
  });
</script>

{#snippet usedEntryLink(
  /** @type {Record<string, string>} */ { link, collectionLabel, entryLabel },
)}
  <p>
    <Button role="link" variant="link" onclick={() => goto(link, { transitionType: 'forwards' })}>
      <span role="none">{collectionLabel} › {entryLabel}</span>
    </Button>
  </p>
{/snippet}

<div role="none" class="detail">
  {#if showPreview && canPreview}
    <div role="none" class="preview">
      <AssetPreview
        {kind}
        {asset}
        variant="tile"
        checkerboard={kind === 'image'}
        controls={['audio', 'video'].includes(kind)}
      />
    </div>
  {/if}
  <section>
    <h4>{$_('kind')}</h4>
    <p>
      {$_(`file_type_labels.${extension}`, {
        default: mime.getType(path) ?? extension.toUpperCase(),
      })}
    </p>
  </section>
  <section>
    <h4>{$_('size')}</h4>
    <p>
      {#key $appLocale}
        {formatSize(size)}
      {/key}
    </p>
  </section>
  {#if canPreview}
    <section>
      <h4>{$_('dimensions')}</h4>
      <p>{dimensions ? `${dimensions.width}×${dimensions.height}` : '–'}</p>
    </section>
  {/if}
  {#if ['audio', 'video'].includes(kind)}
    <section>
      <h4>{$_('duration')}</h4>
      <p>{duration ? formatDuration(duration) : '–'}</p>
    </section>
  {/if}
  <section>
    <h4>{$_('public_url')}</h4>
    <p>
      {#if publicURL}
        <a href={publicURL} target="_blank">{publicURL}</a>
      {:else}
        –
      {/if}
    </p>
  </section>
  <section>
    <h4>{$_('file_path')}</h4>
    <p>
      {#if repoBlobURL}
        <a href={repoBlobURL}>/{path}</a>
      {:else}
        /{path}
      {/if}
    </p>
  </section>
  <section>
    <h4>{$_('used_in')}</h4>
    {#each usedEntries as entry (entry.id)}
      {#await sleep() then}
        {#each getAssociatedCollections(entry) as collection (collection.name)}
          {#key $appLocale}
            {@const collectionLabel = getCollectionLabel(collection)}
            {#each getCollectionFilesByEntry(collection, entry) as file (file.name)}
              {@render usedEntryLink({
                link: `/collections/${collection.name}/entries/${file.name}`,
                collectionLabel,
                entryLabel: getCollectionFileLabel(file),
              })}
            {:else}
              {@render usedEntryLink({
                link: `/collections/${collection.name}/entries/${entry.subPath}`,
                collectionLabel,
                entryLabel: getEntrySummary(collection, entry, { useTemplate: true }),
              })}
            {/each}
          {/key}
        {/each}
      {/await}
    {:else}
      <p>{$_('sort_keys.none')}</p>
    {/each}
  </section>
  {#if commitAuthor}
    <section>
      <h4>{$_('sort_keys.commit_author')}</h4>
      <p>{commitAuthor.name || commitAuthor.login || commitAuthor.email}</p>
    </section>
  {/if}
  {#if commitDate}
    <section>
      <h4>{$_('sort_keys.commit_date')}</h4>
      <p>{formatDate(commitDate)}</p>
    </section>
  {/if}
  {#if createdDate}
    <section>
      <h4>{$_('created_date')}</h4>
      <p>{formatDate(createdDate)}</p>
    </section>
  {/if}
  {#if coordinates}
    <section>
      <h4>{$_('location')}</h4>
      <StaticMap {coordinates} />
    </section>
  {/if}
</div>

<style lang="scss">
  .detail {
    flex: none;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 16px;
    width: 320px;

    .preview {
      overflow: hidden;
      margin: 0 0 16px;
      border-radius: var(--sui-control-large-border-radius);
      background-color: var(--sui-content-background-color);
      aspect-ratio: 1 / 1;
    }

    section {
      &:not(:last-child) {
        margin: 0 0 16px;
      }

      & > :global(*) {
        margin: 0 0 4px;
        word-break: break-all;
      }
    }

    h4 {
      font-size: var(--sui-font-size-small);
      font-weight: var(--sui-font-weight-bold);
      color: var(--sui-secondary-foreground-color);
    }
  }
</style>
