<script lang="ts" setup>
import { computed, inject } from "vue";
import { MOBILE_NAV_BAR_INJECTION_KEY } from "../OnyxNavBar/types.js";
import type { OnyxSeparatorProps } from "./types.js";

const props = withDefaults(defineProps<OnyxSeparatorProps>(), {
  orientation: "horizontal",
});

// using explicit "undefined" fallback value here to avoid "cannot find symbol" console warning
const isMobileNavBar = inject(MOBILE_NAV_BAR_INJECTION_KEY, undefined);

const isVertical = computed(() => {
  return props.orientation === "vertical" && !isMobileNavBar?.value;
});
</script>

<template>
  <div
    class="onyx-component onyx-separator"
    :class="{ 'onyx-separator--vertical': isVertical }"
    role="separator"
    :aria-orientation="props.orientation"
  ></div>
</template>

<style lang="scss">
@use "../../styles/mixins/layers";

.onyx-separator {
  @include layers.component() {
    --onyx-separator-size: var(--onyx-1px-in-rem);
    --onyx-separator-min-size: 2rem;
    background-color: var(--onyx-color-component-border-neutral);
    height: var(--onyx-separator-size);
    min-width: var(--onyx-separator-min-size);

    &--vertical {
      width: var(--onyx-separator-size);
      min-width: unset;
      min-height: var(--onyx-separator-min-size);
      height: initial;
      max-height: 100%;
    }
  }
}
</style>
