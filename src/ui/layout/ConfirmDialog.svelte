<script lang="ts">
	// NOTE: Port of the "Peepo Drum Kit - Unsaved Changes" save confirmation popup (peepo_drum_kit/chart_editor.cpp)
	import { editor, Track, Invalidate } from "../state.svelte";
	import { UI_Str } from "../../editor/i18n";
	import { Settings } from "../../editor/settings";
	import { Input } from "../../editor/input";

	const open = $derived.by(() => { Track(); return editor.PendingConfirmation !== null; });
	const resolve = (choice: "save" | "discard" | "cancel") => { void editor.ResolveConfirmation(choice).then(Invalidate); Invalidate(); };

	$effect(() =>
	{
		const hook = () =>
		{
			if (editor.PendingConfirmation === null) return;
			if (Input.IsAnyPressed(Settings.Input.Dialog_YesOrOk, false)) resolve("save");
			else if (Input.IsAnyPressed(Settings.Input.Dialog_No, false)) resolve("discard");
			else if (Input.IsAnyPressed(Settings.Input.Dialog_Cancel, false)) resolve("cancel");
		};
		editor.FrameHooks.add(hook);
		return () => { editor.FrameHooks.delete(hook); };
	});
</script>

{#if open}
	<div class="modal-backdrop" role="presentation">
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
			<div class="modal-title" id="confirm-title">{UI_Str("Peepo Drum Kit - Unsaved Changes")}</div>
			<div class="modal-body">{UI_Str("Save changes to the current file?")}</div>
			<div class="modal-buttons">
				<button onclick={() => resolve("save")}>{UI_Str("Save Changes")}</button>
				<button onclick={() => resolve("discard")}>{UI_Str("Discard Changes")}</button>
				<button onclick={() => resolve("cancel")}>{UI_Str("Cancel")}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop { position: fixed; inset: 0; background: rgba(5, 5, 5, 0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
	.modal { background: var(--popup); border: 1px solid var(--border-light); min-width: min(380px, 92vw); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); }
	.modal-title { background: var(--title-active); padding: 4px 8px; }
	.modal-body { padding: 18px 12px; font-size: 1.1em; }
	.modal-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 6px; }
	.modal-buttons button { padding: 6px; }
</style>
