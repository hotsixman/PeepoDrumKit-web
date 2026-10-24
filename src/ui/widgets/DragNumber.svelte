<script lang="ts">
	// NOTE: Replacement for the ImGui "GuiDragLabelScalar" + "InputScalar_WithExtraStuff" widget combination of PeepoDrumKit:
	//		 A label that can be dragged horizontally to change the value, a text input for exact values and optional step buttons
	interface Props
	{
		label?: string;
		value: number;
		dragSpeed?: number;
		step?: number;
		stepFast?: number;
		min?: number;
		max?: number;
		clamp?: boolean;
		format?: (v: number) => string;
		mixedPreview?: string | null;
		disabled?: boolean;
		warning?: boolean;
		integer?: boolean;
		showButtons?: boolean;
		labelOnly?: boolean;
		inputOnly?: boolean;
		onexact?: (v: number) => void;
		onincrement?: (delta: number) => void;
		ondragend?: () => void;
	}

	let {
		label = "", value, dragSpeed = 1.0, step = 0, stepFast = 0, min = -Infinity, max = Infinity, clamp = false,
		format = (v: number) => String(v), mixedPreview = null, disabled = false, warning = false, integer = false,
		showButtons = true, labelOnly = false, inputOnly = false, onexact, onincrement, ondragend,
	}: Props = $props();

	let editing = $state(false);
	let text = $state("");
	let dragging = $state(false);
	let dragStartX = 0, dragAccum = 0, dragStartValue = 0;

	const clampValue = (v: number) => clamp ? Math.min(Math.max(v, min), max) : v;
	const shown = $derived(editing ? text : (mixedPreview ?? format(value)));

	function commitText(): void
	{
		const match = /-?\d*\.?\d+(?:e[+-]?\d+)?/i.exec(text.replace(",", "."));
		if (match !== null)
		{
			let v = parseFloat(match[0]);
			if (integer) v = Math.trunc(v);
			if (Number.isFinite(v)) onexact?.(clampValue(v));
		}
		editing = false;
	}

	function onLabelPointerDown(e: PointerEvent): void
	{
		if (disabled) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		dragStartX = e.clientX;
		dragAccum = 0;
		dragStartValue = value;
	}

	function onLabelPointerMove(e: PointerEvent): void
	{
		if (!dragging) return;
		const speed = dragSpeed * (e.shiftKey ? 10.0 : e.altKey ? 0.01 : 1.0);
		const total = (e.clientX - dragStartX) * speed;
		let target = dragStartValue + total;
		if (integer) target = Math.round(target);
		target = clampValue(target);
		const delta = target - (dragStartValue + dragAccum);
		if (delta !== 0)
		{
			dragAccum += delta;
			if (onincrement !== undefined) onincrement(delta);
			else onexact?.(target);
		}
	}

	function onLabelPointerUp(): void
	{
		if (!dragging) return;
		dragging = false;
		ondragend?.();
	}

	function stepBy(sign: number, e: MouseEvent): void
	{
		const amount = (e.ctrlKey || e.metaKey || e.shiftKey) && stepFast !== 0 ? stepFast : step;
		if (onincrement !== undefined) onincrement(sign * amount);
		else onexact?.(clampValue(value + sign * amount));
	}
</script>

<div class="drag-number" class:disabled class:label-only={labelOnly}>
	{#if !inputOnly && label.length > 0}
		<span
			class="drag-label"
			class:active={dragging}
			role="slider"
			tabindex="-1"
			aria-valuenow={value}
			onpointerdown={onLabelPointerDown}
			onpointermove={onLabelPointerMove}
			onpointerup={onLabelPointerUp}
			onpointercancel={onLabelPointerUp}
		>{label}</span>
	{/if}
	{#if !labelOnly}
		<div class="input-row">
			<input
				type="text"
				inputmode="decimal"
				class:mixed={mixedPreview !== null && !editing}
				class:warning
				value={shown}
				{disabled}
				onfocus={(e) => { editing = true; text = format(value).replace(/[^\d.\-e+]/gi, ""); requestAnimationFrame(() => (e.target as HTMLInputElement).select()); }}
				oninput={(e) => { text = (e.target as HTMLInputElement).value; }}
				onblur={commitText}
				onkeydown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { editing = false; (e.target as HTMLInputElement).blur(); } }}
			/>
			{#if showButtons && step !== 0}
				<button class="step" {disabled} onclick={(e) => stepBy(-1, e)} aria-label="decrease">−</button>
				<button class="step" {disabled} onclick={(e) => stepBy(+1, e)} aria-label="increase">+</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.drag-number { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.drag-number.label-only { flex-direction: row; }
	.disabled { opacity: 0.5; pointer-events: none; }
	.drag-label { cursor: ew-resize; user-select: none; touch-action: none; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.drag-label:hover { color: var(--drag-hover); }
	.drag-label.active { color: var(--drag-active); }
	.input-row { display: flex; gap: 2px; min-width: 0; }
	input { flex: 1; min-width: 0; }
	input.mixed { color: var(--text-dim); }
	input.warning { color: var(--warning); }
	.step { width: var(--frame-height); padding: 0; flex: none; }
</style>
