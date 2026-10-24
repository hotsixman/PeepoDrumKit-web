<script lang="ts" module>
	import type { Component } from "svelte";
	import type { FocusOwner } from "../../editor/input";
	export interface Tab { ID: string; Label: string; Component: Component; Closable?: () => void; FocusOwner?: FocusOwner; }
</script>

<script lang="ts">
	import { Input } from "../../editor/input";
	let { tabs, active = $bindable("") }: { tabs: Tab[]; active?: string } = $props();

	const current = $derived(tabs.find((t) => t.ID === active) ?? tabs[0]);
</script>

<div class="tab-panel" role="presentation" onpointerdown={() => { Input.FocusOwner = current?.FocusOwner ?? "other"; }}>
	<div class="tab-bar">
		{#each tabs as tab}
			<button class="tab" class:active={tab === current} onclick={() => (active = tab.ID)}>
				{tab.Label}
				{#if tab.Closable}
					<span class="close" role="button" tabindex="-1" onclick={(e) => { e.stopPropagation(); tab.Closable?.(); }} onkeydown={() => {}}>✕</span>
				{/if}
			</button>
		{/each}
	</div>
	<div class="tab-content">
		{#if current}
			{#key current.ID}
				<current.Component />
			{/key}
		{/if}
	</div>
</div>

<style>
	.tab-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; background: var(--window); border: 1px solid var(--border); }
	.tab-bar { display: flex; flex: none; background: var(--title); overflow-x: auto; scrollbar-width: none; }
	.tab { background: var(--tab); border: none; border-radius: 0; padding: 3px 10px; margin-right: 1px; white-space: nowrap; display: flex; gap: 6px; align-items: center; }
	.tab:hover { background: var(--tab-hover); }
	.tab.active { background: var(--tab-active); }
	.close { opacity: 0.6; font-size: 0.8em; }
	.close:hover { opacity: 1; }
	.tab-content { flex: 1; min-height: 0; overflow: hidden; position: relative; }
	.tab-content > :global(*) { height: 100%; }
</style>
