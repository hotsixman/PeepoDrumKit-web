<script lang="ts">
	import type { Snippet } from "svelte";
	let { title, open = $bindable(true), children }: { title: string; open?: boolean; children: Snippet } = $props();
</script>

<section class="section">
	<button class="section-header" onclick={() => (open = !open)} aria-expanded={open}>
		<span class="arrow" class:open>▶</span>{title}
	</button>
	{#if open}
		<div class="section-body">{@render children()}</div>
	{/if}
</section>

<style>
	.section { display: flex; flex-direction: column; }
	.section-header { display: flex; align-items: center; gap: 6px; text-align: left; background: var(--header); border: none; border-radius: 0; padding: 4px 8px; font-weight: 600; }
	.section-header:hover { background: var(--header-hover); }
	.arrow { font-size: 0.7em; transition: transform 0.1s; display: inline-block; }
	.arrow.open { transform: rotate(90deg); }
	.section-body { padding: 4px 2px 8px 2px; }
</style>
