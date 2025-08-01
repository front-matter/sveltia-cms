<script>
  import { Menu, MenuButton, MenuItem, Spacer } from '@sveltia/ui';
  import { escapeRegExp } from '@sveltia/utils/string';
  import equal from 'fast-deep-equal';
  import DOMPurify from 'isomorphic-dompurify';
  import { marked } from 'marked';
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import { _ } from 'svelte-i18n';

  import CopyMenuItems from '$lib/components/contents/details/editor/copy-menu-items.svelte';
  import TranslateButton from '$lib/components/contents/details/editor/translate-button.svelte';
  import ValidationError from '$lib/components/contents/details/editor/validation-error.svelte';
  import { editors } from '$lib/components/contents/details/widgets';
  import { entryDraft } from '$lib/services/contents/draft';
  import { revertChanges } from '$lib/services/contents/draft/update/revert';
  import { isFieldRequired } from '$lib/services/contents/entry/fields';
  import { DEFAULT_I18N_CONFIG } from '$lib/services/contents/i18n/config';

  /**
   * @import { Component } from 'svelte';
   * @import { Writable } from 'svelte/store';
   * @import { InternalLocaleCode, WidgetContext } from '$lib/types/private';
   * @import {
   * BooleanField,
   * Field,
   * FieldKeyPath,
   * ListField,
   * NumberField,
   * RelationField,
   * SelectField,
   * StringField,
   * TextField,
   * } from '$lib/types/public';
   */

  /**
   * @typedef {object} Props
   * @property {InternalLocaleCode} locale Current pane’s locale.
   * @property {FieldKeyPath} keyPath Field key path.
   * @property {Field} fieldConfig Field configuration.
   * @property {WidgetContext} [context] Where the widget is rendered.
   */

  /** @type {Props} */
  let {
    /* eslint-disable prefer-const */
    locale,
    keyPath,
    fieldConfig,
    context = undefined,
    /* eslint-enable prefer-const */
  } = $props();

  const fieldId = $props.id();

  /**
   * Parse the given string as Markdown and sanitize the result to only allow certain tags.
   * @param {string} str Original string.
   * @returns {string} Sanitized string.
   */
  const sanitize = (str) =>
    DOMPurify.sanitize(/** @type {string} */ (marked.parseInline(str.replaceAll('\\n', '<br>'))), {
      ALLOWED_TAGS: ['strong', 'em', 'del', 'code', 'a', 'br'],
      ALLOWED_ATTR: ['href'],
    });

  /** @type {Writable<Component>} */
  const extraHint = writable();

  setContext('field-editor', { extraHint });

  const {
    name: fieldName,
    label = '',
    comment = '',
    hint = '',
    widget: widgetName = 'string',
    i18n = false,
    pattern = /** @type {string[]} */ ([]),
    readonly: readonlyOption = false,
  } = $derived(fieldConfig);
  const required = $derived(isFieldRequired({ fieldConfig, locale }));
  const {
    field: subField,
    fields: subFields,
    types,
  } = /** @type {ListField} */ ($derived(fieldConfig));
  const hasSubFields = $derived(!!subField || !!subFields || !!types);
  const { min, max } = /** @type {ListField | NumberField | RelationField | SelectField} */ (
    $derived(fieldConfig)
  );
  const type = $derived(
    // prettier-ignore
    widgetName === 'string'
      ? /** @type {StringField} */ (fieldConfig).type ?? 'text'
      : widgetName === 'number'
        ? 'number'
        : undefined,
  );
  const allowPrefix = $derived(['string'].includes(widgetName));
  const prefix = $derived(
    allowPrefix ? /** @type {StringField} */ (fieldConfig).prefix : undefined,
  );
  const suffix = $derived(
    allowPrefix ? /** @type {StringField} */ (fieldConfig).suffix : undefined,
  );
  const allowExtraLabels = $derived(['boolean', 'number', 'string'].includes(widgetName));
  const beforeInputLabel = $derived(
    allowExtraLabels
      ? /** @type {BooleanField | NumberField | StringField} */ (fieldConfig).before_input
      : undefined,
  );
  const afterInputLabel = $derived(
    allowExtraLabels
      ? /** @type {BooleanField | NumberField | StringField} */ (fieldConfig).after_input
      : undefined,
  );
  const hasExtraLabels = $derived(!!(prefix || suffix || beforeInputLabel || afterInputLabel));
  const hasMultiple = $derived(['relation', 'select'].includes(widgetName));
  const multiple = $derived(
    hasMultiple ? /** @type {RelationField | SelectField} */ (fieldConfig).multiple : undefined,
  );
  const canAddMultiValue = $derived(
    (widgetName === 'list' && hasSubFields) || multiple || widgetName === 'keyvalue',
  );
  const isList = $derived(widgetName === 'list' || (hasMultiple && multiple));
  const collection = $derived($entryDraft?.collection);
  const collectionFile = $derived($entryDraft?.collectionFile);
  const originalValues = $derived($entryDraft?.originalValues);
  const { i18nEnabled, allLocales, defaultLocale } = $derived(
    (collectionFile ?? collection)?._i18n ?? DEFAULT_I18N_CONFIG,
  );
  const otherLocales = $derived(i18nEnabled ? allLocales.filter((l) => l !== locale) : []);
  const canTranslate = $derived(i18nEnabled && (i18n === true || i18n === 'translate'));
  const canDuplicate = $derived(i18nEnabled && i18n === 'duplicate');
  const canEdit = $derived(locale === defaultLocale || canTranslate || canDuplicate);
  const keyPathRegex = $derived(new RegExp(`^${escapeRegExp(keyPath)}\\.\\d+$`));
  // Multiple values are flattened in the value map object
  const currentValue = $derived(
    isList
      ? Object.entries($state.snapshot($entryDraft?.currentValues[locale] ?? {}))
          .filter(([_keyPath]) => keyPathRegex.test(_keyPath))
          .map(([, val]) => val)
          .filter((val) => val !== undefined)
      : $state.snapshot($entryDraft?.currentValues[locale])?.[keyPath],
  );
  const originalValue = $derived(
    isList
      ? Object.entries(originalValues?.[locale] ?? {})
          .filter(([_keyPath]) => keyPathRegex.test(_keyPath))
          .map(([, val]) => val)
          .filter((val) => val !== undefined)
      : originalValues?.[locale]?.[keyPath],
  );
  const validity = $derived($entryDraft?.validities[locale][keyPath]);
  const fieldLabel = $derived(label || fieldName);
  const readonly = $derived(
    readonlyOption ||
      (i18n === 'duplicate' && locale !== defaultLocale) ||
      widgetName === 'compute',
  );
  const invalid = $derived(validity?.valid === false);
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
                    revertChanges({ locale, keyPath });
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
    {#if validity?.valid === false}
      <ValidationError id="{fieldId}-error">
        {#if validity.valueMissing}
          {$_('validation.value_missing')}
        {/if}
        {#if validity.tooShort}
          {@const { minlength } = (() => /** @type {StringField | TextField} */ (fieldConfig))()}
          {$_(minlength === 1 ? 'validation.too_short.one' : 'validation.too_short.many', {
            values: { min: minlength },
          })}
        {/if}
        {#if validity.tooLong}
          {@const { maxlength } = (() => /** @type {StringField | TextField} */ (fieldConfig))()}
          {$_(maxlength === 1 ? 'validation.too_long.one' : 'validation.too_long.many', {
            values: { max: maxlength },
          })}
        {/if}
        {#if validity.rangeUnderflow}
          {@const quantity = min === 1 ? 'one' : 'many'}
          {#if widgetName === 'number'}
            {$_('validation.range_underflow.number', { values: { min } })}
          {:else if canAddMultiValue}
            {$_(`validation.range_underflow.add_${quantity}`, { values: { min } })}
          {:else}
            {$_(`validation.range_underflow.select_${quantity}`, { values: { min } })}
          {/if}
        {/if}
        {#if validity.rangeOverflow}
          {@const quantity = max === 1 ? 'one' : 'many'}
          {#if widgetName === 'number'}
            {$_('validation.range_overflow.number', { values: { max } })}
          {:else if canAddMultiValue}
            {$_(`validation.range_overflow.add_${quantity}`, { values: { max } })}
          {:else}
            {$_(`validation.range_overflow.select_${quantity}`, { values: { max } })}
          {/if}
        {/if}
        {#if validity.patternMismatch}
          {pattern[1]}
        {/if}
        {#if validity.typeMismatch}
          {$_(`validation.type_mismatch.${type}`)}
        {/if}
      </ValidationError>
    {/if}
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
          {context}
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
          {context}
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
      {@const ExtraHint = $extraHint}
      <div role="none" class="footer">
        {#if hint}
          <p class="hint">{@html sanitize(hint)}</p>
        {/if}
        <ExtraHint {fieldConfig} {currentValue} />
      </div>
    {/if}
  </section>
{/if}

<style lang="scss">
  section {
    padding: var(--field-editor-padding);

    &:not(:last-child) {
      border-width: 0 0 1px;
      border-color: var(--sui-secondary-border-color);
    }

    & > :global(*) {
      margin-inline: auto !important;
      max-width: 768px;
    }
  }

  header {
    display: flex;
    align-items: center;
    margin: 0 -8px 8px;
    height: var(--sui-button-small-height);

    h4 {
      margin-inline: 8px 0;
      font-size: var(--sui-font-size-small);
      font-weight: var(--sui-font-weight-bold);
      color: var(--sui-secondary-foreground-color);
    }

    .required {
      margin: 2px 0 0 2px;
      color: var(--sui-error-foreground-color);
      font-size: var(--sui-font-size-large);
    }
  }

  .widget-wrapper {
    &.has-extra-labels {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 4px;
    }

    :global {
      :is(input[type='text'], textarea) {
        width: 100%;
      }

      input:is([type='color'], [type='number']) {
        outline: 0;
        border-width: 1px;
        border-color: var(--sui-primary-border-color);
        border-radius: var(--sui-control-medium-border-radius);
        height: var(--sui-button-medium-height);
        color: inherit;
        background-color: var(--sui-textbox-background-color);
      }

      input:is([type='file'], [type='checkbox']) {
        color: inherit;
      }

      & > div {
        color: inherit;
      }

      input:is([type='date'], [type='datetime-local'], [type='time']) {
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

      input[aria-invalid='true']:is(
          [type='color'],
          [type='date'],
          [type='datetime-local'],
          [type='time']
        ) {
        border-color: var(--sui-error-border-color);
      }

      input:read-only {
        // Make readonly inputs selectable
        -webkit-user-select: text;
        user-select: text;
        pointer-events: auto;
      }
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
