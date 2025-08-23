<script>
    import { executionState, workflowActions } from '../stores/workflows.js';
    import { nodeActions, nodeDataStore, nodes } from '../stores/nodes.js';
    import { copyText, copyMachineConfig, copyMachineMetadata, copyNetworkConfig, copyNetworkMetadata, pasteConfig } from './clipboard.js';
    
    export let container;
    export let blockNodeInteractions = false;
    export let startConnection = null;
    export const completeConnection = null;
    export const isConnecting = false;
    
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let mouseDownPos = { x: 0, y: 0 };
    
    
    $: isExecuting = $executionState.activeWorkflows.has(container.id);
    $: showPlayButton = (container.isWorkflow && container.nodes && container.nodes.length > 1) || 
                       (container.isFactory && container.machines && container.machines.length > 0) ||
                       (container.isNetwork && container.factories && container.factories.length > 0);
    
    
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
        
        // Calculate movement delta with zoom scaling
        const canvas = document.querySelector('.canvas-content');
        const canvasTransform = getComputedStyle(canvas).transform;
        
        // Parse transform matrix to get scale
        const matrix = new DOMMatrix(canvasTransform);
        const scale = matrix.a; // scale factor
        
        const deltaX = (event.clientX - mouseDownPos.x) / scale;
        const deltaY = (event.clientY - mouseDownPos.y) / scale;
        
        // Move all content in the container
        if (container.isNetwork) {
            // For network containers, move all factories and standalone nodes
            container.factories.forEach(factory => {
                // Move each factory's machines
                factory.machines.forEach(machine => {
                    machine.nodes.forEach(node => {
                        nodeActions.move(node.id, node.x + deltaX, node.y + deltaY);
                    });
                });
                
                // Move factory's individual nodes
                if (factory.nodeIds) {
                    factory.nodeIds.forEach(nodeId => {
                        let currentNode = /** @type {any} */ (null);
                        const unsubscribe = nodes.subscribe(nodeList => {
                            currentNode = nodeList.find(n => n.id === nodeId) || null;
                        });
                        unsubscribe();
                        
                        if (currentNode && currentNode.x !== undefined && currentNode.y !== undefined) {
                            nodeActions.move(nodeId, currentNode.x + deltaX, currentNode.y + deltaY);
                        }
                    });
                }
            });
            
            // Move standalone nodes in the network
            if (container.nodeIds) {
                container.nodeIds.forEach(nodeId => {
                    let currentNode = /** @type {any} */ (null);
                    const unsubscribe = nodes.subscribe(nodeList => {
                        currentNode = nodeList.find(n => n.id === nodeId) || null;
                    });
                    unsubscribe();
                    
                    if (currentNode && currentNode.x !== undefined && currentNode.y !== undefined) {
                        nodeActions.move(nodeId, currentNode.x + deltaX, currentNode.y + deltaY);
                    }
                });
            }
        } else if (container.isFactory) {
            // For factory containers, move all machines and individual nodes
            container.machines.forEach(machine => {
                // Move each machine's nodes
                machine.nodes.forEach(node => {
                    nodeActions.move(node.id, node.x + deltaX, node.y + deltaY);
                });
            });
            
            // Move individual nodes that are directly connected to machines
            if (container.nodeIds) {
                container.nodeIds.forEach(nodeId => {
                    // Get current node position
                    let currentNode = /** @type {any} */ (null);
                    const unsubscribe = nodes.subscribe(nodeList => {
                        currentNode = nodeList.find(n => n.id === nodeId) || null;
                    });
                    unsubscribe();
                    
                    if (currentNode && currentNode.x !== undefined && currentNode.y !== undefined) {
                        nodeActions.move(nodeId, currentNode.x + deltaX, currentNode.y + deltaY);
                    }
                });
            }
        } else if (container.nodes) {
            // For regular workflow containers, move all nodes
            container.nodes.forEach(node => {
                nodeActions.move(node.id, node.x + deltaX, node.y + deltaY);
            });
        }
        
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
    
    function handleRightClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Use global context menu system
        if (window.showCanvasContextMenu) {
            const menuItems = [
                {
                    label: 'Copy Text',
                    icon: '📄',
                    handler: async () => {
                        let allText = '';
                        if (container.isFactory) {
                            // For factory containers, collect from machines and individual nodes
                            const machineTexts = (container.machines || [])
                                .flatMap(machine => machine.nodes || [])
                                .filter(node => node.content)
                                .map(node => `${node.title}:\n${node.content}`);
                            allText = machineTexts.join('\n\n---\n\n');
                        } else if (container.nodes) {
                            allText = container.nodes
                                .filter(node => node.content)
                                .map(node => `${node.title}:\n${node.content}`)
                                .join('\n\n---\n\n');
                        }
                        
                        if (allText.trim()) {
                            const textResult = await copyText(allText);
                            if (!textResult.success) {
                                console.error('Failed to copy text:', textResult.error);
                            }
                        }
                    },
                    disabled: (() => {
                        if (container.isFactory) {
                            return !(container.machines || []).some(machine => 
                                (machine.nodes || []).some(node => node.content)
                            );
                        }
                        return !container.nodes || !container.nodes.some(node => node.content);
                    })()
                },
                {
                    separator: true
                },
                {
                    label: container.isNetwork ? 'Copy Network Config' : container.isFactory ? 'Copy Factory Config' : 'Copy Machine Config',
                    icon: '⚙️',
                    handler: async () => {
                        let configResult;
                        if (container.isNetwork) {
                            configResult = await copyNetworkConfig(container, $nodeDataStore);
                        } else {
                            configResult = await copyMachineConfig(container, $nodeDataStore);
                        }
                        if (!configResult.success) {
                            console.error('Failed to copy config:', configResult.error);
                        }
                    }
                },
                {
                    label: container.isNetwork ? 'Copy Network Metadata' : container.isFactory ? 'Copy Factory Metadata' : 'Copy Machine Metadata',
                    icon: '🔧',
                    handler: async () => {
                        let metadataResult;
                        if (container.isNetwork) {
                            metadataResult = await copyNetworkMetadata(container, $nodeDataStore);
                        } else {
                            metadataResult = await copyMachineMetadata(container, $nodeDataStore);
                        }
                        if (!metadataResult.success) {
                            console.error('Failed to copy metadata:', metadataResult.error);
                        }
                    }
                },
                {
                    label: container.isFactory ? 'Paste Factory Config' : 'Paste Machine Config',
                    icon: '📋',
                    handler: async () => {
                        const pasteResult = await pasteConfig();
                        if (pasteResult.success) {
                            console.log('Config pasted successfully (feature not implemented)');
                        } else {
                            console.error('Failed to paste config:', pasteResult.error);
                        }
                    }
                },
                {
                    separator: true
                },
                {
                    label: 'Delete',
                    icon: '🗑️',
                    handler: async () => {
                        if (container.isFactory) {
                            // Delete all machines and nodes in the factory
                            if (container.machines) {
                                container.machines.forEach(machine => {
                                    if (machine.nodes) {
                                        machine.nodes.forEach(node => {
                                            nodeActions.delete(node.id);
                                        });
                                    }
                                });
                            }
                            if (container.nodeIds) {
                                container.nodeIds.forEach(nodeId => {
                                    nodeActions.delete(nodeId);
                                });
                            }
                        } else {
                            // Delete individual machine
                            if (container.nodes) {
                                container.nodes.forEach(node => {
                                    nodeActions.delete(node.id);
                                });
                            }
                        }
                    }
                }
            ];
            
            window.showCanvasContextMenu(event.clientX, event.clientY, menuItems);
        }
    }
    
    
    // Machine port handlers - only for output
    function handlePortMouseDown(event, port) {
        event.stopPropagation();
        if (port === 'output' && startConnection) {
            startConnection(container.id, port);
        }
    }
    
    function handlePortMouseUp(event, port) {
        event.stopPropagation();
        // Machines only have outputs, they don't accept connections
    }
</script>

{#if container.isWorkflow || container.isFactory || container.isNetwork}
    <div 
        class="workflow-container"
        class:factory-container={container.isFactory}
        class:network-container={container.isNetwork}
        class:executing={isExecuting}
        class:dragging={isDragging}
        style="
            left: {container.bounds.x}px;
            top: {container.bounds.y}px;
            width: {container.bounds.width}px;
            height: {container.bounds.height}px;
        "
        on:mousedown={handleMouseDown}
        on:contextmenu={handleRightClick}
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
            {#if container.isNetwork}
                Node Network ({container.factories?.length || 0} factories, {container.nodeIds?.length || 0} nodes)
            {:else if container.isFactory}
                Node Factory ({container.machines?.length || 0} machines, {container.nodeIds?.length || 0} nodes)
            {:else}
                Node Machine ({container.nodes?.length || 0} nodes)
            {/if}
        </div>
        
        <!-- Output port for both machines and factories -->
        <div 
            class="machine-port output-port" 
            title={container.isFactory ? 'Factory Output' : 'Machine Output'}
            on:mousedown={(e) => handlePortMouseDown(e, 'output')}
            on:mouseup={(e) => handlePortMouseUp(e, 'output')}
        ></div>
    </div>
{/if}


<style>
    .workflow-container {
        position: absolute;
        pointer-events: none;
        z-index: 0; /* Default z-index for a Machine */
        cursor: url('../assets/cursor-grab.svg') 16 16, grab;
    }
    
    .workflow-container:active {
        cursor: url('../assets/cursor-grabbing.svg') 16 16, grabbing;
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
    
    /* Factory containers have solid orange styling like machines */
    .factory-container .container-border {
        border: 2px solid #f59e0b; /* Orange solid border */
        background: rgba(245, 158, 11, 0.08);
        pointer-events: all; /* Allow dragging factory */
    }
    
    /* Factory containers allow interaction with contained elements */
    .factory-container {
        pointer-events: none; /* Allow clicks to pass through to contained machines */
    }
    
    .factory-container .container-border {
        pointer-events: all; /* But allow dragging the factory border */
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
        z-index: 1000; /* Above all containers */
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
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
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
        cursor: url('../assets/cursor-not-allowed.svg') 16 16, not-allowed;
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
    
    /* Machine ports for connecting machines together */
    .machine-port {
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        border: 3px solid #4f46e5;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        pointer-events: all;
        transition: all 0.2s ease;
        z-index: 10;
    }
    
    .machine-port.output-port {
        right: -8px;
        top: 50%;
        transform: translateY(-50%);
    }
    
    .machine-port:hover {
        background: #4f46e5;
        border-color: #6366f1;
        transform: translateY(-50%) scale(1.2);
        box-shadow: 0 0 8px rgba(79, 70, 229, 0.5);
    }
    
    .workflow-container.executing .machine-port {
        border-color: #10b981;
        animation: pulse-port 2s ease-in-out infinite;
    }
    
    /* Factory ports are orange */
    .factory-container .machine-port {
        border-color: #f59e0b;
    }
    
    .factory-container .machine-port:hover {
        background: #f59e0b;
        border-color: #d97706;
    }
    
    @keyframes pulse-port {
        0%, 100% {
            box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.7);
        }
        50% {
            box-shadow: 0 0 0 4px rgba(79, 70, 229, 0);
        }
    }
    
    /* Factory container specific styles - orange container */
    .factory-container .container-border {
        border: 2px solid #f59e0b; /* Orange solid border */
        border-radius: 12px;
        background: rgba(245, 158, 11, 0.08);
    }
    
    .factory-container:hover .container-border {
        border-color: #f59e0b;
        background: rgba(245, 158, 11, 0.12);
        box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
    }
    
    .factory-container.executing .container-border {
        border-color: #10b981;
        background: rgba(16, 185, 129, 0.1);
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    
    .factory-container .container-label {
        background: rgba(251, 191, 36, 0.9);
        color: #92400e;
        border-color: rgba(245, 158, 11, 0.3);
    }
    
    /* Removed complex factory border system - now using simple container like machines */
    
    /* Ensure play buttons inside factories are clickable */
    .factory-container .play-button-container {
        z-index: 1000; /* Above factory borders */
        pointer-events: all;
    }
    
    /* Factory containers are above networks but below machines */
    .factory-container {
        z-index: -1; /* Below machines, above networks */
    }
    
    .factory-container.dragging {
        z-index: 10; /* Above everything when dragging factory */
    }
    
    /* Network container specific styles - teal/green container */
    .network-container .container-border {
        border: 2px solid #14b8a6; /* Teal solid border */
        border-radius: 12px;
        background: rgba(20, 184, 166, 0.08);
        pointer-events: all; /* Allow dragging network */
    }
    
    /* Network containers allow interaction with contained elements */
    .network-container {
        pointer-events: none; /* Allow clicks to pass through to contained elements */
    }
    
    .network-container .container-border {
        pointer-events: all; /* But allow dragging the network border */
    }
    
    .network-container:hover .container-border {
        border-color: #14b8a6;
        background: rgba(20, 184, 166, 0.12);
        box-shadow: 0 0 15px rgba(20, 184, 166, 0.2);
    }
    
    .network-container.executing .container-border {
        border-color: #10b981;
        background: rgba(16, 185, 129, 0.1);
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    
    .network-container .container-label {
        background: rgba(45, 212, 191, 0.9);
        color: #0f766e;
        border-color: rgba(20, 184, 166, 0.3);
    }
    
    /* Network ports are teal */
    .network-container .machine-port {
        border-color: #14b8a6;
    }
    
    .network-container .machine-port:hover {
        background: #14b8a6;
        border-color: #0d9488;
    }
    
    /* Network containers are behind contained elements */
    .network-container {
        z-index: -2; /* Below factories and machines */
    }
    
    .network-container.dragging {
        z-index: 10; /* Above everything when dragging network */
    }
    
    /* Ensure network play buttons are accessible */
    .network-container .play-button-container {
        z-index: 1000; /* Above all containers */
        pointer-events: all;
    }
    
    .factory-container.dragging {
        z-index: 10; /* Above everything when dragging factory */
    }
</style>