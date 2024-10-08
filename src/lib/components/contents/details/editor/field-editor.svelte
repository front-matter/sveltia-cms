<script>
  import { Icon, Menu, MenuButton, MenuItem, Spacer } from '@sveltia/ui';
  import { generateElementId } from '@sveltia/utils/element';
  import { escapeRegExp } from '@sveltia/utils/string';
  import equal from 'fast-deep-equal';
  import DOMPurify from 'isomorphic-dompurify';
  import { marked } from 'marked';
  import { setContext } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { writable } from 'svelte/store';
  import { defaultI18nConfig } from '$lib/services/contents/i18n';
  import { revertChanges } from '$lib/services/contents/draft/update';
  import { entryDraft } from '$lib/services/contents/draft';
  import { editors } from '$lib/components/contents/details/widgets';
  import TranslateButton from '$lib/components/contents/details/editor/translate-button.svelte';
  import CopyMenuItems from '$lib/components/contents/details/editor/copy-menu-items.svelte';

  /**
   * @type {LocaleCode}
   */
  export let locale;
  /**
   * @type {FieldKeyPath}
   */
  export let keyPath;
  /**
   * @type {Field}
   */
  export let fieldConfig;

  const fieldId = generateElementId('field');

  /**
   * Parse the given string as Markdown and sanitize the result to only allow certain tags.
   * @param {string} str - Original string.
   * @returns {string} Sanitized string.
   */
  const sanitize = (str) =>
    DOMPurify.sanitize(/** @type {string} */ (marked.parseInline(str.replaceAll('\\n', '<br>'))), {
      ALLOWED_TAGS: ['strong', 'em', 'del', 'code', 'a', 'br'],
      ALLOWED_ATTR: ['href'],
    });

  /** @type {import('svelte/store').Writable<import('svelte').Component>} */
  const extraHint = writable();

  setContext('field-editor', { extraHint });

  $: ({
    name: fieldName,
    label = '',
    comment = '',
    hint = '',
    widget: widgetName = 'string',
    required = true,
    i18n = false,
    pattern = /** @type {string[]} */ ([]),
  } = fieldConfig);
  // @ts-ignore
  $: ({ field: subField, fields: subFields, types } = /** @type {ListField} */ (fieldConfig));
  $: hasSubFields = !!subField || !!subFields || !!types;
  // @ts-ignore
  $: ({ min, max } = /** @type {ListField | NumberField | RelationField | SelectField} */ (
    fieldConfig
  ));
  $: type =
    // prettier-ignore
    widgetName === 'string' ? (/** @type {StringField} */ (fieldConfig).type ?? 'text') : undefined;
  $: allowPrefix = ['string'].includes(widgetName);
  $: prefix = allowPrefix ? /** @type {StringField} */ (fieldConfig).prefix : undefined;
  $: suffix = allowPrefix ? /** @type {StringField} */ (fieldConfig).suffix : undefined;
  $: allowExtraLabels = ['boolean', 'number', 'string'].includes(widgetName);
  $: beforeInputLabel = allowExtraLabels
    ? /** @type {BooleanField | NumberField | StringField} */ (fieldConfig).before_input
    : undefined;
  $: afterInputLabel = allowExtraLabels
    ? /** @type {BooleanField | NumberField | StringField} */ (fieldConfig).after_input
    : undefined;
  $: hasExtraLabels = !!(prefix || suffix || beforeInputLabel || afterInputLabel);
  $: hasMultiple = ['relation', 'select'].includes(widgetName);
  $: multiple = hasMultiple
    ? /** @type {RelationField | SelectField} */ (fieldConfig).multiple
    : undefined;
  $: isList = widgetName === 'list' || (hasMultiple && multiple);
  $: ({ collection, collectionFile, originalValues, currentValues, validities } =
    $entryDraft ?? /** @type {EntryDraft} */ ({}));
  $: ({ i18nEnabled, locales, defaultLocale } =
    (collectionFile ?? collection)?._i18n ?? defaultI18nConfig);
  $: otherLocales = i18nEnabled ? locales.filter((l) => l !== locale) : [];
  $: canTranslate = i18nEnabled && (i18n === true || i18n === 'translate');
  $: canDuplicate = i18nEnabled && i18n === 'duplicate';
  $: canEdit = locale === defaultLocale || canTranslate || canDuplicate;
  $: keyPathRegex = new RegExp(`^${escapeRegExp(keyPath)}\\.\\d+$`);

  // Multiple values are flattened in the value map object
  $: currentValue = isList
    ? Object.entries(currentValues[locale])
        .filter(([_keyPath]) => _keyPath.match(keyPathRegex))
        .map(([, val]) => val)
        .filter((val) => val !== undefined)
    : currentValues[locale][keyPath];
  $: originalValue = isList
    ? Object.entries(originalValues[locale])
        .filter(([_keyPath]) => _keyPath.match(keyPathRegex))
        .map(([, val]) => val)
        .filter((val) => val !== undefined)
    : originalValues[locale][keyPath];
  $: validity = validities[locale][keyPath];

  $: fieldLabel = label || fieldName;
  $: readonly = (i18n === 'duplicate' && locale !== defaultLocale) || widgetName === 'compute';
  $: invalid = validity?.valid === false;
</script>

{#if $entryDraft && canEdit && widgetName !== 'hidden'}
  {@const canCopy = canTranslate && otherLocales.length}
  {@const canRevert = !(canDuplicate && locale !== defaultLocale)}
  <section
    role="group"
    class="field"
    aria-label={$_('x_field', { values: { field: fieldLabel } })}
    data-widget={widgetName}
    data-key-path={keyPath}
    hidden={widgetName === 'compute'}
  >
    <header role="none">
      <h4 role="none" id="{fieldId}-label">{fieldLabel}</h4>
      {#if !readonly && required}
        <div class="required" aria-label={$_('required')}>*</div>
      {/if}
      <Spacer flex />
      {#if canCopy && ['markdown', 'string', 'text', 'list', 'object'].includes(widgetName)}
        <TranslateButton size="small" {locale} {otherLocales} {keyPath} />
      {/if}
      {#if canCopy || canRevert}
        <MenuButton
          variant="ghost"
          size="small"
          iconic
          popupPosition="bottom-right"
          aria-label={$_('show_field_options')}
        >
          {#snippet popup()}
            <Menu aria-label={$_('field_options')}>
              {#if canCopy}
                <CopyMenuItems {locale} {otherLocales} {keyPath} />
              {/if}
              {#if canRevert}
                <MenuItem
                  label={$_('revert_changes')}
                  disabled={equal(currentValue, originalValue)}
                  onclick={() => {
                    revertChanges(locale, keyPath);
                  }}
                />
              {/if}
            </Menu>
          {/snippet}
        </MenuButton>
      {/if}
    </header>
    {#if !readonly && comment}
      <p class="comment">{@html sanitize(comment)}</p>
    {/if}
    <div role="alert" id="{fieldId}-error" class="validation" aria-live="polite">
      {#if validity?.valid === false}
        {#if validity.valueMissing}
          <div role="none">
            <Icon name="error" />
            {$_('validation.value_missing')}
          </div>
        {/if}
        {#if validity.tooShort}
          {@const { minlength } = (() => /** @type {StringField | TextField} */ (fieldConfig))()}
          <div role="none">
            <Icon name="error" />
            {$_(minlength === 1 ? 'validation.too_short.one' : 'validation.too_short.many', {
              values: { min: minlength },
            })}
          </div>
        {/if}
        {#if validity.tooLong}
          {@const { maxlength } = (() => /** @type {StringField | TextField} */ (fieldConfig))()}
          <div role="none">
            <Icon name="error" />
            {$_(maxlength === 1 ? 'validation.too_long.one' : 'validation.too_long.many', {
              values: { max: maxlength },
            })}
          </div>
        {/if}
        {#if validity.rangeUnderflow}
          <div role="none">
            <Icon name="error" />
            {#if (widgetName === 'list' && hasSubFields) || multiple}
              {$_(`validation.range_underflow.add_${min === 1 ? 'one' : 'many'}`, {
                values: { min },
              })}
            {:else}
              {$_(`validation.range_underflow.select_${min === 1 ? 'one' : 'many'}`, {
                values: { min },
              })}
            {/if}
          </div>
        {/if}
        {#if validity.rangeOverflow}
          <div role="none">
            <Icon name="error" />
            {#if (widgetName === 'list' && hasSubFields) || multiple}
              {$_(`validation.range_overflow.add_${max === 1 ? 'one' : 'many'}`, {
                values: { max },
              })}
            {:else}
              {$_(`validation.range_overflow.select_${max === 1 ? 'one' : 'many'}`, {
                values: { max },
              })}
            {/if}
          </div>
        {/if}
        {#if validity.patternMismatch}
          <div role="none">
            <Icon name="error" />
            {pattern?.[1] ?? ''}
          </div>
        {/if}
        {#if validity.typeMismatch}
          <div role="none">
            <Icon name="error" />
            {$_(`validation.type_mismatch.${type}`)}
          </div>
        {/if}
      {/if}
    </div>
    <div role="none" class="widget-wrapper" class:has-extra-labels={hasExtraLabels}>
      {#if !(widgetName in editors)}
        <div role="none">{$_('unsupported_widget_x', { values: { name: widgetName } })}</div>
      {:else if isList}
        {@const Editor = editors[widgetName]}
        <Editor
          {locale}
          {keyPath}
          {fieldId}
          {fieldLabel}
          {fieldConfig}
          {currentValue}
          {readonly}
          {required}
          {invalid}
        />
      {:else}
        {#if beforeInputLabel}
          <div role="none" class="before-input">{@html sanitize(beforeInputLabel)}</div>
        {/if}
        {#if prefix}
          <div role="none" class="prefix">{prefix}</div>
        {/if}
        {@const Editor = editors[widgetName]}
        <Editor
          {locale}
          {keyPath}
          {fieldId}
          {fieldLabel}
          {fieldConfig}
          bind:currentValue={$entryDraft.currentValues[locale][keyPath]}
          {readonly}
          {required}
          {invalid}
        />
        {#if suffix}
          <div role="none" class="suffix">{suffix}</div>
        {/if}
        {#if afterInputLabel}
          <div role="none" class="after-input">{@html sanitize(afterInputLabel)}</div>
        {/if}
      {/if}
    </div>
    {#if !readonly && (hint || $extraHint)}
      <div role="none" class="footer">
        {#if hint}
          <p class="hint">{@html sanitize(hint)}</p>
        {/if}
        <svelte:component this={$extraHint} {fieldConfig} {currentValue} />
      </div>
    {/if}
  </section>
{/if}

<style lang="scss">
  @keyframes highlight {
    50% {
      opacity: 0.2;
    }
  }

  section {
    padding: 16px;

    &:not(:last-child) {
      border-width: 0 0 1px;
      border-color: var(--sui-secondary-border-color);
    }

    & > * {
      margin-right: auto;
      margin-left: auto;
      max-width: 768px;
    }

    &:global(.highlight) {
      @media (prefers-reduced-motion) {
        outline-width: 4px !important;
        outline-color: var(--sui-primary-accent-color-translucent);
        outline-offset: -4px;
      }
    }

    &:global(.highlight > *) {
      animation: highlight 750ms 2;

      @media (prefers-reduced-motion) {
        animation: none;
      }
    }
  }

  header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    height: var(--sui-button-small-height);

    h4 {
      font-size: var(--sui-font-size-small);
      font-weight: 600;
      color: var(--sui-secondary-foreground-color);
    }

    .required {
      margin: 2px 0 0 2px;
      color: var(--sui-error-foreground-color);
      font-size: var(--sui-font-size-large);
    }
  }

  .validation {
    color: var(--sui-error-foreground-color);
    font-size: var(--sui-font-size-small);

    div {
      display: flex;
      gap: 4px;
      margin: 4px 0;

      :global(.icon) {
        flex: none;
        font-size: 16px; /* !hardcoded */
      }
    }
  }

  .widget-wrapper {
    &.has-extra-labels {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 4px;
    }

    :global(input[type='text']),
    :global(textarea) {
      width: 100%;
    }

    :global(input[type='color']),
    :global(input[type='number']) {
      outline: 0;
      border-width: 1px;
      border-color: var(--sui-primary-border-color);
      border-radius: var(--sui-control-medium-border-radius);
      height: var(--sui-button-medium-height);
      color: inherit;
      background-color: var(--sui-textbox-background-color);
    }

    :global(input[type='file']),
    :global(input[type='checkbox']),
    & > :global(div) {
      color: inherit;
    }

    :global(input[type='date']),
    :global(input[type='datetime-local']),
    :global(input[type='time']) {
      outline: 0;
      margin: var(--sui-focus-ring-width);
      border-width: var(--sui-textbox-border-width, 1px);
      border-color: var(--sui-primary-border-color);
      border-radius: var(--sui-control-medium-border-radius);
      padding: var(--sui-textbox-singleline-padding);
      width: auto;
      height: var(--sui-textbox-height);
      color: var(--sui-textbox-foreground-color);
      background-color: var(--sui-textbox-background-color);
      font-family: var(--sui-textbox-font-family);
      font-size: var(--sui-textbox-font-size);
      text-transform: uppercase;

      &:disabled {
        opacity: 0.4;
      }
    }

    :global(input[type='color'][aria-invalid='true']),
    :global(input[type='date'][aria-invalid='true']),
    :global(input[type='datetime-local'][aria-invalid='true']),
    :global(input[type='time'][aria-invalid='true']) {
      border-color: var(--sui-error-foreground-color);
    }
  }

  .before-input,
  .after-input,
  .prefix,
  .suffix {
    color: var(--sui-secondary-foreground-color);
    white-space: nowrap;
  }

  .comment {
    margin-block: 4px;
    line-height: var(--sui-line-height-compact);
  }

  .footer {
    display: flex;
    gap: 16px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .hint {
    flex: auto;
    margin: 0;
    font-size: var(--sui-font-size-small);
    line-height: var(--sui-line-height-compact);
    opacity: 0.75;
  }
</style>
