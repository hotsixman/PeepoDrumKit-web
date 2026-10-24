<script lang="ts">
	// NOTE: Draggable splitter changing a fraction (0..1) of its parent size
	let { value = $bindable(0.5), axis = "x", min = 0.1, max = 0.9, invert = false }: { value?: number; axis?: "x" | "y"; min?: number; max?: number; invert?: boolean } = $props();
	let dragging = $state(false);

	function onPointerDown(e: PointerEvent): void { dragging = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
	function onPointerMove(e: PointerEvent): void
	{
		if (!dragging) return;
		const parent = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
		let t = (axis === "x") ? (e.clientX - parent.left) / parent.width : (e.clientY - parent.top) / parent.height;
		if (invert) t = 1.0 - t;
		value = Math.min(max, Math.max(min, t));
	}
</script>

<div class="splitter {axis}" class:dragging role="separator" aria-orientation={axis === "x" ? "vertical" : "horizontal"}
	onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={() => (dragging = false)} onpointercancel={() => (dragging = false)}></div>

<style>
	.splitter { flex: none; background: var(--border); touch-action: none; z-index: 2; }
	.splitter.x { width: 4px; cursor: col-resize; }
	.splitter.y { height: 4px; cursor: row-resize; }
	.splitter:hover, .splitter.dragging { background: var(--separator-active); }
</style>
