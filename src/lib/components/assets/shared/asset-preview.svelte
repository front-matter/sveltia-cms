<script>
  import { Icon } from '@sveltia/ui';
  import { waitForVisibility } from '@sveltia/utils/element';
  import { flushSync } from 'svelte';
  import { _ } from 'svelte-i18n';

  import { getAssetBlobURL, getAssetThumbnailURL } from '$lib/services/assets/info';

  /**
   * @import { Asset, AssetKind } from '$lib/types/private';
   */

  /**
   * @typedef {object} Props
   * @property {AssetKind} kind Asset type.
   * @property {'lazy' | 'eager'} [loading] Loading method.
   * @property {Asset} [asset] Asset.
   * @property {string} [src] Source URL.
   * @property {'tile' | 'icon'} [variant] Style variant.
   * @property {boolean} [blurBackground] Whether to show a blurred background (like Slack’s media
   * overlay).
   * @property {boolean} [cover] Whether to use `object-fit: cover`.
   * @property {boolean} [checkerboard] Whether to show a checkerboard background below a
   * transparent image.
   * @property {boolean} [dissolve] Whether to add a short dissolve transition (fade-in effect) to
   * the image/video when it’s first loaded to avoid a sudden appearance.
   * @property {string} [alt] Alt text for the image.
   * @property {boolean} [controls] Whether to show controls for audio/video. If this is `false` and
   * {@link kind} is `audio`, an icon will be displayed instead.
   */

  /** @type {Props & Record<string, any>} */
  let {
    /* eslint-disable prefer-const */
    kind,
    loading = 'lazy',
    asset = undefined,
    src = $bindable(undefined),
    variant = undefined,
    blurBackground = false,
    cover = false,
    checkerboard = false,
    dissolve = true,
    alt = '',
    controls = false,
    ...rest
    /* eslint-enable prefer-const */
  } = $props();

  /** @type {HTMLImageElement | HTMLMediaElement | undefined} */
  let mediaElement = $state();
  let hasError = $state(false);
  let loaded = $state(false);
  /** @type {string | undefined} */
  let blurImageURL = $state();

  const isThumbnail = $derived(!!asset && !!variant && !controls);
  const isImage = $derived(isThumbnail || kind === 'image' || asset?.name.endsWith('.pdf'));

  let updatingSrc = false;

  /**
   * Update the {@link src} property.
   */
  const updateSrc = async () => {
    if (!asset || !mediaElement || updatingSrc) {
      return;
    }

    updatingSrc = true;
    hasError = false;

    if (loading === 'lazy') {
      await waitForVisibility(mediaElement);
    }

    try {
      src = isThumbnail ? await getAssetThumbnailURL(asset) : await getAssetBlobURL(asset);
    } catch {
      hasError = true;
    }

    if (blurBackground && !blurImageURL && src) {
      blurImageURL = src;
    }

    updatingSrc = false;

    // For some reason this is required to update the `$effect` calling `checkLoaded()`, otherwise
    // navigating from `/assets` to `/assets/<collection>` on small screen leaves the preview empty
    flushSync();
  };

  /**
   * Update the {@link loaded} state when the media is loaded.
   */
  const checkLoaded = async () => {
    if (!mediaElement || !src) {
      return;
    }

    if (
      isImage
        ? !(/** @type {HTMLImageElement} */ (mediaElement).complete)
        : !(/** @type {HTMLMediaElement} */ (mediaElement).readyState)
    ) {
      // Not loaded yet; wait until it’s ready
      await new Promise((resolve) => {
        mediaElement?.addEventListener(
          isImage ? 'load' : 'loadedmetadata',
          () => {
            resolve(undefined);
          },
          { once: true },
        );
      });
    }

    // Enable a dissolve transition
    if (dissolve) {
      await waitForVisibility(mediaElement);
    }

    loaded = true;

    // Revoke the thumbnail blob URL
    if (asset && isThumbnail && src.startsWith('blob:')) {
      URL.revokeObjectURL(src);
    }
  };

  $effect(() => {
    if (asset && !blurImageURL) {
      (async () => {
        blurImageURL = await getAssetThumbnailURL(asset, { cacheOnly: true });
      })();
    }
  });

  $effect(() => {
    if (mediaElement && asset) {
      updateSrc();
    }
  });

  $effect(() => {
    if (mediaElement && src) {
      checkLoaded();
    }
  });
</script>

<div
  role="none"
  class="preview {variant}"
  class:cover
  class:checkerboard
  class:dissolve
  class:loaded
>
  {#if hasError}
    <Icon name="draft" />
  {:else if isImage}
    <img {loading} {src} {alt} {...rest} bind:this={mediaElement} />
  {:else if kind === 'video'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video {src} controls={controls || undefined} playsinline {...rest} bind:this={mediaElement}
    ></video>
  {:else if kind === 'audio'}
    {#if controls}
      <audio {src} controls playsinline {...rest} bind:this={mediaElement}></audio>
    {:else}
      <Icon name="audio_file" />
    {/if}
  {:else}
    <Icon name="draft" />
  {/if}
  {#if blurBackground}
    <div role="none" class="blur">
      <div role="status" class="overlay">
        {#if !isThumbnail && !loaded}
          {$_('loading')}
        {/if}
      </div>
      <img role="none" loading="lazy" src={blurImageURL} alt="" class:loaded={!!blurImageURL} />
    </div>
  {/if}
</div>

<style lang="scss">
  .preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 100%;
    height: 100%;

    &.tile {
      border-width: 1px;
      border-style: solid;
      border-color: transparent;
      padding: var(--tile-padding, 12px);

      :global(.sui.icon) {
        font-size: 48px;
      }
    }

    &.icon {
      border-radius: var(--sui-control-medium-border-radius);
      width: var(--icon-size, 32px);
      height: var(--icon-size, 32px);
    }

    &.tile,
    &.icon {
      overflow: hidden;
      aspect-ratio: 1 / 1;
    }

    .blur {
      display: contents;

      & > * {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .overlay {
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: -1;
        backdrop-filter: blur(32px) brightness(0.8);
      }

      img {
        width: 100%;
        height: 100%;
        z-index: -2;
        object-fit: cover;
        transform: scale(1.2);

        &.loaded {
          opacity: 1;
        }
      }
    }

    &.cover {
      padding: 0;

      & > :is(:global(img, video)) {
        flex: auto;
      }
    }

    & > :is(:global(img, video)) {
      flex: 0;
      max-width: 100%;
      max-height: 100%;
    }

    &.dissolve {
      :is(:global(img, video)) {
        opacity: 0;
        transition: opacity 250ms;
      }

      &.loaded {
        :is(:global(img, video)) {
          opacity: 1;
        }
      }
    }
  }

  img {
    /* prettier-ignore */
    .checkerboard & {
      // hardcoded, the same color as the checkerboard in Photoshop
      background-image:
        linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%),
        linear-gradient(45deg, #ccc 25%, #fff 25%, #fff 75%, #ccc 75%);
      background-size: 8px 8px;
      background-position: 0 0, 4px 4px;
    }

    :not(.checkerboard) & {
      // hardcoded, the same color as the transparent image preview in Chrome and Firefox
      background-color: #e5e5e5;
    }
  }

  :is(:global(img, video)) {
    object-fit: contain;

    &:not([src]) {
      visibility: hidden;
    }

    .cover & {
      object-fit: cover;
      aspect-ratio: 1 / 1;
    }
  }
</style>
