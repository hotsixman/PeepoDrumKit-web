<script lang="ts">
	import type { MenuItem } from "../menus";
	import MenuList from "./MenuList.svelte";

	let { items, onactivate, nested = false }: { items: MenuItem[]; onactivate: (item: MenuItem) => void; nested?: boolean } = $props();
	let openSubmenu = $state(-1);
</script>

<div class="menu-list" class:nested role="menu">
	{#each items as item, i}
		{#if item.Separator}
			<div class="menu-separator"></div>
		{:else}
			<div class="menu-entry" role="none" onpointerenter={() => (openSubmenu = (item.Submenu !== undefined && item.Enabled !== false) ? i : -1)}>
				<button class="menu-item" role="menuitem" disabled={item.Enabled === false} onclick={() => { if (item.Submenu !== undefined) openSubmenu = (openSubmenu === i) ? -1 : i; else onactivate(item); }}>
					<span class="check">{item.Checked ? "✓" : ""}</span>
					<span class="label">{item.Label}</span>
					<span class="shortcut">{item.Submenu !== undefined ? "▸" : (item.Shortcut ?? "")}</span>
				</button>
				{#if item.Submenu !== undefined && openSubmenu === i}
					<MenuList items={item.Submenu} {onactivate} nested />
				{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	.menu-list { position: absolute; top: 100%; left: 0; min-width: 240px; background: var(--popup); border: 1px solid var(--border); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55); padding: 3px 0; display: flex; flex-direction: column; z-index: 60; }
	.menu-list.nested { top: -4px; left: 100%; }
	.menu-entry { position: relative; }
	.menu-item { display: grid; grid-template-columns: 18px 1fr auto; gap: 6px; align-items: center; width: 100%; background: transparent; border: none; border-radius: 0; padding: 3px 10px 3px 4px; text-align: left; white-space: nowrap; }
	.menu-item:hover:not(:disabled) { background: var(--header-hover); }
	.menu-item:disabled { color: var(--text-dim); }
	.shortcut { color: var(--text-dim); padding-left: 24px; font-size: 0.92em; }
	.check { text-align: center; }
	.menu-separator { height: 1px; background: var(--separator); margin: 3px 0; }
</style>
