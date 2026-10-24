<script lang="ts">
	import { editor, ui, Track, Invalidate } from "../state.svelte";
	import { BuildMenus, type MenuItem } from "../menus";
	import { UI_Str } from "../../editor/i18n";
	import { DifficultyTypeNames } from "../../editor/chart";
	import { Engine } from "../../audio/engine";
	import MenuList from "./MenuList.svelte";

	let openMenu = $state(-1);
	const menus = $derived.by(() => { Track(); return BuildMenus(); });

	const courses = $derived.by(() =>
	{
		Track();
		return editor.context.Chart.Courses.map((course) => ({ course, label: `${UI_Str(DifficultyTypeNames[course.Type] ?? "")} x${course.Level} (${UI_Str("Single")})`, selected: course === editor.context.ChartSelectedCourse }));
	});

	const audioText = $derived.by(() =>
	{
		Track();
		if (!Engine.GetIsStreamOpenRunning()) return "[ Audio Device Closed ]";
		return `[ ${(Engine.GetSampleRate() / 1000).toFixed(1)}kHz ~${(Engine.GetOutputLatency() * 1000).toFixed(0)}ms Web Audio ]`;
	});

	function onWindowPointerDown(e: PointerEvent): void
	{
		if (openMenu >= 0 && !(e.target as HTMLElement).closest(".menu-bar"))
			openMenu = -1;
	}

	function activate(item: MenuItem): void
	{
		if (item.Enabled === false || item.Action === undefined) return;
		openMenu = -1;
		item.Action();
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={(e) => { if (e.key === "Escape") openMenu = -1; }} />

<nav class="menu-bar">
	{#each menus as menu, i}
		<div class="menu">
			<button class="menu-title" class:open={openMenu === i}
				onclick={() => (openMenu = (openMenu === i) ? -1 : i)}
				onpointerenter={() => { if (openMenu >= 0) openMenu = i; }}>{menu.Label}</button>
			{#if openMenu === i}
				<MenuList items={menu.Items} onactivate={activate} />
			{/if}
		</div>
	{/each}

	<span class="separator"></span>
	<div class="course-tabs">
		{#each courses as it}
			<button class="course-tab" class:selected={it.selected} onclick={() => { editor.SelectCourse(it.course); Invalidate(); }}>{it.label}</button>
		{/each}
	</div>

	<span class="spacer"></span>
	<button class="menu-title info" onclick={() => { if (Engine.GetIsStreamOpenRunning()) Engine.StopCloseStream(); else Engine.OpenStartStream(); setTimeout(Invalidate, 100); }}
		title={Engine.GetIsStreamOpenRunning() ? UI_Str("Close Audio Device") : UI_Str("Open Audio Device")}>{audioText}</button>
	<span class="menu-title info fps">[ {(1000 / Math.max(1, ui.fps)).toFixed(3)} ms ({ui.fps.toFixed(1)} FPS) ]</span>
</nav>

<style>
	.menu-bar { display: flex; align-items: stretch; background: var(--menubar); height: 26px; flex: none; position: relative; z-index: 50; user-select: none; }
	.menu { position: relative; }
	.menu-title { height: 100%; background: transparent; border: none; border-radius: 0; padding: 0 9px; color: var(--text); white-space: nowrap; }
	.menu-title:hover, .menu-title.open { background: var(--header-hover); }
	.separator { width: 1px; background: var(--separator); margin: 3px 4px; }
	.spacer { flex: 1; }
	.course-tabs { display: flex; overflow-x: auto; scrollbar-width: none; }
	.course-tab { background: var(--tab); border: none; border-radius: 0; padding: 0 12px; white-space: nowrap; margin-right: 1px; }
	.course-tab:hover { background: var(--header-active); }
	.course-tab.selected { background: var(--header-hover); }
	.info { font-variant-numeric: tabular-nums; font-size: 0.92em; display: flex; align-items: center; }
	.fps { color: var(--text-dim); }
</style>
