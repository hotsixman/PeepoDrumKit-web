<script lang="ts">
	// NOTE: Port of "ChartPropertiesWindow::DrawGui()" (peepo_drum_kit/chart_editor_widgets.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { Language, DifficultyTypeNames, DifficultyLevelMin, DifficultyLevelMax } from "../../editor/chart";
	import { ToPercent, FromPercent, Clamp } from "../../core/types";
	import { Settings, SaveUserSettings } from "../../editor/settings";
	import Section from "../widgets/Section.svelte";
	import PropertyTable from "../widgets/PropertyTable.svelte";

	// NOTE: Soft clamp for sliders but hard limit to allow *typing in* values higher, even if it can cause clipping
	const MinVolume = 0.0, MaxVolumeSoftLimit = 1.0, MaxVolumeHardLimit = 4.0;

	const context = editor.context;
	const data = $derived.by(() =>
	{
		Track();
		const chart = context.Chart, course = context.ChartSelectedCourse;
		return {
			title: chart.ChartTitle[Language.Base], subtitle: chart.ChartSubtitle[Language.Base], creator: chart.ChartCreator,
			songFileName: chart.SongFileName, songVolume: chart.SongVolume, sfxVolume: chart.SoundEffectVolume,
			courseType: course.Type, courseLevel: course.Level, courseCreator: course.CourseCreator,
			isLoading: editor.isSongAsyncLoading,
			previewHitVolume: Settings.Audio.PreviewHitSoundVolume,
		};
	});

	function changed(): void { context.Undo.NotifyChangesWereMade(); Invalidate(); }

	let loadingFrame = $state(0);
	const LoadingFrames = ["Loading o....", "Loading .o...", "Loading ..o..", "Loading ...o.", "Loading ....o", "Loading ...o.", "Loading ..o..", "Loading .o..."];
	$effect(() =>
	{
		if (!data.isLoading) return;
		const id = setInterval(() => { loadingFrame = (loadingFrame + 1) % LoadingFrames.length; }, 1000 / 12);
		return () => clearInterval(id);
	});
</script>

<div class="panel-scroll">
	<Section title={UI_Str("Chart")}>
		<PropertyTable>
			<div class="prop-label">{UI_Str("Chart Title")}</div>
			<div class="prop-value"><input type="text" placeholder="n/a" value={data.title} oninput={(e) => { context.Chart.ChartTitle[Language.Base] = e.currentTarget.value; changed(); }} /></div>

			<div class="prop-label">{UI_Str("Chart Subtitle")}</div>
			<div class="prop-value"><input type="text" placeholder="n/a" value={data.subtitle} oninput={(e) => { context.Chart.ChartSubtitle[Language.Base] = e.currentTarget.value; changed(); }} /></div>

			<div class="prop-label">{UI_Str("Chart Creator")}</div>
			<div class="prop-value"><input type="text" placeholder="n/a" value={data.creator} oninput={(e) => { context.Chart.ChartCreator = e.currentTarget.value; changed(); }} /></div>

			<div class="prop-label">{UI_Str("Song File Name")}</div>
			<div class="prop-value row">
				<input type="text" readonly placeholder={data.isLoading ? LoadingFrames[loadingFrame] : "song.ogg"} value={data.isLoading ? "" : data.songFileName} disabled={data.isLoading} />
				<button class="browse" onclick={() => editor.OpenLoadAudioFileDialog()} disabled={data.isLoading}>...</button>
			</div>

			<div class="prop-label">{UI_Str("Song Volume")}</div>
			<div class="prop-value row">
				<input type="range" min={ToPercent(MinVolume)} max={ToPercent(MaxVolumeSoftLimit)} step="1" value={ToPercent(data.songVolume)}
					oninput={(e) => { context.Chart.SongVolume = Clamp(FromPercent(parseFloat(e.currentTarget.value)), MinVolume, MaxVolumeHardLimit); changed(); }} />
				<span class="slider-value">{ToPercent(data.songVolume).toFixed(0)}%</span>
			</div>

			<div class="prop-label">{UI_Str("Sound Effect Volume")}</div>
			<div class="prop-value row">
				<input type="range" min={ToPercent(MinVolume)} max={ToPercent(MaxVolumeSoftLimit)} step="1" value={ToPercent(data.sfxVolume)}
					oninput={(e) => { context.Chart.SoundEffectVolume = Clamp(FromPercent(parseFloat(e.currentTarget.value)), MinVolume, MaxVolumeHardLimit); changed(); }} />
				<span class="slider-value">{ToPercent(data.sfxVolume).toFixed(0)}%</span>
			</div>

			<!-- NOTE: Web port addition, editor only preview volume for the don / ka sounds, not saved to the chart (unlike SEVOL above) -->
			<div class="prop-label" title={UI_Str("Editor only, not saved to the TJA file (SEVOL)")}>{UI_Str("Preview Hit Volume")}</div>
			<div class="prop-value row">
				<input type="range" min="0" max="200" step="1" value={ToPercent(data.previewHitVolume)}
					oninput={(e) => { Settings.Audio.PreviewHitSoundVolume = Clamp(FromPercent(parseFloat(e.currentTarget.value)), 0.0, 2.0); Invalidate(); }}
					onchange={() => SaveUserSettings()} />
				<span class="slider-value">{ToPercent(data.previewHitVolume).toFixed(0)}%</span>
			</div>
		</PropertyTable>
	</Section>

	<Section title={UI_Str("Selected Course")}>
		<PropertyTable>
			<div class="prop-label">{UI_Str("Difficulty Type")}</div>
			<div class="prop-value">
				<select value={data.courseType} onchange={(e) => { context.ChartSelectedCourse.Type = parseInt(e.currentTarget.value, 10); changed(); }}>
					{#each DifficultyTypeNames as name, i}
						<option value={i}>{UI_Str(name)}</option>
					{/each}
				</select>
			</div>

			<div class="prop-label">{UI_Str("Difficulty Level")}</div>
			<div class="prop-value row stars" role="radiogroup">
				{#each { length: DifficultyLevelMax } as _, i}
					<button class="star" class:filled={i < data.courseLevel} aria-label={`★ ${i + 1}`}
						onclick={() => { context.ChartSelectedCourse.Level = Clamp(i + 1, DifficultyLevelMin, DifficultyLevelMax); changed(); }}>★</button>
				{/each}
			</div>

			<div class="prop-label">{UI_Str("Course Creator")}</div>
			<div class="prop-value">
				<input type="text" placeholder={(data.courseCreator.length === 0 && data.creator.length > 0) ? data.creator : "n/a"} value={data.courseCreator}
					oninput={(e) => { context.ChartSelectedCourse.CourseCreator = e.currentTarget.value; changed(); }} />
			</div>
		</PropertyTable>
	</Section>
</div>

<style>
	.browse { flex: none; width: var(--frame-height); padding: 0; }
	.slider-value { flex: none; width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
	input[type="range"] { flex: 1; min-width: 0; }
	.stars { gap: 0; }
	.star { flex: 1; min-width: 0; padding: 0; background: var(--frame); border: none; border-radius: 0; color: var(--text-dim); font-size: 1.05em; height: var(--frame-height); }
	.star.filled { color: var(--text); background: var(--button); }
	.star:hover { background: var(--button-hover); }
</style>
