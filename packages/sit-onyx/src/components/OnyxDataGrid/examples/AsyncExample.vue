<script setup lang="ts">
import { ref, watch } from "vue";
import {
  DataGridFeatures,
  normalizedIncludes,
  OnyxDataGrid,
  type ColumnConfig,
} from "../../../index.js";

/**
 * ====================
 * Basic datagrid setup
 * ====================
 */

type Entry = {
  id: number;
  name: string;
  age: number;
};

const EXAMPLE_DATA: Entry[] = Array.from({ length: 128 }, (_, index) => {
  const id = index + 1;
  return { id, name: `Name ${id}`, age: id };
});

const data = ref<Entry[]>([]);

const columns: ColumnConfig<Entry>[] = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age" },
];

/**
 * ====================
 * Async feature setup
 * ====================
 */

/** Whether the data is currently loading. */
const isLoading = ref(false);
watch(data, () => (isLoading.value = false)); // whenever the data changes, we turn off the loading state again

// Initialize datagrid states, which we want to observe to query an API with
const filterState = ref<DataGridFeatures.FilterState<Entry>>({});
const withFiltering = DataGridFeatures.useFiltering<Entry>({ filterState });

const sortState = ref<DataGridFeatures.SortState<Entry>>({ column: undefined, direction: "none" });
const withSorting = DataGridFeatures.useSorting<Entry>({ sortState });

const paginationState = ref<DataGridFeatures.PaginationState>({
  current: 1,
  pages: 1,
  pageSize: 25,
});
const withPagination = DataGridFeatures.usePagination({ paginationState });

const features = [withFiltering, withSorting, withPagination];

// initially and in case the sorting, filtering or pagination changes we simulate an API request
watch([filterState, sortState, () => paginationState.value.current], simulateAsyncUpdate, {
  deep: true,
  immediate: true,
});

/**
 * Simulate asynchronous data update from a backend.
 * This function simulates a delay when fetching data and applying filters, sorting and pagination.
 * It also sets the loading state while the data is being fetched.
 *
 * Note: You can ignore this function for the purpose if this example.
 * As this is a simplified example, requirements of real-world applications like error handling and edge cases are not considered.
 */
async function simulateAsyncUpdate() {
  isLoading.value = true;

  // simulate backend delay here
  await new Promise((resolve) => setTimeout(resolve, 1000));

  let copy = EXAMPLE_DATA.slice();

  // Filtering
  copy = copy.filter((e) =>
    Object.entries(filterState.value).every(([key, value]) =>
      normalizedIncludes(e[key as keyof Entry].toString(), value),
    ),
  );

  // Sorting
  const sortColumn = sortState.value.column;
  if (sortColumn) {
    const collator = new Intl.Collator();
    copy.sort((a, b) =>
      sortState.value.direction === "asc"
        ? collator.compare(a[sortColumn].toString(), b[sortColumn].toString())
        : collator.compare(b[sortColumn].toString(), a[sortColumn].toString()),
    );
  }

  // Pagination
  paginationState.value.pages = Math.ceil(copy.length / paginationState.value.pageSize);

  const startIndex = (paginationState.value.current - 1) * paginationState.value.pageSize;
  const endIndex = startIndex + paginationState.value.pageSize;
  copy = copy.slice(startIndex, endIndex);

  // Update data
  data.value = copy;
}
</script>

<template>
  <!-- Async is set to true, so that the features data transformation is disabled -->
  <OnyxDataGrid
    :headline="{ text: 'Example headline', rowCount: EXAMPLE_DATA.length }"
    async
    :columns
    :data
    :features
    :skeleton="isLoading"
  />
</template>
