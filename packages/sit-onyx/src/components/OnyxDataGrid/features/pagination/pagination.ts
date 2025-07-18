import { computed, h, ref, toRef, toValue, watch, type Ref } from "vue";
import { useScrollEnd } from "../../../../composables/scrollEnd.js";
import { applyLimits } from "../../../../utils/numbers.js";
import OnyxLoadingDots from "../../../OnyxLoadingIndicator/OnyxLoadingDots.vue";
import OnyxPagination from "../../../OnyxPagination/OnyxPagination.vue";
import OnyxSystemButton from "../../../OnyxSystemButton/OnyxSystemButton.vue";
import { DataGridRowOptionsSymbol, type DataGridEntry } from "../../types.js";
import { FILTERING_MUTATION_ORDER } from "../filtering/filtering.js";
import { createFeature, useFeatureContext } from "../index.js";
import { createTypeRenderer } from "../renderer.js";
import { SELECTION_MUTATION_ORDER } from "../selection/selection.js";
import "./pagination.scss";
import type { PaginationOptions, PaginationState } from "./types.js";

export const PAGINATION_FEATURE = Symbol("Pagination");
export const LAZY_LOADING_ROW_ID = Symbol("LazyLoadingRow");
export const LAZY_LOADING_TYPE_RENDERER = Symbol("LazyLoadingRenderer");
export const BUTTON_LOADING_ROW_ID = Symbol("ButtonLoadingRow");
export const BUTTON_LOADING_TYPE_RENDERER = Symbol("ButtonLoadingRenderer");
export const PAGINATION_MUTATION_ORDER =
  Math.min(FILTERING_MUTATION_ORDER, SELECTION_MUTATION_ORDER) - 1;

export const usePagination = (options: PaginationOptions = {}) =>
  createFeature((ctx) => {
    const state = toRef(
      options?.paginationState ?? { current: 1, pages: 1, pageSize: options?.pageSize ?? 25 },
    ) as Ref<PaginationState>;

    const { isEnabled, isAsync } = useFeatureContext(ctx, options);
    const isDisabled = computed(() => options.disabled?.value ?? false);
    const shouldShowPagination = computed(
      () => state.value.pages > 1 || state.value.current > state.value.pageSize,
    );
    const isLastPage = computed(() => state.value.current >= state.value.pages);
    const loading = computed(() => options.loading?.value ?? false);

    const type = options.type ?? "select";
    const scrollContainer = ref<HTMLElement>();

    const { vScrollEnd, isScrollEnd } = useScrollEnd({
      enabled: computed(() => type === "lazy" && !isLastPage.value && !toValue(options.disabled)),
      loading,
    });

    watch(isScrollEnd, (isEnd) => {
      if (!isEnd) return;
      state.value.current++;
    });

    watch(scrollContainer, () => {
      if (!scrollContainer.value) return;
      vScrollEnd.mounted(scrollContainer.value);
    });

    return {
      name: PAGINATION_FEATURE,
      watch: [state, isEnabled, isAsync, isDisabled, ctx.skeleton, isScrollEnd, loading],
      mutation: {
        order: PAGINATION_MUTATION_ORDER,
        func: (entries) => {
          if (!isEnabled.value()) return entries;

          let _entries = entries.slice();

          if (!isAsync.value) {
            state.value.pages = Math.ceil(_entries.length / state.value.pageSize);
            state.value.current = applyLimits(state.value.current, 1, state.value.pages);

            let startIndex = (state.value.current - 1) * state.value.pageSize;
            const endIndex = startIndex + state.value.pageSize;
            if (type !== "select") startIndex = 0;

            _entries = _entries.slice(startIndex, endIndex);
          }

          if (type === "lazy" && loading.value) {
            _entries.push({
              id: LAZY_LOADING_ROW_ID,
              [DataGridRowOptionsSymbol]: {
                columns: [{ key: "id", type: { name: LAZY_LOADING_TYPE_RENDERER } }],
              },
            } satisfies DataGridEntry);
          }

          if (type === "button" && (!isLastPage.value || loading.value)) {
            _entries.push({
              id: BUTTON_LOADING_ROW_ID,
              [DataGridRowOptionsSymbol]: {
                columns: [{ key: "id", type: { name: BUTTON_LOADING_TYPE_RENDERER } }],
              },
            } satisfies DataGridEntry);
          }

          return _entries;
        },
      },
      typeRenderer: {
        [LAZY_LOADING_TYPE_RENDERER]: createTypeRenderer({
          cell: {
            tdAttributes: {
              class: "onyx-data-grid__lazy-pagination",
              colspan: 99,
            },
            component: () => h(OnyxLoadingDots),
          },
        }),
        [BUTTON_LOADING_TYPE_RENDERER]: createTypeRenderer({
          cell: {
            tdAttributes: {
              class: "onyx-data-grid__button-pagination",
              colspan: 99,
            },
            component: () => {
              if (loading.value) return h(OnyxLoadingDots);

              return h(OnyxSystemButton, {
                label: ctx.i18n.t.value("dataGrid.loadMore"),
                color: "medium",
                disabled: toValue(options.disabled),
                onClick: () => state.value.current++,
              });
            },
          },
        }),
      },
      slots: {
        pagination: () => {
          if (!isEnabled.value() || type !== "select") return [];
          const skeleton = ctx.skeleton.value && !shouldShowPagination.value;
          if (!shouldShowPagination.value && !skeleton) return [];

          return [
            h(OnyxPagination, {
              modelValue: state.value.current,
              pages: state.value.pages,
              disabled: isDisabled.value,
              skeleton,
              "onUpdate:modelValue": (newPage) => (state.value.current = newPage),
            }),
          ];
        },
      },
      scrollContainerAttributes: () => ({
        ref: (el) => {
          scrollContainer.value = el as typeof scrollContainer.value;
        },
      }),
    };
  });
