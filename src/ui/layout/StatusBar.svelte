<script lang="ts">
	import { editor, Track } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";

	const data = $derived.by(() =>
	{
		Track();
		const age = performance.now() - editor.StatusMessageTime;
		return { message: (editor.StatusMessage.length > 0 && age < 8000) ? editor.StatusMessage : "", song: editor.context.SongSourceFilePath, loading: editor.isSongAsyncLoading, title: editor.GetWindowTitle() };
	});
</script>

<footer class="status-bar">
	<span class="title">{data.title}</span>
	<span class="message">{data.message}</span>
	<span class="song">{data.loading ? UI_Str("Loading...") : (data.song.length > 0) ? `♪ ${data.song}` : UI_Str("No song loaded")}</span>
</footer>

<style>
	.status-bar { flex: none; display: flex; gap: 16px; align-items: center; height: 22px; padding: 0 8px; background: var(--menubar); font-size: 0.85em; color: var(--text-dim); overflow: hidden; white-space: nowrap; }
	.message { flex: 1; color: var(--text); overflow: hidden; text-overflow: ellipsis; }
	.title { max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
</style>
