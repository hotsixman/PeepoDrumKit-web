<script lang="ts">
	import { editor } from "../state.svelte";
	import { Input } from "../../editor/input";

	let canvas: HTMLCanvasElement | undefined = $state();
	$effect(() =>
	{
		if (canvas === undefined) return;
		editor.gamePreview.AttachCanvas(canvas);
		return () => editor.gamePreview.AttachCanvas(null);
	});
</script>

<canvas bind:this={canvas} class="game-canvas" onpointerdown={() => (Input.FocusOwner = "other")}></canvas>

<style>
	.game-canvas { width: 100%; height: 100%; display: block; }
</style>
