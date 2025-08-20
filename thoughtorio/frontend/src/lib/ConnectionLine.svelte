<script>
    import { canvasState } from '../stores/canvas.js';
    import { connectionActions } from '../stores/nodes.js';
    
    export let connection;
    export let nodes;
    
    // Find the connected nodes
    $: fromNode = $nodes.find(n => n.id === connection.fromId);
    $: toNode = $nodes.find(n => n.id === connection.toId);
    $: isSelected = $canvasState.selectedConnection === connection.id;
    
    // Calculate bezier path
    function getBezierPath(fromNode, toNode) {
        if (!fromNode || !toNode) return '';
        
        // Start point (right edge of from node)
        const x1 = fromNode.x + fromNode.width;
        const y1 = fromNode.y + fromNode.height / 2;
        
        // End point (left edge of to node)
        const x2 = toNode.x;
        const y2 = toNode.y + toNode.height / 2;
        
        // Control points for smooth curve
        const dx = Math.abs(x2 - x1);
        const controlOffset = Math.min(dx * 0.5, 100);
        
        const cx1 = x1 + controlOffset;
        const cy1 = y1;
        const cx2 = x2 - controlOffset;
        const cy2 = y2;
        
        return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }
    
    $: pathData = getBezierPath(fromNode, toNode);
    
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
            <circle
                cx={midPoint.x}
                cy={midPoint.y}
                r="12"
                fill="#ff4444"
                stroke="white"
                stroke-width="2"
                cursor="pointer"
                on:click|stopPropagation={handleConnectionDelete}
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
                on:click|stopPropagation={handleConnectionDelete}
                class="delete-text"
            >×</text>
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