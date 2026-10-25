<script lang="ts">
	// NOTE: Web port addition, offers to restore the automatic backup of unsaved changes from a previous session
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";

	const recovery = $derived.by(() => { Track(); return editor.PendingAutosaveRecovery; });
	const resolve = (restore: boolean) => { void editor.ResolveAutosaveRecovery(restore).then(Invalidate); Invalidate(); };
</script>

{#if recovery !== null && editor.PendingConfirmation === null}
	<div class="modal-backdrop" role="presentation">
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="autosave-title">
			<div class="modal-title" id="autosave-title">{UI_Str("Recover Unsaved Chart")}</div>
			<div class="modal-body">
				<div>{UI_Str("An automatic backup of unsaved changes was found.")}</div>
				<div class="info">
					<div class="name">{recovery.Title.length > 0 ? recovery.Title : recovery.FileName}</div>
					<div class="meta">{recovery.FileName} · {new Date(recovery.SavedAt).toLocaleString()}</div>
				</div>
			</div>
			<div class="modal-buttons">
				<button onclick={() => resolve(true)}>{UI_Str("Recover")}</button>
				<button onclick={() => resolve(false)}>{UI_Str("Discard")}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop { position: fixed; inset: 0; background: rgba(5, 5, 5, 0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
	.modal { background: var(--popup); border: 1px solid var(--border-light); width: min(420px, 92vw); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); }
	.modal-title { background: var(--title-active); padding: 4px 8px; }
	.modal-body { padding: 14px 12px; display: flex; flex-direction: column; gap: 10px; }
	.info { background: var(--frame); padding: 6px 8px; }
	.name { font-size: 1.05em; }
	.meta { font-size: 0.8em; color: var(--text-dim); }
	.modal-buttons { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; padding: 6px; }
	.modal-buttons button { padding: 6px; }
</style>
