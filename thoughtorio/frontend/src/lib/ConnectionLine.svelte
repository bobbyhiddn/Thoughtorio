<script>
    import { canvasState } from '../stores/canvas.js';
    import { nodes, connectionActions } from '../stores/nodes.js';
    
    export let connection;
    
    // Find the connected nodes
    $: fromNode = $nodes.find(n => n.id === connection.fromId);
    $: toNode = $nodes.find(n => n.id === connection.toId);
    $: isSelected = $canvasState.selectedConnection === connection.id;
    
    // Calculate bezier path
    function getPortCoordinates(node, port) {
        if (!node) return { x: 0, y: 0 };

        switch (port) {
            case 'input':
                return { x: node.x, y: node.y + node.height / 2 };
            case 'output':
                return { x: node.x + node.width, y: node.y + node.height / 2 };
            case 'top':
            case 'ai_input':
                return { x: node.x + node.width / 2, y: node.y };
            case 'bottom':
            case 'ai_output':
                return { x: node.x + node.width / 2, y: node.y + node.height };
            default:
                // Default to old logic if ports are not defined
                return { x: node.x + node.width, y: node.y + node.height / 2 };
        }
    }

    function getBezierPath(fromNode, toNode, conn) {
        if (!fromNode || !toNode || !conn) return '';

        const start = getPortCoordinates(fromNode, conn.fromPort);
        const end = getPortCoordinates(toNode, conn.toPort);

        const { x: x1, y: y1 } = start;
        const { x: x2, y: y2 } = end;

        // Control points for smooth curve
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const controlOffset = Math.max(dx * 0.5, dy * 0.3, 50);

        let cx1, cy1, cx2, cy2;

        // Adjust control points based on port locations
        if (conn.fromPort === 'output' || conn.fromPort === 'input') {
            cx1 = x1 + (conn.fromPort === 'output' ? controlOffset : -controlOffset);
            cy1 = y1;
        } else {
            cx1 = x1;
            cy1 = y1 + (conn.fromPort === 'bottom' || conn.fromPort === 'ai_output' ? controlOffset : -controlOffset);
        }

        if (conn.toPort === 'output' || conn.toPort === 'input') {
            cx2 = x2 - (conn.toPort === 'input' ? controlOffset : -controlOffset);
            cy2 = y2;
        } else {
            cx2 = x2;
            cy2 = y2 - (conn.toPort === 'top' || conn.toPort === 'ai_input' ? controlOffset : -controlOffset);
        }

        return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }

    $: pathData = getBezierPath(fromNode, toNode, connection);
    
    function handleConnectionClick(event) {
        event.stopPropagation();
        console.log('Connection clicked, setting selection to:', connection.id);
        canvasState.update(s => ({ 
            ...s, 
            selectedConnection: connection.id,
            selectedNode: null,
            selectedNodes: []
        }));
    }
    
    function handleConnectionDelete() {
        connectionActions.delete(connection.id);
        canvasState.update(s => ({ ...s, selectedConnection: null }));
    }

    function handleConnectionKeyDown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleConnectionClick(event);
        }
    }

    function handleDeleteKeyDown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleConnectionDelete();
        }
    }
</script>

{#if fromNode && toNode}
    <g class="connection-group" class:selected={isSelected}>
        <!-- Invisible thick line for easier clicking -->
        <path
            d={pathData}
            stroke="transparent"
            stroke-width="12"
            fill="none"
            cursor="pointer"
            on:click={handleConnectionClick}
            on:keydown={handleConnectionKeyDown}
            tabindex="0"
            role="button"
            aria-label="Select connection"
        />
        
        <!-- Selection stroke (wider background) -->
        {#if isSelected}
            <path
                d={pathData}
                stroke="#2196f3"
                stroke-width="6"
                fill="none"
                class="selection-stroke"
                opacity="0.3"
            />
        {/if}
        
        <!-- Visible connection line -->
        <path
            d={pathData}
            stroke={isSelected ? "#2196f3" : "#666"}
            stroke-width={isSelected ? "3" : "2"}
            fill="none"
            marker-end="url(#arrowhead)"
            class="connection-line"
        />
        
        <!-- Delete button when selected -->
        {#if isSelected}
            {@const midPoint = { 
                x: (fromNode.x + fromNode.width + toNode.x) / 2, 
                y: (fromNode.y + fromNode.height/2 + toNode.y + toNode.height/2) / 2 
            }}
            <g 
                class="delete-button-group"
                tabindex="0"
                role="button"
                aria-label="Delete connection"
                on:click|stopPropagation={handleConnectionDelete}
                on:keydown|stopPropagation={handleDeleteKeyDown}
            >
                <circle
                    cx={midPoint.x}
                    cy={midPoint.y}
                    r="12"
                    fill="#ff4444"
                    stroke="white"
                    stroke-width="2"
                    cursor="pointer"
                    class="delete-button"
                />
                <text
                    x={midPoint.x}
                    y={midPoint.y + 4}
                    text-anchor="middle"
                    fill="white"
                    font-size="14"
                    font-weight="bold"
                    cursor="pointer"
                    class="delete-text"
                >×</text>
            </g>
        {/if}
    </g>
{/if}

<style>
    .connection-line {
        transition: stroke 0.2s ease, stroke-width 0.2s ease;
    }
    
    .connection-group:hover .connection-line {
        stroke: #2196f3;
        stroke-width: 3;
    }
    
    .connection-group.selected .connection-line {
        stroke: #2196f3;
        stroke-width: 3;
    }
    
    .delete-button {
        transition: all 0.2s ease;
    }
    
    .delete-button:hover {
        transform: scale(1.1);
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
    }
    
    .delete-text {
        pointer-events: none;
    }
</style>