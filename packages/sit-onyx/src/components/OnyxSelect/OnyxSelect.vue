<script
  lang="ts"
  setup
  generic="
    TModelValue extends SelectOptionValue | SelectOptionValue[],
    TMultiple extends TModelValue extends any[] ? true : false | undefined,
    TValue extends TModelValue extends (infer TInner)[] ? TInner : TModelValue
  "
>
import { createComboBox, type ComboboxAutoComplete } from "@sit-onyx/headless";
import {
  computed,
  nextTick,
  ref,
  toRefs,
  useId,
  useTemplateRef,
  watch,
  watchEffect,
  type ComputedRef,
} from "vue";
import { useCheckAll } from "../../composables/checkAll.js";
import { useDensity } from "../../composables/density.js";
import { useScrollEnd } from "../../composables/scrollEnd.js";
import { useOpenDirection } from "../../composables/useOpenDirection.js";
import { SKELETON_INJECTED_SYMBOL } from "../../composables/useSkeletonState.js";
import { useVModel } from "../../composables/useVModel.js";
import { injectI18n } from "../../i18n/index.js";
import type { Nullable, SelectOptionValue } from "../../types/index.js";
import { asArray, groupByKey, transformGroupedData } from "../../utils/objects.js";
import { normalizedIncludes } from "../../utils/strings.js";
import OnyxEmpty from "../OnyxEmpty/OnyxEmpty.vue";
import { FORM_INJECTED_SYMBOL } from "../OnyxForm/OnyxForm.core.js";
import OnyxLoadingIndicator from "../OnyxLoadingIndicator/OnyxLoadingIndicator.vue";
import OnyxMiniSearch from "../OnyxMiniSearch/OnyxMiniSearch.vue";
import OnyxPopover from "../OnyxPopover/OnyxPopover.vue";
import OnyxSelectInput from "../OnyxSelectInput/OnyxSelectInput.vue";
import type { OnyxSelectInputProps } from "../OnyxSelectInput/types.js";
import OnyxSelectOption from "../OnyxSelectOption/OnyxSelectOption.vue";
import type { OnyxSelectProps, SelectOption } from "./types.js";

type Props = OnyxSelectProps<TModelValue, TMultiple, TValue>;

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  noFilter: false,
  skeleton: SKELETON_INJECTED_SYMBOL,
  showError: FORM_INJECTED_SYMBOL,
  requiredMarker: FORM_INJECTED_SYMBOL,
  disabled: FORM_INJECTED_SYMBOL,
  modelValue: undefined,
  readonly: false,
  truncation: "ellipsis",
  valueLabel: undefined,
  alignment: "full",
  open: undefined,
  keepSelectionOrder: false,
});

const emit = defineEmits<{
  /**
   * Emitted if lazy loading is triggered / the users scrolls to the end of the options.
   * See property `lazyLoading` for enabling the lazy loading.
   */
  lazyLoad: [];
  /**
   * Emitted when the validity state of the input changes.
   */
  validityChange: [validity: ValidityState];
  /**
   * Emitted when a search term is inputted
   */
  "update:searchTerm": [value: string];

  /**
   * Emitted when an option is selected
   */
  "update:modelValue": [value?: Nullable<TModelValue>];

  /**
   * Emitted when the open state changes
   */
  "update:open": [value: boolean];
}>();

const slots = defineSlots<{
  /**
   * Optional slot to customize the empty state when no options exist.
   * It is recommended to use the `<OnyxEmpty>` component here.
   *
   * If unset, a default translated message will be displayed for the current locale.
   */
  empty?(props: { defaultMessage: string }): unknown;
  /**
   * Optional slot that is displayed below all options that can be used
   * to e.g. show a button to load more options instead of lazy loading on scroll.
   */
  optionsEnd?(): unknown;
  /**
   * Optional slot to override the option content.
   */
  option?(props: SelectOption<TValue>): unknown;
}>();

const { t } = injectI18n();
const { densityClass } = useDensity(props);

/**
 * Value of the currently selected option or an array of values when the `multiple` prop is `true`.
 */ const modelValue = useVModel<TModelValue, "modelValue", Props, undefined>({
  props,
  emit,
  key: "modelValue",
});

/**
 * Value of the search input, when `withSearch` is `true`.
 *
 * Hint: Cover `valueLabel` to prevent the disappearance of the current selections label
 */
const searchTerm = useVModel<string, "searchTerm", Props, string>({
  props,
  emit,
  key: "searchTerm",
  default: "",
});

/**
 * If true, the select popover is expanded and visible.
 */
const open = useVModel<boolean, "open", Props, false>({
  props,
  emit,
  key: "open",
  default: false,
});

const select = useTemplateRef<HTMLElement>("selectRef");
const { openDirection, updateOpenDirection } = useOpenDirection(select);

/**
 * Currently (visually) active value.
 */
const activeValue = ref<TValue>();

/**
 * Current value but always as array (even if not multiselect) so it is easier
 * to work with it in a unified way.
 */
const arrayValue = computed(() => asArray(modelValue.value)) as ComputedRef<TValue[]>;

/**
 * Contains an array of labels that will be shown in the OnyxSelectInput.
 * - contains props.valueLabel as array if it is set
 * - else, contains all found labels of the options that match the current modelValue
 */
const selectionLabels = computed(() => {
  // given state
  if (props.valueLabel !== undefined) {
    return asArray(props.valueLabel);
  }
  // managed state
  return arrayValue.value.reduce<string[]>((acc, current) => {
    const foundLabel = props.options.find(({ value }) => value === current)?.label;
    if (foundLabel) acc.push(foundLabel);
    return acc;
  }, []);
});

const miniSearch = useTemplateRef("miniSearchRef");
const selectInput = useTemplateRef("selectInputRef");

const filteredOptions = computed(() => {
  // if onyx does not manage the search or no searchTerm is given, we don't filter the options further
  if (props.noFilter || !searchTerm.value) return props.options;

  return props.options.filter(({ label }: SelectOption) =>
    normalizedIncludes(label, searchTerm.value),
  );
});

/**
 * Sync the active option with the selected option on single select.
 */
watch(
  arrayValue,
  () => {
    if (!props.multiple) {
      activeValue.value = arrayValue.value.at(0);
    }
  },
  { immediate: true },
);

/** unique ID to identify the `select all` checkbox */
const CHECK_ALL_ID = useId() as TValue;

/**
 * IDs of all options that can be navigated with the keyboard.
 * Includes "select all" up front if it is used.
 */
const allKeyboardOptionIds = computed(() => {
  return (props.multiple && props.withCheckAll && !searchTerm.value ? [CHECK_ALL_ID] : []).concat(
    enabledOptionValues.value,
  );
});

const onToggle = async (preventFocus?: boolean) => {
  const groupedByKey = groupByKey<SelectOption<TValue>, "group">(
    getOptionsWithGroupForSelected(),
    "group",
  );

  if (props.keepSelectionOrder) {
    groupedOptions.value = transformGroupedData<SelectOption<TValue>, "group">(groupedByKey);
  } else {
    groupedOptions.value = transformGroupedData<SelectOption<TValue>, "group">(
      groupedByKey,
      t.value("selections.selectGroup"),
    );
  }

  if (props.readonly) {
    open.value = false;
    return;
  }
  const wasOpen = open.value;
  open.value = !wasOpen;
  await nextTick();

  if (open.value) updateOpenDirection();

  // if with managed `open` state after one tick the state was not updated,
  // we don't modify our focus state, because we assume that
  // the owner did not update `open` on purpose
  if (wasOpen !== open.value) {
    if (wasOpen) {
      if (searchTerm.value) searchTerm.value = "";
      if (!preventFocus) selectInput.value?.input?.focus();
    } else {
      // make sure search is focused after the flyout opened
      miniSearch.value?.focus();
    }
  }
};

const onActivateFirst = () => (activeValue.value = allKeyboardOptionIds.value.at(0));
const onActivateLast = () => (activeValue.value = allKeyboardOptionIds.value.at(-1));

const onActivateNext = (currentValue: TValue) => {
  const currentIndex = allKeyboardOptionIds.value.findIndex((i) => i === currentValue);
  if (currentIndex < allKeyboardOptionIds.value.length - 1) {
    activeValue.value = allKeyboardOptionIds.value[currentIndex + 1];
  }
};

const onActivatePrevious = (currentValue: TValue) => {
  const currentIndex = allKeyboardOptionIds.value.findIndex((i) => i === currentValue);
  if (currentIndex > 0) activeValue.value = allKeyboardOptionIds.value[currentIndex - 1];
};

const onTypeAhead = (label: string) => {
  const firstMatch = filteredOptions.value.find((i) => {
    return i.label.toLowerCase().trim().startsWith(label.toLowerCase());
  });
  if (!firstMatch) return;
  activeValue.value = firstMatch.value;
};

const onAutocomplete = (inputValue: string) => (searchTerm.value = inputValue);

const onSelect = (selectedOption: TValue) => {
  if (selectedOption === CHECK_ALL_ID) {
    checkAll.value?.handleChange(!checkAll.value.state.value.modelValue);
    return;
  }
  const newValue = filteredOptions.value.find(({ value }) => value === selectedOption);
  if (!newValue) {
    return;
  }
  if (!props.multiple) {
    modelValue.value = selectedOption as unknown as TModelValue;
    return;
  }

  // add or remove value depending on whether its already selected
  const alreadyInList = arrayValue.value.some((value) => value === selectedOption);
  if (alreadyInList) {
    modelValue.value = arrayValue.value.filter(
      (value) => value !== selectedOption,
    ) as unknown as TModelValue;
  } else {
    modelValue.value = [...arrayValue.value, selectedOption] as unknown[] as TModelValue;
  }
};

const autocomplete = computed<ComboboxAutoComplete>(() => (props.withSearch ? "list" : "none"));

const { label, listLabel, listDescription, multiple } = toRefs(props);

const {
  elements: { input, option: headlessOption, group: headlessGroup, listbox },
} = createComboBox({
  autocomplete,
  label,
  listLabel,
  listDescription,
  multiple,
  activeOption: computed(() => activeValue.value),
  isExpanded: open,
  templateRef: select,
  onToggle,
  onActivateFirst,
  onActivateLast,
  onActivateNext,
  onActivatePrevious,
  onTypeAhead,
  onAutocomplete,
  onSelect,
});

const getOptionsWithGroupForSelected = () => {
  if (
    props.keepSelectionOrder ||
    !modelValue.value ||
    !Array.isArray(modelValue.value) ||
    modelValue.value.length == 0
  ) {
    return filteredOptions.value;
  }
  const selectedValues = new Set(modelValue.value as TValue[]);

  return filteredOptions.value.map((option) => ({
    ...option,
    group: selectedValues.has(option.value) ? t.value("selections.selectGroup") : option.group,
  }));
};

const groupedOptions = ref<{ name: string; items: SelectOption<TValue>[] }[]>();

const { vScrollEnd, isScrollEnd } = useScrollEnd({
  enabled: computed(() => props.lazyLoading?.enabled ?? false),
  loading: computed(() => props.loading),
  offset: computed(() => props.lazyLoading?.scrollOffset),
});

const isEmptyMessage = computed(() => {
  if (filteredOptions.value.length) return;
  if (props.withSearch && searchTerm.value) return t.value("select.noMatch");
  return t.value("select.empty");
});

const enabledOptionValues = computed(() =>
  filteredOptions.value.filter((i) => !i.disabled).map(({ value }) => value),
);

/**
 * State and click callback for the `select all` checkbox.
 * Only available when multiple and withCheckAll are set.
 */
const checkAll = computed(() => {
  if (!props.multiple || !props.withCheckAll) return undefined;
  return useCheckAll(enabledOptionValues, arrayValue, (newValues: TValue[]) => {
    // with selectedOptions we verify that the options all still exist
    const selectedOptions: TValue[] = newValues
      .map((v) => props.options.find(({ value }) => value === v)?.value)
      .filter((option): option is NonNullable<typeof option> => option != undefined);
    modelValue.value = selectedOptions as unknown[] as TModelValue;
  });
});

const checkAllLabel = computed<string>(() => {
  if (!props.multiple) {
    return "";
  }
  const defaultText = t.value("selections.selectAll");
  if (typeof props.withCheckAll === "boolean") return defaultText;
  return props.withCheckAll?.label ?? defaultText;
});

watchEffect(() => {
  if (isScrollEnd.value) emit("lazyLoad");
});

const selectInputProps = computed(() => {
  const baseProps: OnyxSelectInputProps = {
    ...props,
    open: undefined, // needed to prevent hydration mismatch in SSR when open prop is MANAGED_SYMBOL
    modelValue: selectionLabels.value,
  };
  if (props.withSearch) return { ...baseProps, onKeydown: input.value.onKeydown };
  return { ...baseProps, ...input.value };
});

defineExpose({ input: computed(() => selectInput.value?.input) });
watch(
  [filteredOptions],
  () => {
    const groupedByKey = groupByKey<SelectOption<TValue>, "group">(
      getOptionsWithGroupForSelected(),
      "group",
    );

    if (props.keepSelectionOrder) {
      groupedOptions.value = transformGroupedData<SelectOption<TValue>, "group">(groupedByKey);
    } else {
      groupedOptions.value = transformGroupedData<SelectOption<TValue>, "group">(
        groupedByKey,
        t.value("selections.selectGroup"),
      );
    }
  },

  { deep: true, immediate: true },
);
</script>

<template>
  <div ref="selectRef" class="onyx-component onyx-select-wrapper">
    <OnyxPopover
      :class="densityClass"
      :label="props.listLabel"
      :position="openDirection"
      :alignment="props.alignment === 'full' ? 'center' : props.alignment"
      :fit-parent="props.alignment === 'full'"
      :open="open"
    >
      <template #default>
        <OnyxSelectInput
          ref="selectInputRef"
          v-bind="selectInputProps"
          :show-focus="open"
          :autofocus="props.autofocus"
          @input-click="onToggle"
          @validity-change="emit('validityChange', $event)"
        />
      </template>
      <template #content>
        <div v-scroll-end class="onyx-select__wrapper" tabindex="-1">
          <!-- model-value is set here, as it is written by the onAutocomplete callback -->
          <OnyxMiniSearch
            v-if="props.withSearch"
            ref="miniSearchRef"
            autofocus
            :model-value="searchTerm"
            v-bind="input"
            :label="t('select.searchInputLabel')"
            class="onyx-select__search"
            @clear="searchTerm = ''"
          />

          <div v-bind="listbox">
            <ul v-if="isEmptyMessage" role="group" class="onyx-select__group">
              <li role="option" aria-selected="false">
                <slot name="empty" :default-message="isEmptyMessage">
                  <OnyxEmpty :density="props.density">{{ isEmptyMessage }}</OnyxEmpty>
                </slot>
              </li>
            </ul>

            <template v-else>
              <!-- select-all option for "multiple" -->
              <ul
                v-if="props.multiple && props.withCheckAll && !searchTerm"
                class="onyx-select__check-all"
                v-bind="headlessGroup({ label: checkAllLabel })"
              >
                <OnyxSelectOption
                  v-bind="
                    headlessOption({
                      value: CHECK_ALL_ID as TValue,
                      label: checkAllLabel,
                      // TODO: remove type cast once its fixed in Vue / vue-tsc version
                      selected: checkAll?.state.value.modelValue,
                    })
                  "
                  multiple
                  :active="CHECK_ALL_ID === activeValue"
                  :indeterminate="checkAll?.state.value.indeterminate"
                  :density="props.density"
                >
                  {{ checkAllLabel }}
                </OnyxSelectOption>
              </ul>

              <!-- TODO: remove type cast once its fixed in Vue / vue-tsc version -->
              <ul
                v-for="group in groupedOptions"
                :key="group.name"
                class="onyx-select__group"
                v-bind="headlessGroup({ label: group.name })"
              >
                <li
                  v-if="group.name !== ''"
                  role="presentation"
                  class="onyx-select__group-name onyx-text--small"
                >
                  {{ group.name }}
                </li>
                <OnyxSelectOption
                  v-for="option in group.items"
                  :key="option.value.toString()"
                  v-bind="
                    headlessOption({
                      value: option.value,
                      label: option.label,
                      disabled: option.disabled,
                      selected: arrayValue.some((value: TValue) => value === option.value),
                    })
                  "
                  :multiple="props.multiple"
                  :active="option.value === activeValue"
                  :icon="option.icon"
                  :density="props.density"
                  :truncation="option.truncation ?? props.truncation"
                >
                  <slot name="option" v-bind="option">
                    {{ option.label }}
                  </slot>
                </OnyxSelectOption>
              </ul>
            </template>
          </div>

          <div v-if="props.lazyLoading?.loading" class="onyx-select__slot">
            <OnyxLoadingIndicator class="onyx-select__loading" />
          </div>

          <div v-if="slots.optionsEnd" class="onyx-select__slot">
            <slot name="optionsEnd"></slot>
          </div>
        </div>
        <div v-if="props.listDescription" class="onyx-select__description onyx-text--small">
          {{ props.listDescription }}
        </div>
      </template>
    </OnyxPopover>
  </div>
</template>

<style lang="scss">
@use "../../styles/mixins/layers";
@use "../../styles/mixins/list";

.onyx-select-wrapper {
  @include layers.component() {
    --max-flyout-height: 20rem;
    position: relative;
    height: max-content;
  }
  .onyx-select-input {
    width: 100%;
  }
  .onyx-popover {
    width: 100%;
  }
}

.onyx-select {
  @include layers.component() {
    @include list.styles();

    &--open {
      visibility: visible;
      opacity: 1;
    }

    &__search {
      position: sticky;
      top: 0;
      border-bottom: var(--onyx-1px-in-rem) solid var(--onyx-color-component-border-neutral);
    }

    &__wrapper {
      margin: var(--onyx-spacing-2xs) 0;
      width: 100%;
      .onyx-empty {
        max-width: 100%;
      }
    }
    &:has(&__wrapper:focus-visible) {
      outline: var(--onyx-outline-width) solid var(--onyx-color-component-focus-primary);
    }

    &__wrapper:has(.onyx-mini-search) {
      // Add scroll padding, so items are not hidden beneath the search input
      // var(--onyx-density-xs) = vertical padding of select option
      scroll-padding-top: calc(1lh + 2 * var(--onyx-density-xs));
    }

    // if a group name is below a search field or a "Select all" option,
    // there needs to be spacing between them.
    &__wrapper:has(.onyx-mini-search),
    &__wrapper:has(.onyx-select__check-all) {
      .onyx-select__group-name:first-child {
        margin-top: var(--onyx-density-xs);
      }
    }

    &__slot {
      padding: 0 var(--onyx-density-sm);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    &__loading {
      color: var(--onyx-color-text-icons-primary-intense);
    }

    &__description {
      display: flex;
      width: 100%;
      padding: var(--onyx-density-3xs) var(--onyx-density-sm);
      justify-content: flex-end;
      text-align: right;
      align-items: center;
      gap: var(--onyx-spacing-md);
      color: var(--onyx-color-text-icons-neutral-soft);
    }

    &:has(.onyx-select__description) {
      padding-bottom: 0;
    }
  }
}
</style>
