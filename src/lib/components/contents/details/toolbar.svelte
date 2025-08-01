<script>
  import {
    Alert,
    AlertDialog,
    Button,
    ConfirmationDialog,
    Divider,
    Menu,
    MenuButton,
    MenuItem,
    MenuItemCheckbox,
    SplitButton,
    Toast,
    Toolbar,
    TruncatedText,
  } from '@sveltia/ui';
  import { _, locale as appLocale } from 'svelte-i18n';

  import BackButton from '$lib/components/common/page-toolbar/back-button.svelte';
  import EditSlugDialog from '$lib/components/contents/details/edit-slug-dialog.svelte';
  import { goBack, goto } from '$lib/services/app/navigation';
  import { getAssetFolder } from '$lib/services/assets/folders';
  import { backend } from '$lib/services/backends';
  import { siteConfig } from '$lib/services/config';
  import { getCollectionLabel } from '$lib/services/contents/collection';
  import { deleteEntries } from '$lib/services/contents/collection/data/delete';
  import { canCreateEntry } from '$lib/services/contents/collection/entries';
  import { getCollectionFileLabel } from '$lib/services/contents/collection/files';
  import { entryDraft, entryDraftModified } from '$lib/services/contents/draft';
  import { createDraft } from '$lib/services/contents/draft/create';
  import { duplicateDraft } from '$lib/services/contents/draft/create/duplicate';
  import { saveEntry } from '$lib/services/contents/draft/save';
  import { revertChanges } from '$lib/services/contents/draft/update/revert';
  import { copyFromLocaleToast } from '$lib/services/contents/editor';
  import { entryEditorSettings } from '$lib/services/contents/editor/settings';
  import { getEntryPreviewURL } from '$lib/services/contents/entry';
  import { getAssociatedAssets } from '$lib/services/contents/entry/assets';
  import { getEntrySummary } from '$lib/services/contents/entry/summary';
  import { getLocaleLabel } from '$lib/services/contents/i18n';
  import { DEFAULT_I18N_CONFIG } from '$lib/services/contents/i18n/config';
  import { isMediumScreen, isSmallScreen } from '$lib/services/user/env';
  import { prefs } from '$lib/services/user/prefs';

  /**
   * @typedef {object} Props
   * @property {boolean} [disabled] Whether to disable controls other than the Back button.
   */

  /** @type {Props} */
  let {
    /* eslint-disable prefer-const */
    disabled = false,
    /* eslint-enable prefer-const */
  } = $props();

  let showValidationToast = $state(false);
  let showEditSlugDialog = $state(false);
  let showDeleteDialog = $state(false);
  let showErrorDialog = $state(false);
  let errorMessage = $state('');
  let saving = $state(false);
  /** @type {MenuButton | undefined} */
  let menuButton = $state();

  const isNew = $derived($entryDraft?.isNew ?? true);
  const isIndexFile = $derived($entryDraft?.isIndexFile ?? false);
  const collection = $derived($entryDraft?.collection);
  const collectionFile = $derived($entryDraft?.collectionFile);
  const originalEntry = $derived($entryDraft?.originalEntry);
  const autoDeployEnabled = $derived($siteConfig?.backend.automatic_deployments);
  const showSaveOptions = $derived(!!$backend?.isGit && typeof autoDeployEnabled === 'boolean');
  const { defaultLocale } = $derived((collectionFile ?? collection)?._i18n ?? DEFAULT_I18N_CONFIG);
  const collectionName = $derived(collection?.name);
  const fileName = $derived(collectionFile?.name);
  const collectionLabel = $derived(
    // `$appLocale` is a key, because `getCollectionLabel` can return a localized label
    $appLocale && collection ? getCollectionLabel(collection) : '',
  );
  const collectionLabelSingular = $derived(
    // `$appLocale` is a key, because `getCollectionLabel` can return a localized label
    $appLocale && collection ? getCollectionLabel(collection, { useSingular: true }) : '',
  );
  const canPreview = $derived($entryDraft?.canPreview ?? true);
  const modified = $derived(isNew || $entryDraftModified);
  const errorCount = $derived(
    Object.values($entryDraft?.validities ?? {})
      .map((validity) => Object.values(validity).map(({ valid }) => !valid))
      .flat(1)
      .filter(Boolean).length,
  );
  const associatedAssets = $derived(
    collectionName && originalEntry && getAssetFolder({ collectionName, fileName })?.entryRelative
      ? getAssociatedAssets({ entry: originalEntry, collectionName, fileName, relative: true })
      : [],
  );
  const previewURL = $derived(
    collection && originalEntry
      ? getEntryPreviewURL(originalEntry, defaultLocale, collection, collectionFile)
      : undefined,
  );

  /**
   * Go back to the previous page. If the entry is a singleton file, go to the collections list.
   * Otherwise, go to the collection entries list.
   */
  const _goBack = () => {
    goBack(collectionName === '_singletons' ? '/collections' : `/collections/${collectionName}`);
  };

  /**
   * Save the entry draft.
   * @param {object} [options] Options.
   * @param {boolean} [options.skipCI] Whether to disable automatic deployments for the change.
   */
  const save = async ({ skipCI = undefined } = {}) => {
    saving = true;

    if (!collection) {
      return;
    }

    try {
      const savedEntry = await saveEntry({ skipCI });

      if ($prefs?.closeOnSave ?? true) {
        _goBack();
        $entryDraft = null;
      } else {
        if (isNew) {
          // Update the URL
          goto(`/collections/${collectionName}/entries/${savedEntry.subPath}`, {
            replaceState: true,
            notifyChange: false,
            transitionType: 'backwards',
          });
        }

        // Reset the draft
        createDraft({
          collection,
          collectionFile,
          originalEntry: savedEntry,
          expanderStates: $entryDraft?.expanderStates,
        });
      }
    } catch (/** @type {any} */ ex) {
      if (ex.message === 'validation_failed') {
        showValidationToast = true;
      } else if (ex.message === 'saving_failed') {
        showErrorDialog = true;
        errorMessage = ex.cause?.message ?? ex.message ?? $_('unexpected_error');
      } else {
        showErrorDialog = true;
        errorMessage = '';
        // eslint-disable-next-line no-console
        console.error(ex);
      }
    } finally {
      saving = false;
    }
  };
</script>

{#snippet overflowButtons()}
  {@const Component = $isSmallScreen ? MenuItem : Button}
  <Component
    variant="ghost"
    label={$_('duplicate')}
    aria-label={$_('duplicate_entry')}
    disabled={isIndexFile || collection?.create === false || !canCreateEntry(collection)}
    onclick={() => {
      goto(`/collections/${collectionName}/new`, {
        replaceState: true,
        notifyChange: false,
        transitionType: 'forwards',
      });
      duplicateDraft();
    }}
  />
  <Component
    variant="ghost"
    label={$_('delete')}
    aria-label={$_('delete_entry')}
    disabled={collection?.delete === false}
    onclick={() => {
      showDeleteDialog = true;
    }}
  />
{/snippet}

<Toolbar variant="primary" aria-label={$_('primary')}>
  <BackButton
    aria-label={$_('cancel_editing')}
    useShortcut={$prefs.closeWithEscape}
    onclick={() => {
      _goBack();
    }}
  />
  <h2 role="none">
    <TruncatedText>
      {#if isNew}
        {$_('create_entry_title', { values: { name: collectionLabelSingular } })}
      {:else}
        {@const entrySummary = collectionFile
          ? getCollectionFileLabel(collectionFile)
          : collection && originalEntry && $appLocale
            ? getEntrySummary(collection, originalEntry)
            : ''}
        {#if $isSmallScreen}
          {entrySummary}
        {:else}
          {$_('edit_entry_title', {
            values: { collection: collectionLabel, entry: entrySummary },
          })}
        {/if}
      {/if}
    </TruncatedText>
  </h2>
  {#if !disabled && previewURL}
    <Button
      variant="tertiary"
      label={$_('view_on_live_site')}
      onclick={() => {
        window.open(previewURL);
      }}
    />
  {/if}
  {#if !$isSmallScreen && !disabled && !collectionFile && !isNew}
    {@render overflowButtons()}
  {/if}
  <MenuButton
    {disabled}
    variant="ghost"
    iconic
    popupPosition="bottom-right"
    aria-label={$_('show_editor_options')}
    bind:this={menuButton}
  >
    {#snippet popup()}
      <Menu aria-label={$_('editor_options')}>
        {#if $isSmallScreen && !disabled && !collectionFile && !isNew}
          {@render overflowButtons()}
        {/if}
        <MenuItem
          label={$_('edit_slug')}
          disabled={!!collectionFile || isNew || isIndexFile || collection?.delete === false}
          onclick={() => {
            showEditSlugDialog = true;
          }}
        />
        <MenuItem
          label={$_('revert_all_changes')}
          disabled={!modified}
          onclick={() => {
            revertChanges();
          }}
        />
        {#if !($isSmallScreen || $isMediumScreen)}
          <Divider />
          <MenuItemCheckbox
            label={$_('show_preview')}
            checked={$entryEditorSettings?.showPreview}
            disabled={!canPreview}
            onChange={() => {
              entryEditorSettings.update((view = {}) => ({
                ...view,
                showPreview: !view.showPreview,
              }));
            }}
          />
          <MenuItemCheckbox
            label={$_('sync_scrolling')}
            checked={$entryEditorSettings?.syncScrolling}
            disabled={!canPreview && Object.keys($entryDraft?.currentValues ?? {}).length === 1}
            onChange={() => {
              entryEditorSettings.update((view = {}) => ({
                ...view,
                syncScrolling: !view.syncScrolling,
              }));
            }}
          />
        {/if}
      </Menu>
    {/snippet}
  </MenuButton>
  {#if showSaveOptions}
    <SplitButton
      variant="primary"
      label={$_(saving ? 'saving' : 'save')}
      disabled={disabled || !modified || saving}
      keyShortcuts="Accel+S"
      onclick={() => {
        save();
      }}
    >
      {#snippet popup()}
        <!-- Show the opposite option: if automatic deployments are enabled, allow to disable it -->
        <Menu>
          <MenuItem
            label={$_(autoDeployEnabled ? 'save_without_publishing' : 'save_and_publish')}
            onclick={() => {
              save({ skipCI: autoDeployEnabled });
            }}
          />
        </Menu>
      {/snippet}
    </SplitButton>
  {:else}
    <Button
      variant="primary"
      label={$_(saving ? 'saving' : 'save')}
      disabled={disabled || !modified || saving}
      keyShortcuts="Accel+S"
      onclick={() => {
        save();
      }}
    />
  {/if}
</Toolbar>

<Toast bind:show={showValidationToast}>
  <Alert status="error">
    {$_(errorCount === 1 ? 'entry_validation_error' : 'entry_validation_errors', {
      values: { count: errorCount },
    })}
  </Alert>
</Toast>

<Toast id={$copyFromLocaleToast.id} bind:show={$copyFromLocaleToast.show}>
  {@const { status, message, count, sourceLocale } = $copyFromLocaleToast}
  <Alert {status}>
    {$_(`editor.${message}`, {
      values: { count, source: sourceLocale ? getLocaleLabel(sourceLocale) : '' },
    })}
  </Alert>
</Toast>

<EditSlugDialog bind:open={showEditSlugDialog} />

<ConfirmationDialog
  bind:open={showDeleteDialog}
  title={$_('delete_entry')}
  okLabel={$_('delete')}
  onOk={async () => {
    if (originalEntry) {
      await deleteEntries(
        [originalEntry.id],
        associatedAssets.map(({ path }) => path),
      );
    }

    _goBack();
  }}
  onClose={() => {
    menuButton?.focus();
  }}
>
  {$_(
    associatedAssets.length
      ? 'confirm_deleting_this_entry_with_assets'
      : 'confirm_deleting_this_entry',
  )}
</ConfirmationDialog>

<!-- @todo make the error message more informative -->
<AlertDialog
  bind:open={showErrorDialog}
  title={$_('saving_entry.error.title')}
  onClose={() => {
    menuButton?.focus();
  }}
>
  {$_('saving_entry.error.description')}
  {#if errorMessage}
    <div role="none" class="error">
      {errorMessage}
    </div>
  {/if}
</AlertDialog>

<style lang="scss">
  .error {
    margin-top: 8px;
    border-radius: var(--sui-control-medium-border-radius);
    padding: 12px;
    background-color: var(--sui-secondary-background-color);
    font-size: var(--sui-font-size-default);
    line-height: 1.5;
  }
</style>
