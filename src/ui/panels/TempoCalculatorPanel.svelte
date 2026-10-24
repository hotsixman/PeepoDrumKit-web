<script lang="ts">
	// NOTE: Port of "TempoCalculatorWindow::DrawGui()" (peepo_drum_kit/chart_editor_widgets.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str, UI_Fmt } from "../../editor/i18n";
	import { Settings } from "../../editor/settings";
	import { Input } from "../../editor/input";
	import { SoundEffectType } from "../../editor/sound";
	import { FormatG } from "../../core/types";

	const calculator = editor.tempoCalculator;
	let animation = $state(1.0);
	let resetDown = $state(false);

	const data = $derived.by(() =>
	{
		Track();
		return { tapCount: calculator.TapCount, lastTempo: calculator.LastTempo.BPM, min: calculator.LastTempoMin.BPM, max: calculator.LastTempoMax.BPM, timedOut: calculator.HasTimedOut() };
	});

	function tap(): void { editor.context.SfxVoicePool.PlaySound(SoundEffectType.MetronomeBeat); calculator.Tap(); Invalidate(); }
	function reset(): void { if (calculator.TapCount > 0) editor.context.SfxVoicePool.PlaySound(SoundEffectType.MetronomeBar); calculator.Reset(); Invalidate(); }

	// NOTE: Keyboard taps while this panel is focused + the button flash animation
	$effect(() =>
	{
		const hook = () =>
		{
			const windowFocused = (Input.FocusOwner === "tempoCalculator") && !Input.IsTextInputActive();
			if (windowFocused && Input.IsAnyPressed(Settings.Input.TempoCalculator_Tap, false)) tap();
			if (windowFocused && Input.IsAnyPressed(Settings.Input.TempoCalculator_Reset, false)) reset();
			resetDown = windowFocused && Input.IsAnyDown(Settings.Input.TempoCalculator_Reset);

			const lastBeatDuration = 60.0 / Math.round(calculator.LastTempo.BPM);
			animation = Math.min(1.0, Math.max(0.0, (calculator.TapCount === 0) ? 1.0 : (calculator.LastTap.GetElapsed() / lastBeatDuration)));
		};
		editor.FrameHooks.add(hook);
		return () => { editor.FrameHooks.delete(hook); };
	});

	const fmt = (v: number, precise: boolean) => (data.tapCount > 1) ? (precise ? `${v.toFixed(2)} BPM` : `${FormatG(v)} BPM`) : "--.-- BPM";
</script>

<div class="calculator" role="region" onpointerdown={() => (Input.FocusOwner = "tempoCalculator")}>
	<button class="tap" style={`--flash: ${1.0 - animation}`} class:timed-out={data.tapCount > 0 && data.timedOut}
		onpointerdown={(e) => { e.preventDefault(); tap(); }}>
		{(data.tapCount === 0) ? UI_Str("Tap") : (data.tapCount === 1) ? UI_Str(" First Beat ") : `${data.lastTempo.toFixed(2)} BPM`}
	</button>
	<button class="reset" class:active={resetDown} class:dim={data.tapCount === 0} onclick={reset}>{UI_Str("Reset")}</button>

	<table>
		<tbody>
			<tr><td>{UI_Str("Nearest Whole")}</td><td><input readonly value={fmt(Math.round(data.lastTempo), false)} /></td></tr>
			<tr><td>{UI_Str("Nearest")}</td><td><input readonly value={fmt(data.lastTempo, true)} /></td></tr>
			<tr><td>{UI_Str("Min and Max")}</td><td class="two"><input readonly value={fmt(data.min, true)} /><input readonly value={fmt(data.max, true)} /></td></tr>
			<tr><td>{UI_Str("Timing Taps")}</td><td>{(data.tapCount === 1) ? UI_Str("First Beat") : UI_Fmt("%d Taps", data.tapCount)}</td></tr>
		</tbody>
	</table>
</div>

<style>
	.calculator { display: flex; flex-direction: column; gap: 4px; padding: 4px; height: 100%; overflow: auto; outline: none; }
	.tap { height: 96px; font-size: 1.5em; background: color-mix(in srgb, var(--header-active) calc(var(--flash) * 100%), var(--header)); border: 1px solid var(--border-light); }
	.tap.timed-out { color: color-mix(in srgb, var(--text) 80%, transparent); }
	.reset.active { background: var(--button-active); }
	.reset.dim { color: var(--text-dim); }
	table { width: 100%; border-collapse: collapse; }
	td { padding: 3px 4px; border-bottom: 1px solid var(--border-light); }
	td:first-child { width: 40%; }
	td input { width: 100%; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
</style>
