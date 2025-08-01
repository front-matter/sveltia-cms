<!--
  @component
  Implement the editor for the Map widget.
  @see https://decapcms.org/docs/widgets/#map
  @see https://leafletjs.com/
  @see https://github.com/JamesLMilner/terra-draw
-->
<script>
  // cSpell:ignore Nominatim jsonv2

  import { AlertDialog, Button, Icon, Listbox, Option, SearchBar } from '@sveltia/ui';
  import { isObject } from '@sveltia/utils/object';
  import { onMount, untrack } from 'svelte';
  import { _ } from 'svelte-i18n';

  import { loadModule } from '$lib/services/app/dependencies';
  import { sendRequest } from '$lib/services/utils/networking';
  import { toFixed } from '$lib/services/utils/number';

  /**
   * @import { GeoJSONStoreGeometries, TerraDraw } from 'terra-draw';
   * @import { GeoCoordinates, WidgetEditorProps } from '$lib/types/private';
   * @import { MapField } from '$lib/types/public';
   */

  /**
   * @typedef {object} Props
   * @property {MapField} fieldConfig Field configuration.
   * @property {string | undefined} currentValue Field value. Stringified GeoJSON geometry object.
   */

  /**
   * @typedef {object} SearchResult
   * @property {string} place_id Unique identifier of the search result.
   * @property {string} display_name Display name of the search result.
   * @property {string} lat Latitude of the search result.
   * @property {string} lon Longitude of the search result.
   * @see https://nominatim.org/release-docs/develop/api/Search/
   */

  /** @type {WidgetEditorProps & Props} */
  let {
    /* eslint-disable prefer-const */
    fieldConfig,
    currentValue = $bindable(),
    // required = true,
    readonly = false,
    invalid = false,
    /* eslint-enable prefer-const */
  } = $props();

  const { required = true, decimals = 7, type: geometryType = 'Point' } = $derived(fieldConfig);
  const drawMode = $derived(geometryType.toLowerCase());

  /** @type {HTMLElement | undefined} */
  let mapElement = $state();
  /** @type {TerraDraw | undefined} */
  let draw = $state(undefined);
  /** @type {string} */
  let inputValue = $state('');
  /** @type {string} */
  let searchQuery = $state('');
  /** @type {SearchResult[] | undefined} */
  let searchResults = $state(undefined);
  /** @type {boolean} */
  let searching = $state(false);
  /** @type {boolean} */
  let showAlertDialog = $state(false);
  /** @type {string} */
  let errorMessage = $state('');

  /** @type {number} */
  let searchInputTimeout = 0;
  /** @type {import('leaflet').Map | undefined} */
  let map = undefined;

  /**
   * Load the Leaflet and Terra Draw libraries and initialize the map. We don’t bundle the libraries
   * because of the bundle size: the Map widget may not be used often and multiple services/adapters
   * may be supported in the future.
   */
  const init = async () => {
    if (!mapElement) {
      return;
    }

    /** @type {import('leaflet')} */
    const leaflet = await loadModule('leaflet', 'dist/leaflet-src.esm.js');

    /** @type {import('terra-draw')} */
    const { TerraDraw, TerraDrawLineStringMode, TerraDrawPointMode, TerraDrawPolygonMode } =
      await loadModule('terra-draw', 'dist/terra-draw.module.js');

    /** @type {import('terra-draw-leaflet-adapter')} */
    const { TerraDrawLeafletAdapter } = await loadModule(
      'terra-draw-leaflet-adapter',
      'dist/terra-draw-leaflet-adapter.module.js?module',
    );

    map = leaflet.map(mapElement, { center: [0, 0], zoom: 2 });

    leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
      .addTo(map);

    new ResizeObserver(() => {
      map?.invalidateSize();
    }).observe(mapElement);

    const _draw = new TerraDraw({
      adapter: new TerraDrawLeafletAdapter({ lib: leaflet, map }),
      modes: [new TerraDrawPointMode(), new TerraDrawLineStringMode(), new TerraDrawPolygonMode()],
    });

    _draw.start();
    _draw.setMode(drawMode);

    _draw.on('change', (_ids, changeType) => {
      // eslint-disable-next-line no-use-before-define
      onDrawChange(changeType);
    });

    draw = _draw;
  };

  /**
   * Handle the change event of the Terra Draw instance. Update the input value based on the drawn
   * feature. This function is called when a feature is created, modified, or deleted.
   * @param {string} changeType Type of change that occurred in the draw instance.
   */
  const onDrawChange = (changeType) => {
    if (!draw) {
      return;
    }

    if (changeType === 'create') {
      const snapshot = draw.getSnapshot();
      const feature = snapshot.findLast((f) => f.geometry.type === geometryType);

      if (!feature) {
        return;
      }

      const { type, coordinates } = feature.geometry;

      inputValue = JSON.stringify({
        type,
        coordinates: coordinates.map((coords) =>
          Array.isArray(coords)
            ? coords.map((c) =>
                Array.isArray(c) ? c.map((cc) => toFixed(cc, decimals)) : toFixed(c, decimals),
              )
            : toFixed(coords, decimals),
        ),
      });

      // Allow to have only one feature
      if (geometryType === 'Point') {
        draw.removeFeatures(
          /** @type {string[]} */ (snapshot.filter((f) => f.id !== feature.id).map((f) => f.id)),
        );
      }
    }
  };

  /**
   * Update {@link inputValue} based on {@link currentValue}.
   */
  const setInputValue = () => {
    if (!draw) {
      return;
    }

    let newValue = currentValue ?? '';
    /** @type {GeoJSONStoreGeometries | undefined} */
    let geometry = undefined;

    // Validate the value
    try {
      if (newValue !== undefined) {
        geometry = JSON.parse(newValue);

        if (
          !geometry ||
          !isObject(geometry) ||
          geometry.type !== geometryType ||
          !Array.isArray(geometry.coordinates)
        ) {
          throw new Error('Invalid object');
        }
      }
    } catch {
      newValue = '';
      geometry = undefined;
    }

    if (inputValue === newValue) {
      return;
    }

    inputValue = newValue;

    draw.clear();

    if (geometry) {
      draw.addFeatures([{ type: 'Feature', geometry, properties: { mode: drawMode } }]);

      if (geometry.coordinates.every((c) => typeof c === 'number')) {
        const [longitude, latitude] = geometry.coordinates;

        map?.setView([latitude, longitude], 15);
      }
    }
  };

  /**
   * Update {@link currentValue} based on {@link inputValue}.
   */
  const setCurrentValue = () => {
    if (!draw) {
      return;
    }

    const newValue = inputValue;

    // Avoid a cycle dependency & infinite loop
    if (currentValue !== newValue) {
      currentValue = newValue;
    }
  };

  /**
   * Search for locations using the Nominatim API.
   * @see https://nominatim.org/release-docs/develop/api/Search/
   */
  const searchLocation = () => {
    window.clearTimeout(searchInputTimeout);

    searchInputTimeout = window.setTimeout(async () => {
      const q = searchQuery.trim();

      if (!q) {
        return;
      }

      searching = true;

      const params = new URLSearchParams({ q, format: 'jsonv2' });
      const url = `https://nominatim.openstreetmap.org/search?${params}`;

      try {
        searchResults = /** @type {SearchResult[]} */ (await sendRequest(url));
      } catch {
        searchResults = [];
      }

      searching = false;
    }, 500);
  };

  /**
   * Set the location on the map editor.
   * @param {GeoCoordinates} coordinates GeoCoordinates of the location to set.
   */
  const setLocation = ({ latitude, longitude }) => {
    if (!draw) {
      return;
    }

    latitude = toFixed(latitude, decimals);
    longitude = toFixed(longitude, decimals);

    /** @type {GeoJSONStoreGeometries} */
    const feature = { type: 'Point', coordinates: [longitude, latitude] };

    draw.clear();
    draw.addFeatures([{ type: 'Feature', geometry: feature, properties: { mode: 'point' } }]);
    map?.setView([latitude, longitude], 15);

    inputValue = JSON.stringify(feature);
  };

  /**
   * Handle the selection of a search result. Move the map to the selected location and add a point
   * feature to the map.
   * @param {SearchResult} result Selected search result.
   */
  const onSearchResultSelect = ({ lat, lon }) => {
    setLocation({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
  };

  /**
   * Use the browser’s geolocation API to get the current location of the user and set it as the
   * value of the map editor. This function is called when the Use Current Location button is
   * clicked. It retrieves the user’s current position and updates the map with a point feature at
   * the user’s location.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
   */
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      showAlertDialog = true;
      errorMessage = $_('geolocation_unsupported');

      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setLocation({ latitude, longitude });
      },
      (error) => {
        showAlertDialog = true;
        errorMessage = $_('geolocation_error_body');
        // eslint-disable-next-line no-console
        console.error('Error getting current location:', error);
      },
    );
  };

  /**
   * Clear the current value of the map editor. This is called when the Clear button is clicked.
   * It sets the `currentValue` to an empty string, effectively clearing the map.
   */
  const clearValue = () => {
    currentValue = '';
  };

  onMount(() => {
    init();
  });

  $effect(() => {
    void draw;
    void currentValue;

    untrack(() => {
      setInputValue();
    });
  });

  $effect(() => {
    void inputValue;

    untrack(() => {
      setCurrentValue();
    });
  });

  $effect(() => {
    void searchQuery;

    untrack(() => {
      searchLocation();
    });
  });
</script>

<!-- @todo Support LineString and Polygon types -->
{#if geometryType === 'Point'}
  <div role="none" class="toolbar">
    <!-- @todo Replace this with `<Combobox>` -->
    <SearchBar bind:value={searchQuery} {readonly} flex placeholder={$_('find_place')} />
    <!-- @todo Replace `title` with a native tooltip -->
    <Button
      variant="tertiary"
      iconic
      title={$_('use_your_location')}
      aria-label={$_('use_your_location')}
      disabled={readonly}
      onclick={() => {
        useCurrentLocation();
      }}
    >
      {#snippet startIcon()}
        <Icon name="near_me" />
      {/snippet}
    </Button>
    {#if !required}
      <Button
        variant="tertiary"
        label={$_('clear')}
        disabled={readonly || !currentValue}
        onclick={() => {
          clearValue();
        }}
      />
    {/if}
  </div>

  {#if searching}
    <div role="alert" class="search-result searching">{$_('searching')}</div>
  {:else if searchQuery}
    {#if searchResults}
      {#if searchResults.length}
        <Listbox aria-label={$_('search_results')}>
          {#each searchResults as result (result.place_id)}
            <Option
              label={result.display_name}
              onSelect={() => {
                onSearchResultSelect(result);
              }}
            />
          {/each}
        </Listbox>
      {:else}
        <div role="alert" class="search-result no-result">{$_('no_results')}</div>
      {/if}
    {/if}
  {/if}

  <div role="application" class="map" inert={readonly} class:invalid bind:this={mapElement}></div>
{:else}
  The {geometryType} type is not yet supported.
{/if}

<AlertDialog bind:open={showAlertDialog} title={$_('geolocation_error_title')}>
  {errorMessage}
</AlertDialog>

<style lang="scss">
  // @todo Copy minimal styles from Leaflet to avoid loading the whole CSS file
  @import 'node_modules/leaflet/dist/leaflet.css';

  .toolbar {
    display: flex;
    align-items: center;
    margin-bottom: var(--sui-spacing-2x);
  }

  .search-result {
    padding: 12px;
    color: var(--sui-secondary-foreground-color);
  }

  .map {
    margin: var(--sui-focus-ring-width);
    border: 1px solid var(--sui-textbox-border-color);
    border-radius: var(--sui-textbox-border-radius);
    overflow: hidden;
    height: 400px;
    background-clip: text;

    &.invalid {
      border-color: var(--sui-error-border-color);
    }
  }

  :global(.leaflet-container) {
    font-family: inherit !important;
    font-size: var(--sui-font-size-small) !important;
  }

  :global(.leaflet-container a) {
    color: var(--sui-primary-accent-color-text) !important;
    text-decoration: none !important;
  }

  :global(.leaflet-bar a) {
    border-color: var(--sui-button-border-color) !important;
    color: var(--sui-secondary-foreground-color) !important;
    background-color: var(--sui-button-background-color) !important;
  }

  :global(.leaflet-control) {
    color: var(--sui-secondary-foreground-color) !important;
    background-color: var(--sui-secondary-background-color-translucent) !important;
  }

  :global(.leaflet-control-attribution) {
    padding: 4px 8px;
  }

  // Dark theme: https://stackoverflow.com/q/59819792
  :global(:root[data-theme='dark'] .leaflet-layer) {
    filter: invert(100%) hue-rotate(180deg);
  }
</style>
