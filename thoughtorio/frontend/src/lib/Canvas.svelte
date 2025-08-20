<script>
    import { viewport, canvasState, viewportActions } from '../stores/canvas.js';
    import { nodes, connections, nodeActions, connectionActions } from '../stores/nodes.js';
    import Node from './Node.svelte';
    import ConnectionLine from './ConnectionLine.svelte';
    import NodePalette from './NodePalette.svelte';
    
    let canvasElement;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let lastPanPoint = { x: 0, y: 0 };
    let isConnecting = false;
    let tempConnection = null;
    let mousePosition = { x: 0, y: 0 };
    let isBoxSelecting = false;
    let boxSelectionStart = { x: 0, y: 0 };
    let lastBoxSelectionTime = 0;
    let hasMovedDuringDrag = false;
    let suppressNextDoubleClick = false;
    
    // Convert screen coordinates to canvas coordinates
    function screenToCanvas(screenX, screenY) {
        const rect = canvasElement.getBoundingClientRect();
        const x = (screenX - rect.left - $viewport.x) / $viewport.zoom;
        const y = (screenY - rect.top - $viewport.y) / $viewport.zoom;
        return { x, y };
    }
    
    // Handle mouse wheel for zooming and trackpad pan
    function handleWheel(event) {
        event.preventDefault();
        
        // Check if this is a trackpad (has deltaX) vs mouse wheel (only deltaY)
        const isTrackpad = Math.abs(event.deltaX) > 0;
        
        if (isTrackpad) {
            // Two-finger trackpad gestures
            const isVertical = Math.abs(event.deltaY) > Math.abs(event.deltaX);
            
            if (isVertical && Math.abs(event.deltaY) > 2) {
                // Two-finger up/down = pan vertically
                viewportActions.pan(0, -event.deltaY);
            } else if (!isVertical && Math.abs(event.deltaX) > 2) {
                // Two-finger left/right = pan horizontally
                viewportActions.pan(-event.deltaX, 0);
            } else if (Math.abs(event.deltaX) > 0 && Math.abs(event.deltaY) > 0) {
                // Both directions = pan both ways
                viewportActions.pan(-event.deltaX, -event.deltaY);
            }
        } else {
            // Regular mouse wheel zoom
            const rect = canvasElement.getBoundingClientRect();
            const centerX = event.clientX - rect.left;
            const centerY = event.clientY - rect.top;
            
            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            viewportActions.zoom(zoomFactor, centerX, centerY);
        }
    }
    
    // Handle mouse down for panning or box selection
    function handleMouseDown(event) {
        if (event.button === 1 || (event.button === 0 && event.shiftKey) || event.button === 2) {
            // Middle mouse, Shift+Left mouse, or Right mouse for panning
            event.preventDefault();
            isDragging = true;
            lastPanPoint = { x: event.clientX, y: event.clientY };
            canvasState.update(s => ({ ...s, mode: 'pan' }));
        } else if (event.button === 0) {
            // Check if clicking on empty space (not a node or connection)
            const clickedOnNode = event.target.closest('.node-card');
            const clickedOnConnection = event.target.closest('.connection-group');
            const clickedOnPalette = event.target.closest('.node-palette');
            
            if (!clickedOnNode && !clickedOnConnection && !clickedOnPalette) {
                // Left mouse on empty canvas - start box selection
                console.log('Starting box selection on empty space');
                const canvasCoords = screenToCanvas(event.clientX, event.clientY);
                boxSelectionStart = canvasCoords;
                isBoxSelecting = true;
                hasMovedDuringDrag = false;
                
                canvasState.update(s => ({ 
                    ...s, 
                    mode: 'box-selecting',
                    boxSelection: {
                        x: canvasCoords.x,
                        y: canvasCoords.y,
                        width: 0,
                        height: 0
                    }
                }));
            }
        }
    }
    
    // Handle mouse move for panning, connection drawing, and box selection
    function handleMouseMove(event) {
        mousePosition = { x: event.clientX, y: event.clientY };
        
        if (isDragging && $canvasState.mode === 'pan') {
            const deltaX = event.clientX - lastPanPoint.x;
            const deltaY = event.clientY - lastPanPoint.y;
            
            viewportActions.pan(deltaX, deltaY);
            lastPanPoint = { x: event.clientX, y: event.clientY };
        }
        
        if (isConnecting && tempConnection) {
            const canvasCoords = screenToCanvas(event.clientX, event.clientY);
            tempConnection.endX = canvasCoords.x;
            tempConnection.endY = canvasCoords.y;
            tempConnection = { ...tempConnection }; // Trigger reactivity
        }
        
        if (isBoxSelecting && $canvasState.mode === 'box-selecting') {
            const canvasCoords = screenToCanvas(event.clientX, event.clientY);
            const selection = {
                x: Math.min(boxSelectionStart.x, canvasCoords.x),
                y: Math.min(boxSelectionStart.y, canvasCoords.y),
                width: Math.abs(canvasCoords.x - boxSelectionStart.x),
                height: Math.abs(canvasCoords.y - boxSelectionStart.y)
            };
            
            // Mark as moved if we've dragged more than a few pixels
            if (!hasMovedDuringDrag && (selection.width > 3 || selection.height > 3)) {
                hasMovedDuringDrag = true;
                console.log('Started actual drag movement');
            }
            
            console.log('Box selection size:', selection.width, 'x', selection.height, 'hasMoved:', hasMovedDuringDrag);
            canvasState.update(s => ({ ...s, boxSelection: selection }));
        }
    }
    
    // Handle mouse up
    function handleMouseUp(event) {
        console.log('Mouse up - isBoxSelecting:', isBoxSelecting, 'hasMovedDuringDrag:', hasMovedDuringDrag);
        isDragging = false;
        
        if (isConnecting) {
            // Cancel connection if not dropped on a valid target
            isConnecting = false;
            tempConnection = null;
        }
        
        if (isBoxSelecting) {
            // Finish box selection - find nodes within selection
            const selection = $canvasState.boxSelection;
            console.log('Finishing box selection:', selection, 'hasMoved:', hasMovedDuringDrag);
            if (selection && hasMovedDuringDrag && (selection.width > 5 || selection.height > 5)) {
                const selectedNodeIds = $nodes.filter(node => {
                    const intersects = node.x < selection.x + selection.width &&
                           node.x + node.width > selection.x &&
                           node.y < selection.y + selection.height &&
                           node.y + node.height > selection.y;
                    return intersects;
                }).map(node => node.id);
                
                console.log('Box selected nodes:', selectedNodeIds);
                canvasState.update(s => ({ 
                    ...s, 
                    selectedNodes: selectedNodeIds,
                    selectedNode: selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
                }));
                
                // Suppress next double-click to prevent node creation after box selection
                suppressNextDoubleClick = true;
                setTimeout(() => {
                    suppressNextDoubleClick = false;
                }, 300);
            } else {
                // If box selection was too small or no movement, clear selection
                canvasState.update(s => ({ 
                    ...s, 
                    selectedNodes: [],
                    selectedNode: null
                }));
            }
            
            isBoxSelecting = false;
            lastBoxSelectionTime = Date.now();
            hasMovedDuringDrag = false;
        }
        
        canvasState.update(s => ({ 
            ...s, 
            mode: 'select',
            boxSelection: null
        }));
    }
    
    // Handle double click to create text node
    function handleDoubleClick(event) {
        console.log('Double click detected - suppressed:', suppressNextDoubleClick);
        
        if (suppressNextDoubleClick) {
            console.log('Suppressing double-click due to recent box selection');
            return;
        }
        
        // Only create node if double-clicking on empty space
        const clickedOnNode = event.target.closest('.node-card');
        const clickedOnConnection = event.target.closest('.connection-group');
        const clickedOnPalette = event.target.closest('.node-palette');
        
        if (!clickedOnNode && !clickedOnConnection && !clickedOnPalette) {
            console.log('Creating new node');
            const canvasCoords = screenToCanvas(event.clientX, event.clientY);
            nodeActions.add('input', canvasCoords.x, canvasCoords.y, '');
        }
    }
    
    // Handle drop from node palette
    function handleDrop(event) {
        event.preventDefault();
        const nodeType = event.dataTransfer.getData('text/plain');
        const canvasCoords = screenToCanvas(event.clientX, event.clientY);
        
        if (nodeType) {
            nodeActions.add(nodeType, canvasCoords.x, canvasCoords.y);
        }
    }
    
    function handleDragOver(event) {
        event.preventDefault();
    }
    
    // Touch support for mobile/trackpad
    let touchStartDistance = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    
    function handleTouchStart(event) {
        console.log('Touch start, fingers:', event.touches.length);
        if (event.touches.length === 2) {
            // Two finger pan/zoom
            event.preventDefault();
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            
            touchStartDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) + 
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            lastTouchCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        }
    }
    
    function handleTouchMove(event) {
        console.log('Touch move, fingers:', event.touches.length);
        if (event.touches.length === 2) {
            event.preventDefault();
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];
            
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) + 
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            const currentCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
            
            // Pan - only if we have a previous center
            if (lastTouchCenter.x !== 0 || lastTouchCenter.y !== 0) {
                const panDeltaX = currentCenter.x - lastTouchCenter.x;
                const panDeltaY = currentCenter.y - lastTouchCenter.y;
                
                // Add some sensitivity multiplier for trackpad
                const sensitivity = 1.5;
                viewportActions.pan(panDeltaX * sensitivity, panDeltaY * sensitivity);
            }
            
            // Zoom - only if distance changed significantly
            if (touchStartDistance > 0) {
                const distanceChange = Math.abs(currentDistance - touchStartDistance);
                if (distanceChange > 5) { // Minimum threshold to prevent jitter
                    const zoomFactor = currentDistance / touchStartDistance;
                    // Clamp zoom factor to prevent extreme zooming
                    const clampedZoomFactor = Math.max(0.8, Math.min(1.2, zoomFactor));
                    viewportActions.zoom(clampedZoomFactor, currentCenter.x, currentCenter.y);
                    touchStartDistance = currentDistance;
                }
            }
            
            lastTouchCenter = currentCenter;
        }
    }
    
    function handleTouchEnd(event) {
        if (event.touches.length < 2) {
            touchStartDistance = 0;
            lastTouchCenter = { x: 0, y: 0 };
        }
    }
    
    // Connection handling functions
    function startConnection(fromNodeId, fromPort) {
        const fromNode = $nodes.find(n => n.id === fromNodeId);
        if (!fromNode) return;
        
        isConnecting = true;
        const portX = fromPort === 'output' ? fromNode.x + fromNode.width : fromNode.x;
        const portY = fromNode.y + fromNode.height / 2;
        
        tempConnection = {
            fromNodeId,
            fromPort,
            startX: portX,
            startY: portY,
            endX: portX,
            endY: portY
        };
        
        canvasState.update(s => ({ ...s, mode: 'connecting' }));
    }
    
    function completeConnection(toNodeId, toPort) {
        if (!isConnecting || !tempConnection) return;
        
        // Don't connect to same node
        if (tempConnection.fromNodeId === toNodeId) {
            cancelConnection();
            return;
        }
        
        // Create the connection
        connectionActions.add(tempConnection.fromNodeId, toNodeId);
        cancelConnection();
    }
    
    function cancelConnection() {
        isConnecting = false;
        tempConnection = null;
        canvasState.update(s => ({ ...s, mode: 'select' }));
    }
    
    // Handle global keyboard events
    function handleKeyDown(event) {
        console.log('Key pressed:', event.key, 'Selected connection:', $canvasState.selectedConnection, 'Selected node:', $canvasState.selectedNode, 'Selected nodes:', $canvasState.selectedNodes);
        
        // Zoom shortcuts
        if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
            event.preventDefault();
            const rect = canvasElement.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            viewportActions.zoom(1.2, centerX, centerY);
        } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
            event.preventDefault();
            const rect = canvasElement.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            viewportActions.zoom(0.8, centerX, centerY);
        }
        
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if ($canvasState.selectedConnection) {
                console.log('Deleting connection:', $canvasState.selectedConnection);
                connectionActions.delete($canvasState.selectedConnection);
                canvasState.update(s => ({ ...s, selectedConnection: null }));
                event.preventDefault();
            } else if ($canvasState.selectedNodes && $canvasState.selectedNodes.length > 0) {
                console.log('Deleting multiple nodes:', $canvasState.selectedNodes);
                // Delete all selected nodes
                $canvasState.selectedNodes.forEach(nodeId => {
                    nodeActions.delete(nodeId);
                });
                canvasState.update(s => ({ ...s, selectedNodes: [], selectedNode: null }));
                event.preventDefault();
            } else if ($canvasState.selectedNode) {
                console.log('Deleting node:', $canvasState.selectedNode);
                nodeActions.delete($canvasState.selectedNode);
                canvasState.update(s => ({ ...s, selectedNode: null }));
                event.preventDefault();
            }
        }
        if (event.key === 'Escape') {
            if (isConnecting) {
                cancelConnection();
            } else {
                canvasState.update(s => ({ 
                    ...s, 
                    selectedNode: null, 
                    selectedConnection: null,
                    selectedNodes: []
                }));
            }
        }
    }
    
    // Clear selection when clicking canvas (but not after box selection)
    function handleCanvasClick(event) {
        // Focus canvas for keyboard events
        if (canvasElement) {
            canvasElement.focus();
        }
        
        // Only clear selection if this wasn't a box selection and we're not clicking on nodes
        const clickedOnNode = event.target.closest('.node-card');
        const clickedOnConnection = event.target.closest('.connection-group');
        const clickedOnPalette = event.target.closest('.node-palette');
        
        if (!isBoxSelecting && !clickedOnNode && !clickedOnConnection && !clickedOnPalette && Date.now() - lastBoxSelectionTime > 100) {
            canvasState.update(s => ({ 
                ...s, 
                selectedNode: null, 
                selectedConnection: null,
                selectedNodes: []
            }));
        }
    }
    
    // Expose connection functions to child components
    export { startConnection, completeConnection, cancelConnection };
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="canvas-container">
    <!-- Node Palette -->
    <NodePalette />
    
    <!-- Main Canvas -->
    <div 
        class="canvas-viewport"
        bind:this={canvasElement}
        tabindex="-1"
        on:wheel={handleWheel}
        on:mousedown={handleMouseDown}
        on:mousemove={handleMouseMove}
        on:mouseup={handleMouseUp}
        on:dblclick={handleDoubleClick}
        on:drop={handleDrop}
        on:dragover={handleDragOver}
        on:touchstart={handleTouchStart}
        on:touchmove={handleTouchMove}
        on:touchend={handleTouchEnd}
        on:contextmenu|preventDefault
        on:click={handleCanvasClick}
        on:keydown={handleKeyDown}
    >
        <div 
            class="canvas-content"
            style="transform: translate({$viewport.x}px, {$viewport.y}px) scale({$viewport.zoom})"
        >
            <!-- SVG layer for connections -->
            <svg class="connections-layer">
                <!-- Arrow marker definition -->
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                            refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
                    </marker>
                </defs>
                
                <!-- Render connections -->
                {#each $connections as connection}
                    <ConnectionLine {connection} {nodes} />
                {/each}
                
                <!-- Render temporary connection while dragging -->
                {#if tempConnection}
                    <path
                        d="M {tempConnection.startX} {tempConnection.startY} C {tempConnection.startX + 50} {tempConnection.startY}, {tempConnection.endX - 50} {tempConnection.endY}, {tempConnection.endX} {tempConnection.endY}"
                        stroke="#2196f3"
                        stroke-width="2"
                        stroke-dasharray="5,5"
                        fill="none"
                        marker-end="url(#arrowhead)"
                        class="temp-connection"
                    />
                {/if}
            </svg>
            
            <!-- Nodes layer -->
            <div class="nodes-layer">
                {#each $nodes as node}
                    <Node 
                        {node} 
                        {startConnection} 
                        {completeConnection} 
                        isConnecting={$canvasState.mode === 'connecting'}
                        isSelected={$canvasState.selectedNodes.includes(node.id) || $canvasState.selectedNode === node.id}
                    />
                {/each}
            </div>
            
            <!-- Box selection overlay -->
            {#if $canvasState.boxSelection && $canvasState.mode === 'box-selecting'}
                <div 
                    class="box-selection"
                    style="
                        left: {$canvasState.boxSelection.x}px;
                        top: {$canvasState.boxSelection.y}px;
                        width: {$canvasState.boxSelection.width}px;
                        height: {$canvasState.boxSelection.height}px;
                    "
                ></div>
            {/if}
        </div>
        
        <!-- Canvas info overlay -->
        <div class="canvas-info">
            <div class="zoom-info">Zoom: {Math.round($viewport.zoom * 100)}%</div>
            <div class="node-count">{$nodes.length} nodes</div>
        </div>
    </div>
</div>

<style>
    .canvas-container {
        display: flex;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: #f5f5f5;
    }
    
    .canvas-viewport {
        flex: 1;
        position: relative;
        cursor: grab;
        background: 
            radial-gradient(circle, #ddd 1px, transparent 1px);
        background-size: 20px 20px;
        overflow: hidden;
    }
    
    .canvas-viewport:active {
        cursor: grabbing;
    }
    
    .canvas-viewport:focus {
        outline: none;
    }
    
    .canvas-content {
        position: relative;
        width: 100%;
        height: 100%;
        transform-origin: 0 0;
    }
    
    .connections-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
    }
    
    .connections-layer :global(.connection-group) {
        pointer-events: all;
    }
    
    .nodes-layer {
        position: relative;
        z-index: 2;
    }
    
    .canvas-info {
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(255, 255, 255, 0.9);
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        color: #666;
        pointer-events: none;
    }
    
    .zoom-info, .node-count {
        margin: 2px 0;
    }
    
    :global(.temp-connection) {
        animation: dash 1s linear infinite;
    }
    
    @keyframes dash {
        to {
            stroke-dashoffset: -10;
        }
    }
    
    .box-selection {
        position: absolute;
        border: 2px dashed #2196f3;
        background: rgba(33, 150, 243, 0.1);
        pointer-events: none;
        z-index: 10;
    }
</style>