<script>
  import { Divider, Icon, Menu, MenuButton, MenuItem } from '@sveltia/ui';
  import { sleep } from '@sveltia/utils/misc';
  import { _ } from 'svelte-i18n';
  import { goto } from '$lib/services/app/navigation';
  import { showUploadAssetsDialog } from '$lib/services/assets/view';
  import { siteConfig } from '$lib/services/config';
</script>

<MenuButton
  variant="ghost"
  iconic
  popupPosition="bottom-right"
  aria-label={$_('create_entry_or_assets')}
>
  {#snippet endIcon()}
    <Icon name="add" />
  {/snippet}
  {#snippet popup()}
    <Menu aria-label={$_('create_entry_or_assets')}>
      {#each $siteConfig?.collections ?? [] as collection (collection.name)}
        {@const {
          name,
          label,
          label_singular: labelSingular,
          folder,
          hide = false,
          create = false,
          divider = false,
        } = collection}
        {#if folder && !hide && !divider}
          <MenuItem
            label={labelSingular || label || name}
            disabled={!create}
            onclick={() => {
              goto(`/collections/${name}/new`);
            }}
          />
        {/if}
      {/each}
      <Divider />
      <MenuItem
        label={$_('assets')}
        onclick={async () => {
          goto('/assets');
          await sleep(100);
          $showUploadAssetsDialog = true;
        }}
      />
    </Menu>
  {/snippet}
</MenuButton>
