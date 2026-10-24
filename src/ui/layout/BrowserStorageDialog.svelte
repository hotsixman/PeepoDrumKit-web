<script lang="ts">
	// NOTE: Web port addition, lists the charts stored inside the browser (IndexedDB) and allows opening / deleting them
	import { editor, Invalidate, Track } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { type BrowserChartInfo, ListBrowserCharts, DeleteBrowserChart, GetBrowserStorageEstimate, FormatByteSize } from "../../editor/browser-storage";

	interface Props { open: boolean; onclose: () => void; }
	let { open, onclose }: Props = $props();

	let entries: BrowserChartInfo[] = $state([]);
	let usage = $state("");
	let errorMessage = $state("");
	let busy = $state(false);
	let pendingDeleteID: string | null = $state(null);
	const currentID = $derived.by(() => { Track(); return editor.BrowserChartID; });

	async function refresh(): Promise<void>
	{
		try
		{
			entries = await ListBrowserCharts();
			errorMessage = "";
		}
		catch (e)
		{
			entries = [];
			errorMessage = String(e);
		}
		const estimate = await GetBrowserStorageEstimate();
		usage = (estimate !== null && estimate.Quota > 0) ? `${FormatByteSize(estimate.Usage)} / ${FormatByteSize(estimate.Quota)}` : "";
	}

	$effect(() =>
	{
		if (open) { pendingDeleteID = null; void refresh(); }
	});

	const formatDate = (time: number) => new Date(time).toLocaleString();

	async function saveCurrent(asNew: boolean): Promise<void>
	{
		busy = true;
		await editor.SaveChartToBrowser(asNew);
		busy = false;
		Invalidate();
		await refresh();
	}

	function openEntry(id: string): void
	{
		onclose();
		editor.CheckOpenSaveConfirmationPopupThenCall(() => { void editor.OpenChartFromBrowser(id).then(Invalidate); });
		Invalidate();
	}

	async function deleteEntry(id: string): Promise<void>
	{
		if (pendingDeleteID !== id) { pendingDeleteID = id; return; }
		pendingDeleteID = null;
		await DeleteBrowserChart(id);
		if (editor.BrowserChartID === id) { editor.BrowserChartID = null; Invalidate(); }
		await refresh();
	}
</script>

{#if open}
	<div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="browser-storage-title">
			<div class="modal-title" id="browser-storage-title">
				<span>{UI_Str("Browser Storage")}</span>
				<button class="close" onclick={onclose} aria-label={UI_Str("Close")}>✕</button>
			</div>
			<div class="actions">
				<button disabled={busy} onclick={() => saveCurrent(false)}>{UI_Str(currentID !== null ? "Save (Overwrite)" : "Save Current Chart")}</button>
				{#if currentID !== null}
					<button disabled={busy} onclick={() => saveCurrent(true)}>{UI_Str("Save as New")}</button>
				{/if}
			</div>
			<div class="list">
				{#if errorMessage.length > 0}
					<div class="empty error">{errorMessage}</div>
				{:else if entries.length === 0}
					<div class="empty">{UI_Str("No charts saved in this browser")}</div>
				{/if}
				{#each entries as entry (entry.ID)}
					<div class="entry" class:current={entry.ID === currentID}>
						<div class="info">
							<div class="name">{entry.Title.length > 0 ? entry.Title : entry.FileName}</div>
							<div class="meta">
								{entry.FileName} · {formatDate(entry.SavedAt)}
								{#if entry.SongFileName.length > 0}
									· ♪ {entry.SongSize > 0 ? `${entry.SongFileName} (${FormatByteSize(entry.SongSize)})` : UI_Str("No song")}
								{/if}
							</div>
						</div>
						<div class="buttons">
							<button onclick={() => openEntry(entry.ID)}>{UI_Str("Open")}</button>
							<button class:danger={pendingDeleteID === entry.ID} onclick={() => deleteEntry(entry.ID)}>{UI_Str(pendingDeleteID === entry.ID ? "Confirm Delete" : "Delete")}</button>
						</div>
					</div>
				{/each}
			</div>
			<div class="footer">
				<span>{UI_Str("Charts are stored only in this browser on this device.")}</span>
				{#if usage.length > 0}<span class="usage">{usage}</span>{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop { position: fixed; inset: 0; background: rgba(5, 5, 5, 0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
	.modal { background: var(--popup); border: 1px solid var(--border-light); width: min(560px, 94vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); }
	.modal-title { background: var(--title-active); padding: 2px 4px 2px 8px; display: flex; align-items: center; justify-content: space-between; }
	.close { min-height: 0; padding: 2px 8px; background: transparent; }
	.actions { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--border); }
	.actions button { flex: 1; padding: 6px; }
	.list { flex: 1; overflow-y: auto; min-height: 80px; }
	.empty { padding: 24px 12px; text-align: center; color: var(--text-dim); }
	.empty.error { color: #ff8c8c; }
	.entry { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
	.entry.current { background: color-mix(in srgb, var(--header-active) 35%, transparent); }
	.info { flex: 1; min-width: 0; }
	.name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.meta { font-size: 0.8em; color: var(--text-dim); overflow-wrap: anywhere; }
	.buttons { flex: none; display: flex; gap: 4px; }
	.danger { background: #8c2a22; }
	.footer { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; font-size: 0.8em; color: var(--text-dim); border-top: 1px solid var(--border); }
	.usage { flex: none; font-variant-numeric: tabular-nums; }
</style>
