<script>
  import { Icon } from '@sveltia/ui';
  import { waitForVisibility } from '@sveltia/utils/element';
  import { getAssetBlobURL, getAssetThumbnailURL } from '$lib/services/assets';

  /**
   * Asset type.
   * @type {AssetKind}
   */
  export let kind;
  /**
   * Loading method.
   * @type {'lazy' | 'eager'}
   */
  export let loading = 'lazy';
  /**
   * Asset.
   * @type {Asset | undefined}
   */
  export let asset = undefined;
  /**
   * Source URL.
   * @type {string | undefined}
   */
  export let src = undefined;
  /**
   * Style variant.
   * @type {'tile' | 'icon' | undefined}
   */
  export let variant = undefined;
  /**
   * Whether to show a blurred background (like Slack’s media overlay).
   * @type {boolean}
   */
  export let blurBackground = false;
  /**
   * Whether to use `object-fit: cover`.
   * @type {boolean}
   */
  export let cover = false;
  /**
   * Whether to show a checkerboard background below a transparent image.
   * @type {boolean}
   */
  export let checkerboard = false;
  /**
   * Whether to add a short dissolve transition (fade-in effect) to the image/video when it’s first
   * loaded to avoid a sudden appearance.
   * @type {boolean}
   */
  export let dissolve = true;
  /**
   * Alt text for the image.
   * @type {string}
   */
  export let alt = '';
  /**
   * Whether to show controls for audio/video. If this is `false` and {@link kind} is `audio`, an
   * icon will be displayed instead.
   * @type {boolean}
   */
  export let controls = false;

  /**
   * @type {HTMLImageElement | HTMLMediaElement}
   */
  let mediaElement;
  let updatingSrc = false;
  let hasError = false;
  let loaded = false;

  $: isThumbnail = !!asset && !!variant;
  $: isImage = isThumbnail || kind === 'image' || asset?.name.endsWith('.pdf');

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

    updatingSrc = false;
  };

  $: {
    void mediaElement;
    void asset;
    updateSrc();
  }

  /**
   * Update the {@link loaded} state when the media is loaded.
   */
  const checkLoaded = async () => {
    if (!mediaElement) {
      return;
    }

    if (
      isImage
        ? !(/** @type {HTMLImageElement} */ (mediaElement).complete)
        : !(/** @type {HTMLMediaElement} */ (mediaElement).readyState)
    ) {
      // Not loaded yet; wait until it’s ready
      await new Promise((resolve) => {
        mediaElement.addEventListener(
          isImage ? 'load' : 'loadedmetadata',
          () => {
            resolve(void 0);
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
  };

  $: {
    void mediaElement;
    checkLoaded();
  }
</script>

<div
  role="none"
  class="preview {variant ?? ''}"
  class:cover
  class:checkerboard
  class:dissolve
  class:loaded
>
  {#if hasError}
    <Icon name="draft" />
  {:else if isImage}
    <img {loading} {src} {alt} {...$$restProps} bind:this={mediaElement} />
  {:else if kind === 'video'}
    <!-- svelte-ignore a11y-media-has-caption -->
    <video
      {src}
      controls={controls || undefined}
      playsinline
      {...$$restProps}
      bind:this={mediaElement}
    ></video>
  {:else if kind === 'audio'}
    {#if controls}
      <audio {src} controls playsinline {...$$restProps} bind:this={mediaElement}></audio>
    {:else}
      <Icon name="audio_file" />
    {/if}
  {:else}
    <Icon name="draft" />
  {/if}
  {#if blurBackground}
    <div role="none" class="blur">
      <div role="none" class="overlay"></div>
      {#if kind === 'video'}
        <!-- svelte-ignore a11y-media-has-caption -->
        <video {src} playsinline></video>
      {:else}
        <img {loading} {src} alt="" />
      {/if}
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
      padding: var(--tile-padding, 8px);
      background-color: var(--sui-secondary-background-color);

      :global(.sui.icon) {
        font-size: 48px;
      }
    }

    &.icon {
      width: 40px;
      height: 40px;
    }

    &.tile,
    &.icon {
      overflow: hidden;
      border-radius: var(--sui-control-medium-border-radius);
      aspect-ratio: 1 / 1;
    }

    .blur {
      display: contents;

      & > * {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      :global(.overlay) {
        z-index: -1;
        backdrop-filter: blur(32px) brightness(0.8);
      }

      :is(img, video) {
        width: 100%;
        height: 100%;
        z-index: -2;
        object-fit: cover;
        transform: scale(1.2);
      }
    }

    &.cover {
      padding: 0;

      & > :is(img, video) {
        flex: auto;
      }
    }

    & > :is(img, video) {
      flex: 0;
      max-width: 100%;
      max-height: 100%;
    }

    &.dissolve {
      :is(img, video) {
        opacity: 0;
        transition: opacity 250ms;
      }

      &.loaded {
        :is(img, video) {
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

  :is(img, video) {
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
