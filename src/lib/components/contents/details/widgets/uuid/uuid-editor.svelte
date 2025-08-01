<!--
  @component
  Implement the editor for the UUID widget.
  @see https://decapcms.org/docs/widgets/#uuid
-->
<script>
  import { TextInput } from '@sveltia/ui';
  import { onMount } from 'svelte';

  import { entryDraft } from '$lib/services/contents/draft';
  import { DEFAULT_I18N_CONFIG } from '$lib/services/contents/i18n/config';
  import { getInitialValue } from '$lib/services/contents/widgets/uuid/helper';

  /**
   * @import { WidgetEditorProps } from '$lib/types/private';
   * @import { UuidField } from '$lib/types/public';
   */

  /**
   * @typedef {object} Props
   * @property {UuidField} fieldConfig Field configuration.
   * @property {string | undefined} currentValue Field value.
   */

  /** @type {WidgetEditorProps & Props} */
  let {
    /* eslint-disable prefer-const */
    locale,
    fieldId,
    fieldConfig,
    currentValue = $bindable(),
    required = true,
    readonly = false,
    invalid = false,
    /* eslint-enable prefer-const */
  } = $props();

  const collection = $derived($entryDraft?.collection);
  const collectionFile = $derived($entryDraft?.collectionFile);
  const { defaultLocale } = $derived((collectionFile ?? collection)?._i18n ?? DEFAULT_I18N_CONFIG);

  // Generate the default value here instead of in `create.js` because `getDefaultValues()` doesn’t
  // i18n-duplicate the value
  onMount(() => {
    if (!currentValue) {
      if (locale === defaultLocale || [true, 'translate'].includes(fieldConfig?.i18n ?? false)) {
        currentValue = getInitialValue(fieldConfig);
      }
    }
  });
</script>

<TextInput
  bind:value={currentValue}
  flex
  readonly={readonly || fieldConfig.read_only !== false}
  {required}
  {invalid}
  aria-labelledby="{fieldId}-label"
  aria-errormessage="{fieldId}-error"
/>
