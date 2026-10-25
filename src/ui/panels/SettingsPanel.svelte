<script lang="ts">
	// NOTE: Replacement for "ChartSettingsWindow" (peepo_drum_kit/chart_editor_settings_gui.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { Settings, DefaultSettings, SaveUserSettings, ResetUserSettingsToDefault, ToShortcutString, KeyBinding, ModFlags_Ctrl, ModFlags_Shift, ModFlags_Alt, type InputSettingsKey, type MultiInputBinding } from "../../editor/settings";
	import { SoundEffectType } from "../../editor/sound";
	import { Engine } from "../../audio/engine";
	import Section from "../widgets/Section.svelte";
	import PropertyTable from "../widgets/PropertyTable.svelte";

	const data = $derived.by(() => { Track(); return { general: { ...Settings.General }, audio: { ...Settings.Audio }, animation: { ...Settings.Animation }, input: Settings.Input }; });

	function set<S extends "General" | "Audio" | "Animation">(section: S, key: keyof typeof Settings[S], value: unknown): void
	{
		(Settings[section] as Record<string, unknown>)[key as string] = value;
		SaveUserSettings();
		Invalidate();
	}

	const generalBools: (keyof typeof Settings.General)[] = ["DisplayTimeInSongSpace", "TimelineAdvanceCursorAfterPlacingNote", "TimelineScrollInvertMouseWheel", "TimelineScrubAutoScrollEnableClamp", "DisableTempoWindowWidgetsIfHasSelection", "ConvertSelectionToScrollChanges_UnselectOld", "ConvertSelectionToScrollChanges_SelectNew"];
	const generalNumbers: (keyof typeof Settings.General)[] = ["AutoSaveIntervalMinutes", "DrumrollAutoHitBarDivision", "TimelineScrollDistancePerMouseWheelTick", "TimelineScrollDistancePerMouseWheelTickFast", "TimelineZoomFactorPerMouseWheelTick", "TimelineScrubAutoScrollPixelThreshold", "TimelineScrubAutoScrollSpeedMin", "TimelineScrubAutoScrollSpeedMax"];
	const animationNumbers: (keyof typeof Settings.Animation)[] = ["TimelineSmoothScrollSpeed", "TimelineWaveformFadeSpeed", "TimelineRangeSelectionExpansionSpeed", "TimelineWorldSpaceCursorXSpeed", "TimelineGridSnapLineSpeed", "TimelineGoGoRangeExpansionSpeed"];
	const prettify = (key: string) => key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

	let recordingBinding: { key: InputSettingsKey; slot: number } | null = $state(null);

	$effect(() =>
	{
		if (recordingBinding === null) return;
		const onKey = (e: KeyboardEvent) =>
		{
			if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code)) return;
			e.preventDefault(); e.stopPropagation();
			const target = recordingBinding!;
			recordingBinding = null;
			if (e.code === "Escape") return;
			const list: MultiInputBinding = [...Settings.Input[target.key]];
			const mods = ((e.ctrlKey || e.metaKey) ? ModFlags_Ctrl : 0) | (e.shiftKey ? ModFlags_Shift : 0) | (e.altKey ? ModFlags_Alt : 0);
			if (e.code === "Backspace" || e.code === "Delete") list.splice(target.slot, 1);
			else list[target.slot] = KeyBinding(e.code, mods);
			(Settings.Input as Record<string, MultiInputBinding>)[target.key] = list.filter((v) => v !== undefined);
			SaveUserSettings();
			Invalidate();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	});

	const inputKeys = Object.keys(DefaultSettings.Input) as InputSettingsKey[];

	async function loadSoundEffect(type: SoundEffectType, file: File | undefined): Promise<void>
	{
		if (file === undefined) { editor.context.SfxVoicePool.SetCustomSource(type, null); return; }
		try { editor.context.SfxVoicePool.SetCustomSource(type, await Engine.DecodeAudioFile(await file.arrayBuffer())); editor.context.SfxVoicePool.PlaySound(type); }
		catch { editor.SetStatus(`Failed to decode audio file '${file.name}'`); }
	}
</script>

<div class="panel-scroll">
	<Section title={UI_Str("General")}>
		<PropertyTable>
			<div class="prop-label">{UI_Str("Default Creator Name")}</div>
			<div class="prop-value"><input type="text" value={data.general.DefaultCreatorName} oninput={(e) => set("General", "DefaultCreatorName", e.currentTarget.value)} /></div>
			{#each generalBools as key}
				<div class="prop-label">{prettify(key)}</div>
				<div class="prop-value row"><input type="checkbox" checked={data.general[key] as boolean} onchange={(e) => set("General", key, e.currentTarget.checked)} /></div>
			{/each}
			{#each generalNumbers as key}
				<div class="prop-label">{(key === "AutoSaveIntervalMinutes") ? UI_Str("Autosave Interval (minutes, 0 = off)") : prettify(key)}</div>
				<div class="prop-value"><input type="number" step="any" value={data.general[key] as number} onchange={(e) => { const v = parseFloat(e.currentTarget.value); if (Number.isFinite(v)) set("General", key, (key === "DrumrollAutoHitBarDivision") ? Math.max(1, Math.trunc(v)) : (key === "AutoSaveIntervalMinutes") ? Math.max(0, v) : v); }} /></div>
			{/each}
			<div class="prop-label">Custom Selection Patterns</div>
			<div class="prop-value">
				{#each data.general.CustomSelectionPatterns.V as pattern, i}
					<div class="row-flex">
						<span class="mono">{String.fromCharCode(65 + i)}</span>
						<input type="text" value={pattern} oninput={(e) => { const v = e.currentTarget.value.replace(/[^xo]/g, ""); Settings.General.CustomSelectionPatterns.V[i] = v; SaveUserSettings(); }} />
						<button onclick={() => { Settings.General.CustomSelectionPatterns.V.splice(i, 1); SaveUserSettings(); Invalidate(); }}>✕</button>
					</div>
				{/each}
				<button disabled={data.general.CustomSelectionPatterns.V.length >= 6} onclick={() => { const defaultPattern = "xoooooo"; Settings.General.CustomSelectionPatterns.V.push(defaultPattern.substring(0, Math.min(Settings.General.CustomSelectionPatterns.V.length + 2, defaultPattern.length))); SaveUserSettings(); Invalidate(); }}>{UI_Str("Add New Pattern...")}</button>
			</div>
		</PropertyTable>
	</Section>

	<Section title={UI_Str("Audio")}>
		<PropertyTable>
			<div class="prop-label">Open Device On Startup</div>
			<div class="prop-value row"><input type="checkbox" checked={data.audio.OpenDeviceOnStartup} onchange={(e) => set("Audio", "OpenDeviceOnStartup", e.currentTarget.checked)} /></div>
			<div class="prop-label">Close Device On Idle Focus Loss</div>
			<div class="prop-value row"><input type="checkbox" checked={data.audio.CloseDeviceOnIdleFocusLoss} onchange={(e) => set("Audio", "CloseDeviceOnIdleFocusLoss", e.currentTarget.checked)} /></div>
			{#each [["Don", SoundEffectType.TaikoDon], ["Ka", SoundEffectType.TaikoKa], ["Metronome Bar", SoundEffectType.MetronomeBar], ["Metronome Beat", SoundEffectType.MetronomeBeat]] as [name, type]}
				<div class="prop-label">{UI_Str("Sound Effects")}: {name}</div>
				<div class="prop-value row">
					<button onclick={() => editor.context.SfxVoicePool.PlaySound(type as SoundEffectType)}>▶</button>
					<input type="file" accept="audio/*" onchange={(e) => loadSoundEffect(type as SoundEffectType, e.currentTarget.files?.[0])} />
				</div>
			{/each}
		</PropertyTable>
	</Section>

	<Section title={UI_Str("Animation")}>
		<PropertyTable>
			<div class="prop-label">Enable Gui Scale Animation</div>
			<div class="prop-value row"><input type="checkbox" checked={data.animation.EnableGuiScaleAnimation} onchange={(e) => set("Animation", "EnableGuiScaleAnimation", e.currentTarget.checked)} /></div>
			{#each animationNumbers as key}
				<div class="prop-label">{prettify(key)}</div>
				<div class="prop-value"><input type="number" step="any" min="0" value={data.animation[key] as number} onchange={(e) => { const v = parseFloat(e.currentTarget.value); if (Number.isFinite(v)) set("Animation", key, Math.max(0, v)); }} /></div>
			{/each}
		</PropertyTable>
	</Section>

	<Section title={UI_Str("Input")} open={false}>
		<p class="hint">Click a slot and press a key combination (Backspace removes the slot, Escape cancels).</p>
		<PropertyTable>
			{#each inputKeys as key}
				<div class="prop-label small">{prettify(key)}</div>
				<div class="prop-value row bindings">
					{#each [...data.input[key], null] as binding, slot}
						<button class="binding" class:recording={recordingBinding?.key === key && recordingBinding?.slot === slot} onclick={() => (recordingBinding = { key, slot })}>
							{(recordingBinding?.key === key && recordingBinding?.slot === slot) ? "..." : (binding === null) ? "+" : ToShortcutString(binding)}
						</button>
					{/each}
				</div>
			{/each}
		</PropertyTable>
	</Section>

	<button class="reset" onclick={() => { ResetUserSettingsToDefault(); Invalidate(); }}>{UI_Str("Reset to Default")}</button>
</div>

<style>
	.small { font-size: 0.85em; }
	.bindings { flex-wrap: wrap; gap: 2px; }
	.binding { padding: 1px 6px; font-size: 0.85em; }
	.binding.recording { background: var(--header-active); }
	.row-flex { display: flex; gap: 4px; align-items: center; }
	.row-flex input { flex: 1; min-width: 0; }
	.mono { font-family: monospace; width: 1em; }
	.hint { color: var(--text-dim); margin: 4px; font-size: 0.85em; }
	.reset { margin: 8px 4px; }
	input[type="file"] { min-width: 0; flex: 1; font-size: 0.8em; }
</style>
