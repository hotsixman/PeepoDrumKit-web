<script lang="ts">
	// NOTE: Hosts the timeline canvas and translates browser pointer events into the ImGui-like input state.
	//		 Touch input is handled by a small gesture controller (tap = left click, drag = scroll, pinch = zoom, long press = box selection)
	import { editor, ui } from "../state.svelte";
	import { Input, MouseButton } from "../../editor/input";
	import { type vec2, Clamp } from "../../core/types";

	interface Props { selectMode?: boolean; }
	let { selectMode = false }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	const timeline = editor.timeline;

	$effect(() =>
	{
		if (canvas === undefined) return;
		timeline.AttachCanvas(canvas);
		Input.SetMouseTarget(canvas);
		const onWheel = (e: WheelEvent) => { e.preventDefault(); Input.OnWheel(e); };
		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => { canvas?.removeEventListener("wheel", onWheel); timeline.AttachCanvas(null); };
	});

	const LongPressDuration = 450, TapMoveThreshold = 8;

	interface TouchState { id: number; start: vec2; last: vec2; startTime: number; }
	const touches = new Map<number, TouchState>();
	let gesture: "none" | "pending" | "pan" | "pinch" | "box" | "mouse" = "none";
	let longPressTimer = 0;
	let panStartCameraX = 0, panStartCameraY = 0, panVelocity = 0, panLastTime = 0;
	let pinchStartDistance = 1, pinchStartZoom = 1, pinchStartCenter: vec2 = { x: 0, y: 0 }, pinchStartCameraX = 0;

	const local = (e: PointerEvent): vec2 => { const r = canvas!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
	const distance = (a: vec2, b: vec2) => Math.hypot(a.x - b.x, a.y - b.y);

	function clearLongPress(): void { if (longPressTimer !== 0) { clearTimeout(longPressTimer); longPressTimer = 0; } }

	function onPointerDown(e: PointerEvent): void
	{
		Input.FocusOwner = "timeline";
		if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
		canvas!.setPointerCapture(e.pointerId);

		if (e.pointerType !== "touch")
		{
			if (e.button === 1) e.preventDefault();
			Input.OnPointerDown(e);
			return;
		}

		e.preventDefault();
		const pos = local(e);
		touches.set(e.pointerId, { id: e.pointerId, start: pos, last: pos, startTime: performance.now() });

		if (touches.size === 1)
		{
			const regions = timeline.Regions;
			// NOTE: Header scrubbing, scrollbar and dragging already selected items behave exactly like a mouse
			if (regions.ContentHeader.Contains(pos) || regions.ContentScrollbarX.Contains(pos) || (regions.Content.Contains(pos) && timeline.IsMouseOverSelectedItemHitbox(editor.context, pos)))
			{
				gesture = "mouse";
				Input.SimulateMouseDown(MouseButton.Left, pos);
				return;
			}

			if (selectMode && regions.Content.Contains(pos))
			{
				gesture = "box";
				Input.SimulateMouseDown(MouseButton.Right, pos);
				return;
			}

			gesture = "pending";
			panStartCameraX = timeline.Camera.PositionTarget.x;
			panStartCameraY = timeline.Camera.PositionTarget.y;
			panVelocity = 0; panLastTime = performance.now();
			clearLongPress();
			longPressTimer = window.setTimeout(() =>
			{
				longPressTimer = 0;
				if (gesture !== "pending") return;
				gesture = "box";
				navigator.vibrate?.(15);
				Input.SimulateMouseDown(MouseButton.Right, touches.values().next().value!.start);
			}, LongPressDuration);
		}
		else if (touches.size === 2)
		{
			clearLongPress();
			if (gesture === "mouse") Input.SimulateMouseUp(MouseButton.Left);
			if (gesture === "box") Input.SimulateMouseUp(MouseButton.Right);
			const [a, b] = [...touches.values()];
			gesture = "pinch";
			pinchStartDistance = Math.max(1, distance(a.last, b.last));
			pinchStartZoom = timeline.Camera.ZoomTarget.x;
			pinchStartCenter = { x: (a.last.x + b.last.x) * 0.5, y: (a.last.y + b.last.y) * 0.5 };
			pinchStartCameraX = timeline.Camera.PositionTarget.x;
		}
	}

	function onPointerMove(e: PointerEvent): void
	{
		if (e.pointerType !== "touch") { Input.OnPointerMove(e); return; }

		const state = touches.get(e.pointerId);
		if (state === undefined) return;
		const pos = local(e);
		const camera = timeline.Camera;

		if (gesture === "pending" && distance(pos, state.start) > TapMoveThreshold)
		{
			clearLongPress();
			gesture = "pan";
		}

		if (gesture === "pan")
		{
			const now = performance.now();
			const dx = pos.x - state.last.x;
			const dt = Math.max(1, now - panLastTime);
			panVelocity = panVelocity * 0.6 + (-dx / dt) * 0.4;
			panLastTime = now;
			camera.PositionTarget.x = camera.PositionCurrent.x = panStartCameraX - (pos.x - state.start.x);
			// NOTE: Vertical scrolling for when the rows don't fit (clamped by the timeline)
			camera.PositionTarget.y = camera.PositionCurrent.y = panStartCameraY - (pos.y - state.start.y);
		}
		else if (gesture === "pinch" && touches.size >= 2)
		{
			state.last = pos;
			const [a, b] = [...touches.values()];
			const center = { x: (a.last.x + b.last.x) * 0.5, y: (a.last.y + b.last.y) * 0.5 };
			const zoom = Clamp(pinchStartZoom * (distance(a.last, b.last) / pinchStartDistance), 0.05, 20.0);
			camera.PositionTarget.x = pinchStartCameraX - (center.x - pinchStartCenter.x);
			camera.SetZoomTargetAroundLocalPivot({ x: zoom, y: camera.ZoomTarget.y }, timeline.ScreenToLocalSpace(center));
			camera.PositionCurrent.x = camera.PositionTarget.x; camera.ZoomCurrent.x = camera.ZoomTarget.x;
			pinchStartCameraX = camera.PositionTarget.x; pinchStartCenter = center;
			pinchStartZoom = zoom; pinchStartDistance = Math.max(1, distance(a.last, b.last));
			return;
		}
		else if (gesture === "mouse" || gesture === "box")
		{
			Input.SimulateMouseMove(pos);
		}
		state.last = pos;
	}

	function onPointerUp(e: PointerEvent): void
	{
		if (e.pointerType !== "touch") return;
		const state = touches.get(e.pointerId);
		touches.delete(e.pointerId);
		clearLongPress();
		if (state === undefined) return;

		if (gesture === "pending")
		{
			// NOTE: A short tap is a regular left click (sets the cursor)
			Input.SimulateMouseClick(MouseButton.Left, state.start);
		}
		else if (gesture === "pan")
		{
			// NOTE: Small fling to make scrolling feel more natural
			if (Math.abs(panVelocity) > 0.2)
				timeline.Camera.PositionTarget.x += panVelocity * 220.0;
		}
		else if (gesture === "mouse") Input.SimulateMouseUp(MouseButton.Left);
		else if (gesture === "box") Input.SimulateMouseUp(MouseButton.Right);

		if (touches.size === 0) gesture = "none";
		else if (gesture === "pinch" && touches.size === 1)
		{
			// NOTE: Continue panning with the remaining finger
			const remaining = touches.values().next().value!;
			remaining.start = remaining.last;
			panStartCameraX = timeline.Camera.PositionTarget.x;
			panStartCameraY = timeline.Camera.PositionTarget.y;
			gesture = "pan";
		}
	}
</script>

<canvas
	bind:this={canvas}
	class="timeline-canvas"
	class:mobile={ui.isMobile}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onpointerenter={(e) => { if (e.pointerType !== "touch") Input.OnPointerEnter(); }}
	onpointerleave={(e) => { if (e.pointerType !== "touch") Input.OnPointerLeave(); }}
	oncontextmenu={(e) => e.preventDefault()}
	onauxclick={(e) => e.preventDefault()}
></canvas>

<style>
	.timeline-canvas { width: 100%; height: 100%; display: block; touch-action: none; outline: none; user-select: none; -webkit-user-select: none; }
</style>
