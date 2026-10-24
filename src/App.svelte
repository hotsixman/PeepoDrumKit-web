<script lang="ts">
	import { editor, ui, Invalidate } from "./ui/state.svelte";
	import { Input } from "./editor/input";
	import { Settings, PersistentApp } from "./editor/settings";
	import { SetGuiLanguage, DetectDefaultGuiLanguage, GuiLanguageCodes, GuiLanguage, UI_Str } from "./editor/i18n";
	import DesktopLayout from "./ui/layout/DesktopLayout.svelte";
	import MobileLayout from "./ui/layout/MobileLayout.svelte";
	import ConfirmDialog from "./ui/layout/ConfirmDialog.svelte";

	// NOTE: Restore the last used gui language
	{
		const index = GuiLanguageCodes.indexOf(PersistentApp.LastSession.GuiLanguage as (typeof GuiLanguageCodes)[number]);
		SetGuiLanguage((index >= 0) ? index as GuiLanguage : DetectDefaultGuiLanguage());
	}

	let chartInput: HTMLInputElement | undefined = $state();
	let folderInput: HTMLInputElement | undefined = $state();
	let audioInput: HTMLInputElement | undefined = $state();
	let dragOver = $state(false);

	// NOTE: Automatic layout selection (small screens or coarse pointers use the mobile layout)
	let autoMobile = $state(false);
	$effect(() =>
	{
		const query = window.matchMedia("(max-width: 820px), (pointer: coarse) and (max-width: 1100px)");
		const update = () => { autoMobile = query.matches; };
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});
	const isMobile = $derived(ui.layout === "mobile" || (ui.layout === "auto" && autoMobile));
	$effect(() => { ui.isMobile = isMobile; });

	// NOTE: Collect all bound keys so that the browser default actions (Ctrl+S, Ctrl+O, ...) can be prevented
	Input.PreventDefaultFilter = (e: KeyboardEvent) =>
	{
		if (editor.PendingConfirmation !== null) return false;
		const ctrl = e.ctrlKey || e.metaKey;
		if (!ctrl && !e.altKey && Input.FocusOwner !== "timeline" && Input.FocusOwner !== "tempoCalculator") return false;
		for (const binding of Object.values(Settings.Input))
			for (const slot of binding)
				if (slot.Key === e.code) return true;
		return false;
	};

	// NOTE: Main loop, everything canvas related is updated and drawn here every frame
	$effect(() =>
	{
		Input.Attach();
		editor.OnRequestOpenChartDialog = () => chartInput?.click();
		editor.OnRequestOpenAudioDialog = () => audioInput?.click();
		editor.OnRequestOpenFolderDialog = () => folderInput?.click();

		let raf = 0, lastTime = performance.now(), lastSignature = "", lastChartVersion = -1, lastTitle = "";
		let fpsAccumTime = 0, fpsFrames = 0;
		const frame = (now: number) =>
		{
			const dt = Math.min(Math.max((now - lastTime) / 1000.0, 0.0), 0.25);
			lastTime = now;

			Input.BeginFrame(dt);
			editor.Update();

			const signature = editor.ComputeUISignature();
			if (signature !== lastSignature) { lastSignature = signature; ui.version++; }
			if (editor.context.Undo.Version !== lastChartVersion) { lastChartVersion = editor.context.Undo.Version; ui.chartVersion++; }

			const title = editor.GetWindowTitle();
			if (title !== lastTitle) { document.title = title; lastTitle = title; }

			fpsAccumTime += dt; fpsFrames++;
			if (fpsAccumTime >= 0.5) { ui.fps = fpsFrames / fpsAccumTime; fpsAccumTime = 0; fpsFrames = 0; }

			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);

		const onBeforeUnload = (e: BeforeUnloadEvent) => { if (editor.context.Undo.HasPendingChanges) { e.preventDefault(); e.returnValue = ""; } };
		window.addEventListener("beforeunload", onBeforeUnload);

		return () => { cancelAnimationFrame(raf); Input.Detach(); window.removeEventListener("beforeunload", onBeforeUnload); editor.Dispose(); };
	});

	function onFilesPicked(input: HTMLInputElement | undefined): void
	{
		if (input === undefined || input.files === null) return;
		const files = [...input.files];
		input.value = "";
		void editor.OpenFiles(files).then(Invalidate);
	}

	function onDrop(e: DragEvent): void
	{
		e.preventDefault();
		dragOver = false;
		const files = [...(e.dataTransfer?.files ?? [])];
		if (files.length > 0) void editor.OpenFiles(files).then(Invalidate);
	}
</script>

<svelte:window
	ondragover={(e) => { e.preventDefault(); dragOver = true; }}
	ondragleave={(e) => { if (e.relatedTarget === null) dragOver = false; }}
	ondrop={onDrop}
/>

<div class="app" class:mobile={isMobile}>
	{#if isMobile}
		<MobileLayout />
	{:else}
		<DesktopLayout />
	{/if}
	<ConfirmDialog />
	{#if dragOver}
		<div class="drop-overlay">{UI_Str("Drop a .tja or audio file here")}</div>
	{/if}
</div>

<input bind:this={chartInput} type="file" multiple accept=".tja,audio/*,.ogg,.mp3,.wav,.flac,.m4a,.opus" hidden onchange={() => onFilesPicked(chartInput)} />
<input bind:this={folderInput} type="file" multiple hidden {...{ webkitdirectory: true }} onchange={() => onFilesPicked(folderInput)} />
<input bind:this={audioInput} type="file" accept="audio/*,.ogg,.mp3,.wav,.flac,.m4a,.opus" hidden onchange={() => { const file = audioInput?.files?.[0]; if (audioInput) audioInput.value = ""; if (file) void editor.SetAndStartLoadingChartSongFile(file).then(Invalidate); }} />

<style>
	.app { position: fixed; inset: 0; display: flex; flex-direction: column; }
	.drop-overlay { position: fixed; inset: 12px; border: 3px dashed var(--accent); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5em; background: rgba(20, 30, 20, 0.7); z-index: 200; pointer-events: none; }
</style>
