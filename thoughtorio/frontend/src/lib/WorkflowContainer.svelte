<script>
    import { executionState, workflowActions } from '../stores/workflows.js';
    import { nodeActions } from '../stores/nodes.js';
    
    export let container;
    export let blockNodeInteractions = false;
    
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let mouseDownPos = { x: 0, y: 0 };
    
    $: isExecuting = $executionState.activeWorkflows.has(container.id);
    $: showPlayButton = container.isWorkflow && container.nodes.length > 1;
    
    // Debug execution state changes
    $: {
        console.log('WorkflowContainer reactive update - isExecuting:', isExecuting, 'activeWorkflows:', $executionState.activeWorkflows, 'container.id:', container.id);
    }
    
    // Handle container dragging
    function handleMouseDown(event) {
        // Only handle if clicking on container background, not nodes
        if (event.target.closest('.node-card')) {
            return;
        }
        
        if (blockNodeInteractions) {
            event.stopPropagation();
            return;
        }
        
        event.stopPropagation();
        event.preventDefault();
        
        isDragging = false; // Will become true if we actually move
        mouseDownPos = { x: event.clientX, y: event.clientY };
        
        const rect = event.currentTarget.getBoundingClientRect();
        dragOffset.x = event.clientX - rect.left;
        dragOffset.y = event.clientY - rect.top;
        
        // Add global listeners for robust dragging
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    
    function handleGlobalMouseMove(event) {
        // Check if we should start dragging
        const distance = Math.sqrt(
            Math.pow(event.clientX - mouseDownPos.x, 2) + 
            Math.pow(event.clientY - mouseDownPos.y, 2)
        );
        
        if (!isDragging && distance > 5) {
            isDragging = true;
            console.log('Started dragging workflow container:', container.id);
        }
        
        if (!isDragging) return;
        
        // Calculate movement delta
        const deltaX = event.clientX - mouseDownPos.x;
        const deltaY = event.clientY - mouseDownPos.y;
        
        // Move all nodes in the container
        container.nodes.forEach(node => {
            nodeActions.move(node.id, node.x + deltaX, node.y + deltaY);
        });
        
        // Update mouse position for next delta calculation
        mouseDownPos = { x: event.clientX, y: event.clientY };
    }
    
    function handleGlobalMouseUp() {
        isDragging = false;
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
    
    // Execute workflow
    function executeWorkflow() {
        console.log('WorkflowContainer executeWorkflow called, isExecuting:', isExecuting, 'container.id:', container.id);
        if (!isExecuting) {
            console.log('Calling workflowActions.execute with container.id:', container.id);
            workflowActions.execute(container.id);
        } else {
            console.log('Already executing, skipping');
        }
    }
    
    // Stop workflow execution
    function stopWorkflow() {
        if (isExecuting) {
            workflowActions.stop(container.id);
        }
    }
</script>

{#if container.isWorkflow}
    <div 
        class="workflow-container"
        class:executing={isExecuting}
        class:dragging={isDragging}
        style="
            left: {container.bounds.x}px;
            top: {container.bounds.y}px;
            width: {container.bounds.width}px;
            height: {container.bounds.height}px;
        "
        on:mousedown={handleMouseDown}
    >
        <!-- Container border -->
        <div class="container-border"></div>
        
        <!-- Play/Stop button -->
        {#if showPlayButton}
            <div class="play-button-container">
                <button 
                    class="play-button"
                    class:stop-button={isExecuting}
                    on:click|stopPropagation={isExecuting ? stopWorkflow : executeWorkflow}
                    disabled={false}
                    title={isExecuting ? 'Stop execution' : 'Execute workflow'}
                >
                    {#if isExecuting}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="1"/>
                        </svg>
                    {:else}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="8,5 19,12 8,19"/>
                        </svg>
                    {/if}
                </button>
                
                <!-- Execution indicator -->
                {#if isExecuting}
                    <div class="execution-indicator">
                        <div class="pulse"></div>
                    </div>
                {/if}
            </div>
        {/if}
        
        <!-- Container label -->
        <div class="container-label">
            Workflow ({container.nodes.length} nodes)
        </div>
    </div>
{/if}

<style>
    .workflow-container {
        position: absolute;
        pointer-events: none;
        z-index: 0; /* Behind nodes but above canvas */
        cursor: grab;
    }
    
    .workflow-container:active {
        cursor: grabbing;
    }
    
    .workflow-container.dragging {
        z-index: 5; /* Above nodes when dragging */
    }
    
    .container-border {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 2px dashed #4f46e5;
        border-radius: 12px;
        background: rgba(79, 70, 229, 0.05);
        pointer-events: all;
        transition: all 0.2s ease;
    }
    
    .workflow-container.executing .container-border {
        border-color: #10b981;
        background: rgba(16, 185, 129, 0.1);
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    
    .workflow-container:hover .container-border {
        border-color: #6366f1;
        background: rgba(79, 70, 229, 0.1);
    }
    
    .play-button-container {
        position: absolute;
        top: -40px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: all;
    }
    
    .play-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: #4f46e5;
        color: white;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
        transition: all 0.2s ease;
    }
    
    .play-button:hover {
        background: #6366f1;
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
    }
    
    .play-button.stop-button {
        background: #ef4444;
    }
    
    .play-button.stop-button:hover {
        background: #f87171;
    }
    
    .play-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
    
    .execution-indicator {
        position: relative;
        width: 12px;
        height: 12px;
    }
    
    .pulse {
        position: absolute;
        width: 100%;
        height: 100%;
        background: #10b981;
        border-radius: 50%;
        animation: pulse 1.5s ease-in-out infinite;
    }
    
    @keyframes pulse {
        0% {
            transform: scale(0.8);
            opacity: 1;
        }
        50% {
            transform: scale(1.2);
            opacity: 0.7;
        }
        100% {
            transform: scale(0.8);
            opacity: 1;
        }
    }
    
    .container-label {
        position: absolute;
        bottom: -25px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(4px);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        color: #6b7280;
        font-weight: 500;
        white-space: nowrap;
        pointer-events: none;
        border: 1px solid rgba(79, 70, 229, 0.2);
    }
    
    .workflow-container.executing .container-label {
        color: #059669;
        border-color: rgba(16, 185, 129, 0.3);
    }
</style>