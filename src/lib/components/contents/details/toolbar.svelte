<script>
  import {
    Alert,
    AlertDialog,
    Button,
    ConfirmationDialog,
    Divider,
    Icon,
    Menu,
    MenuButton,
    MenuItem,
    MenuItemCheckbox,
    Spacer,
    SplitButton,
    Toast,
    Toolbar,
  } from '@sveltia/ui';
  import equal from 'fast-deep-equal';
  import { _ } from 'svelte-i18n';
  import { goBack, goto } from '$lib/services/app/navigation';
  import { backend, backendName } from '$lib/services/backends';
  import { siteConfig } from '$lib/services/config';
  import { deleteEntries } from '$lib/services/contents/data';
  import { entryDraft } from '$lib/services/contents/draft';
  import { createDraft, duplicateDraft } from '$lib/services/contents/draft/create';
  import { copyFromLocaleToast, entryEditorSettings } from '$lib/services/contents/draft/editor';
  import { saveEntry } from '$lib/services/contents/draft/save';
  import { revertChanges } from '$lib/services/contents/draft/update';
  import {
    getAssociatedAssets,
    getEntryPreviewURL,
    getEntryRepoBlobURL,
  } from '$lib/services/contents/entry';
  import { defaultI18nConfig, getLocaleLabel } from '$lib/services/contents/i18n';
  import { formatSummary } from '$lib/services/contents/view';
  import { prefs } from '$lib/services/prefs';

  let showValidationToast = false;
  let showDeleteDialog = false;
  let showErrorDialog = false;
  let saving = false;
  /** @type {MenuButton} */
  let menuButton;

  $: ({
    isNew,
    collection,
    collectionFile,
    originalEntry,
    originalLocales = {},
    currentLocales = {},
    originalValues = {},
    currentValues = {},
    validities = {},
  } = $entryDraft ?? /** @type {EntryDraft} */ ({}));

  $: ({
    editor: { preview: showPreviewPane = true } = {},
    backend: { automatic_deployments: autoDeployEnabled = undefined } = {},
  } = $siteConfig ?? /** @type {SiteConfig} */ ({}));
  $: showSaveOptions = $backendName !== 'local' && typeof autoDeployEnabled === 'boolean';
  $: ({ defaultLocale } = (collectionFile ?? collection)?._i18n ?? defaultI18nConfig);
  $: collectionLabel = collection?.label || collection?.name;
  $: collectionLabelSingular = collection?.label_singular || collectionLabel;
  $: canPreview = (collectionFile ?? collection)?.editor?.preview ?? showPreviewPane;
  $: modified =
    isNew || !equal(originalLocales, currentLocales) || !equal(originalValues, currentValues);
  $: errorCount = Object.values(validities ?? {})
    .map((validity) => Object.values(validity).map(({ valid }) => !valid))
    .flat(1)
    .filter(Boolean).length;
  $: associatedAssets =
    !!originalEntry && !!collection._assetFolder?.entryRelative
      ? getAssociatedAssets(originalEntry, { relative: true })
      : [];
  $: previewURL = originalEntry
    ? getEntryPreviewURL(originalEntry, defaultLocale, collection, collectionFile)
    : undefined;

  /**
   * Save the entry draft.
   * @param {object} [options] - Options.
   * @param {boolean} [options.skipCI] - Whether to disable automatic deployments for the change.
   */
  const save = async ({ skipCI = undefined } = {}) => {
    saving = true;

    try {
      const savedEntry = await saveEntry({ skipCI });

      if ($prefs?.closeOnSave ?? true) {
        goBack(`/collections/${collection?.name}`);
        $entryDraft = null;
      } else {
        if (isNew) {
          // Update the URL
          goto(`/collections/${collection?.name}/entries/${savedEntry.slug}`, {
            replaceState: true,
            notifyChange: false,
          });
        }

        // Reset the draft
        createDraft(savedEntry);
      }
    } catch (/** @type {any} */ ex) {
      if (ex.message === 'validation_failed') {
        showValidationToast = true;
      } else {
        showErrorDialog = true;
        // eslint-disable-next-line no-console
        console.error(ex);
      }
    } finally {
      saving = false;
    }
  };
</script>

<Toolbar variant="primary" aria-label={$_('primary')}>
  <Button
    variant="ghost"
    iconic
    aria-label={$_('cancel_editing')}
    keyShortcuts="Escape"
    on:click={() => {
      goBack(`/collections/${collection?.name}`);
    }}
  >
    <Icon slot="start-icon" name="arrow_back_ios_new" />
  </Button>
  <h2 role="none">
    <strong role="none">
      {#if isNew}
        {$_('creating_x', { values: { name: collectionLabelSingular } })}
      {:else}
        {$_('editing_x_in_x', {
          values: {
            collection: collectionLabel,
            // eslint-disable-next-line no-nested-ternary
            entry: collectionFile
              ? collectionFile.label || collectionFile.name
              : originalEntry
                ? formatSummary(collection, originalEntry, defaultLocale, { useTemplate: false })
                : '',
          },
        })}
      {/if}
    </strong>
  </h2>
  <Spacer flex />
  {#if previewURL}
    <Button
      variant="tertiary"
      label={$_('view_on_live_site')}
      on:click={() => {
        window.open(previewURL);
      }}
    />
  {/if}
  {#if !collectionFile && !isNew}
    <Button
      variant="ghost"
      label={$_('duplicate')}
      aria-label={$_('duplicate_entry')}
      disabled={collection?.create === false}
      on:click={() => {
        goto(`/collections/${collection?.name}/new`, { replaceState: true, notifyChange: false });
        duplicateDraft();
      }}
    />
    <Button
      variant="ghost"
      label={$_('delete')}
      aria-label={$_('delete_entry')}
      disabled={collection?.delete === false}
      on:click={() => {
        showDeleteDialog = true;
      }}
    />
  {/if}
  <MenuButton
    variant="ghost"
    iconic
    popupPosition="bottom-right"
    aria-label={$_('show_editor_options')}
    bind:this={menuButton}
  >
    <Icon slot="start-icon" name="more_vert" />
    <Menu slot="popup" aria-label={$_('editor_options')}>
      <MenuItemCheckbox
        label={$_('show_preview')}
        checked={$entryEditorSettings?.showPreview}
        disabled={!canPreview}
        on:change={() => {
          entryEditorSettings.update((view = {}) => ({
            ...view,
            showPreview: !view.showPreview,
          }));
        }}
      />
      <MenuItemCheckbox
        label={$_('sync_scrolling')}
        checked={$entryEditorSettings?.syncScrolling}
        disabled={!canPreview && Object.keys(currentValues).length === 1}
        on:change={() => {
          entryEditorSettings.update((view = {}) => ({
            ...view,
            syncScrolling: !view.syncScrolling,
          }));
        }}
      />
      <Divider />
      <MenuItem
        label={$_('revert_all_changes')}
        disabled={!modified}
        on:click={() => {
          revertChanges();
        }}
      />
      {#if originalEntry}
        <Divider />
        <MenuItem
          disabled={!$backend?.repository?.blobBaseURL}
          label={$_('view_on_x', {
            values: { service: $backend?.repository?.label },
            default: $_('view_in_repository'),
          })}
          on:click={() => {
            if (originalEntry) {
              window.open(getEntryRepoBlobURL(originalEntry, defaultLocale));
            }
          }}
        />
      {/if}
    </Menu>
  </MenuButton>
  {#if showSaveOptions}
    <SplitButton
      variant="primary"
      label={$_(saving ? 'saving' : 'save')}
      disabled={!modified || saving}
      keyShortcuts="Accel+S"
      on:click={() => save()}
    >
      <Menu slot="popup">
        <!-- Show the opposite option: if automatic deployments are enabled, allow to disable it -->
        <MenuItem
          label={$_(autoDeployEnabled ? 'save_without_publishing' : 'save_and_publish')}
          on:click={() => save({ skipCI: autoDeployEnabled })}
        />
      </Menu>
    </SplitButton>
  {:else}
    <Button
      variant="primary"
      label={$_(saving ? 'saving' : 'save')}
      disabled={!modified || saving}
      keyShortcuts="Accel+S"
      on:click={() => save()}
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

<ConfirmationDialog
  bind:open={showDeleteDialog}
  title={$_('delete_entry')}
  okLabel={$_('delete')}
  on:ok={async () => {
    if (originalEntry) {
      await deleteEntries(
        [originalEntry.id],
        associatedAssets.map(({ path }) => path),
      );
    }

    goBack(`/collections/${collection?.name}`);
  }}
  on:close={() => {
    menuButton.focus();
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
  on:close={() => {
    menuButton.focus();
  }}
>
  {$_('saving_entry.error.description')}
</AlertDialog>
