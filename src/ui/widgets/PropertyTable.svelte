<script lang="ts">
	import type { Snippet } from "svelte";
	let { children }: { children: Snippet } = $props();
</script>

<div class="property-table">{@render children()}</div>

<style>
	.property-table { display: grid; grid-template-columns: minmax(90px, 0.8fr) minmax(0, 1.2fr); border-top: 1px solid var(--border-light); }
	.property-table :global(> .prop-label), .property-table :global(> .prop-value) { padding: 3px 6px; border-bottom: 1px solid var(--border-light); min-width: 0; display: flex; align-items: center; }
	.property-table :global(> .prop-label) { border-right: 1px solid var(--border-light); overflow: hidden; }
	.property-table :global(> .prop-value) { flex-direction: column; align-items: stretch; gap: 2px; }
	.property-table :global(> .prop-value.row) { flex-direction: row; align-items: center; }
</style>
