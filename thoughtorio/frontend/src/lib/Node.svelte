<script>
    import { onMount, afterUpdate } from 'svelte';
    import { canvasState } from '../stores/canvas.js';
    import { nodeActions } from '../stores/nodes.js';
    import { executionState } from '../stores/workflows.js';
    import { copyText, copyNodeConfig, copyNodeMetadata, pasteConfig } from './clipboard.js';
    
    export let node;
    export let startConnection = null;
    export let completeConnection = null;
    export let isConnecting = false;
    export let isSelected = false;
    export let blockNodeInteractions = false;
    
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let isEditing = false;
    let contentElement;
    let mouseDownTime = 0;
    let mouseDownPos = { x: 0, y: 0 };
    let nodeElement;
    
    // Get node type styling
    function getNodeStyle(type) {
        switch (type) {
            case 'input':
                return {
                    background: '#e3f2fd',
                    border: '#2196f3',
                    icon: '✏️'
                };
            case 'dynamic':
                return {
                    background: '#f3e5f5',
                    border: '#9c27b0',
                    icon: '🤖'
                };
            case 'static':
                return {
                    background: '#e8f5e8',
                    border: '#4caf50',
                    icon: '📄'
                };
            default:
                return {
                    background: '#f5f5f5',
                    border: '#999',
                    icon: '📦'
                };
        }
    }
    
    $: nodeStyle = getNodeStyle(node.type);
    $: isExecuting = $executionState.activeNodes.has(node.id);
    $: isCompleted = $executionState.completedNodes.has(node.id);
    
    // Context menu items
    $: contextMenuItems = [
        {
            label: 'Copy Text',
            icon: '📄',
            action: 'copy-text',
            disabled: !node.content
        },
        {
            label: 'Copy Config',
            icon: '⚙️',
            action: 'copy-config'
        },
        {
            label: 'Copy Metadata',
            icon: '🔧',
            action: 'copy-metadata'
        },
        {
            label: 'Paste Config',
            icon: '📋',
            action: 'paste-config'
        },
        { separator: true },
        {
            label: 'Delete Node',
            icon: '🗑️',
            action: 'delete',
            shortcut: 'Del'
        }
    ];
    
    // Handle node interactions
    function handleMouseDown(event) {
        if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
            return; // Don't handle when editing text
        }
        
        // Don't handle if canvas is blocking node interactions
        if (blockNodeInteractions || $canvasState.mode === 'box-selecting') {
            event.stopPropagation();
            return;
        }
        
        // Prevent event from bubbling to canvas
        event.stopPropagation();
        event.preventDefault();
        mouseDownTime = Date.now();
        mouseDownPos = { x: event.clientX, y: event.clientY };
        
        const rect = event.currentTarget.getBoundingClientRect();
        dragOffset.x = event.clientX - rect.left;
        dragOffset.y = event.clientY - rect.top;
        
        // Add global mouse listeners
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
    }
    
    function handleClick(event) {
        if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
            return;
        }
        
        event.stopPropagation();
        console.log('Node clicked:', node.id);
        
        // Select this node
        canvasState.update(s => ({ 
            ...s, 
            selectedNode: node.id, 
            selectedConnection: null 
        }));
    }
    
    function handleRightClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Select this node
        canvasState.update(s => ({ 
            ...s, 
            selectedNode: node.id, 
            selectedConnection: null 
        }));
        
        // Use global context menu system
        if (window.showCanvasContextMenu) {
            const menuItems = contextMenuItems.filter(item => !item.separator).map(item => ({
                label: item.label,
                icon: item.icon,
                handler: () => handleContextMenuAction({ detail: { action: item.action } }),
                disabled: item.disabled
            }));
            
            // Add separators back in their original positions
            const menuWithSeparators = [];
            let itemIndex = 0;
            contextMenuItems.forEach(item => {
                if (item.separator) {
                    menuWithSeparators.push({ separator: true });
                } else {
                    menuWithSeparators.push(menuItems[itemIndex]);
                    itemIndex++;
                }
            });
            
            window.showCanvasContextMenu(event.clientX, event.clientY, menuWithSeparators);
        }
    }
    
    async function handleContextMenuAction(event) {
        const action = event.detail.action;
        
        try {
            switch (action) {
                case 'copy-text':
                    const textResult = await copyText(node.content);
                    if (textResult.success) {
                        console.log('Node text copied to clipboard');
                    } else {
                        console.error('Failed to copy text:', textResult.error);
                    }
                    break;
                    
                case 'copy-config':
                    const nodeData = nodeActions.getNodeData(node.id);
                    console.log('Retrieved node data:', nodeData);
                    if (nodeData) {
                        const configResult = await copyNodeConfig(nodeData);
                        if (configResult.success) {
                            console.log('Node config copied to clipboard successfully');
                            console.log('Config:', configResult.elegantConfig);
                        } else {
                            console.error('Failed to copy config:', configResult.error);
                        }
                    } else {
                        console.error('No node data found for node:', node.id);
                    }
                    break;
                    
                case 'copy-metadata':
                    const nodeDataForMetadata = nodeActions.getNodeData(node.id);
                    console.log('Retrieved node data for metadata:', nodeDataForMetadata);
                    if (nodeDataForMetadata) {
                        const metadataResult = await copyNodeMetadata(nodeDataForMetadata);
                        if (metadataResult.success) {
                            console.log('Node metadata copied to clipboard successfully');
                            console.log('Metadata YAML:', metadataResult.yamlConfig);
                        } else {
                            console.error('Failed to copy metadata:', metadataResult.error);
                        }
                    } else {
                        console.error('No node data found for node:', node.id);
                    }
                    break;
                    
                case 'paste-config':
                    const pasteResult = await pasteConfig();
                    if (pasteResult.success) {
                        let config = null;
                        
                        if (pasteResult.type === 'node_config' || pasteResult.type === 'raw_yaml') {
                            config = pasteResult.data.config;
                        }
                        
                        if (config) {
                            console.log('Pasting YAML config to node:', node.id);
                            console.log('YAML content:', config);
                            
                            const applyResult = nodeActions.applyNodeConfig(node.id, config);
                            if (applyResult.success) {
                                console.log('Node config applied successfully');
                            } else {
                                console.error('Failed to apply config:', applyResult.error);
                            }
                        } else {
                            console.error('No valid config found in paste data');
                        }
                    } else {
                        console.error('Failed to paste config:', pasteResult.error);
                    }
                    break;
                    
                case 'delete':
                    nodeActions.delete(node.id);
                    break;
            }
        } catch (error) {
            console.error('Context menu action failed:', error);
        }
    }
    
    function handleGlobalMouseMove(event) {
        // Don't interfere with canvas box selection
        if (blockNodeInteractions || $canvasState.mode === 'box-selecting') {
            return;
        }
        
        // Check if we should start dragging
        const distance = Math.sqrt(
            Math.pow(event.clientX - mouseDownPos.x, 2) + 
            Math.pow(event.clientY - mouseDownPos.y, 2)
        );
        
        if (!isDragging && distance > 5) {
            isDragging = true;
            console.log('Started dragging node:', node.id);
        }
        
        if (!isDragging) return;
        
        // Calculate new position (accounting for canvas viewport)
        const canvas = document.querySelector('.canvas-content');
        const canvasRect = canvas.getBoundingClientRect();
        const canvasTransform = getComputedStyle(canvas).transform;
        
        // Parse transform matrix to get scale
        const matrix = new DOMMatrix(canvasTransform);
        const scale = matrix.a; // scale factor
        
        // Calculate position relative to canvas
        const newX = (event.clientX - canvasRect.left - dragOffset.x) / scale;
        const newY = (event.clientY - canvasRect.top - dragOffset.y) / scale;
        
        nodeActions.move(node.id, newX, newY);
    }
    
    function handleGlobalMouseUp() {
        // Don't interfere with canvas box selection
        if (blockNodeInteractions || $canvasState.mode === 'box-selecting') {
            return;
        }
        
        isDragging = false;
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
    }
    
    // Handle content editing
    function startEditing() {
        if (node.type === 'input' || node.type === 'static') {
            isEditing = true;
            setTimeout(() => {
                if (contentElement) {
                    contentElement.focus();
                }
            }, 10);
        }
    }
    
    function stopEditing() {
        isEditing = false;
    }
    
    function handleContentChange(event) {
        nodeActions.update(node.id, { content: event.target.value });
    }
    
    function handleTitleChange(event) {
        nodeActions.update(node.id, { title: event.target.value });
    }
    
    // Handle delete key
    function handleKeyDown(event) {
        if (event.key === 'Delete' && !isEditing && $canvasState.selectedNode === node.id) {
            nodeActions.delete(node.id);
        }
    }
    
    // Auto-resize textarea
    function autoResize(element) {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    }
    
    // Connection port handlers
    function handlePortMouseDown(event, port) {
        event.stopPropagation();
        if (startConnection) {
            startConnection(node.id, port);
        }
    }
    
    function handlePortMouseUp(event, port) {
        event.stopPropagation();
        if (completeConnection && port === 'input' && isConnecting) {
            completeConnection(node.id, port);
        }
    }

    function handleNodeActivation(event) {
        if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick(event);
        }
    }

    // Update node size in store
    function updateNodeSize() {
        if (!nodeElement) return;

        const newWidth = nodeElement.offsetWidth;
        const newHeight = nodeElement.offsetHeight;

        if (newWidth > 0 && newHeight > 0 && (node.width !== newWidth || node.height !== newHeight)) {
            nodeActions.update(node.id, { width: newWidth, height: newHeight });
        }
    }

    onMount(() => {
        // Set initial size
        requestAnimationFrame(updateNodeSize);
    });

    afterUpdate(() => {
        // Update size when content changes
        requestAnimationFrame(updateNodeSize);
    });
</script>

<svelte:window on:keydown={handleKeyDown} />

<div 
    bind:this={nodeElement}
    class="node-card"
    class:selected={isSelected}
    class:dragging={isDragging}
    class:executing={isExecuting}
    class:completed={isCompleted}
    style="
        left: {node.x}px; 
        top: {node.y}px;
        background: {nodeStyle.background};
        border-color: {nodeStyle.border};
    "
    on:mousedown={handleMouseDown}
    on:click={handleClick}
    on:contextmenu={handleRightClick}
    on:keydown={handleNodeActivation}
    role="button"
    tabindex="0"
>
    <!-- Node header -->
    <div class="node-header">
        <span class="node-icon">{nodeStyle.icon}</span>
        <input 
            class="node-title"
            value={node.title}
            on:input={handleTitleChange}
            on:click|stopPropagation
        />
        
        <!-- Execution indicator -->
        {#if isExecuting}
            <div class="execution-indicator">
                <div class="spinner"></div>
            </div>
        {:else if isCompleted}
            <div class="completion-indicator">✓</div>
        {/if}
        
        <button 
            class="delete-btn"
            on:click|stopPropagation={() => nodeActions.delete(node.id)}
            title="Delete node"
        >
            ×
        </button>
    </div>
    
    <!-- Node content -->
    <div class="node-content">
        {#if node.type === 'input' || node.type === 'static'}
            {#if isEditing}
                <textarea
                    bind:this={contentElement}
                    class="content-editor"
                    value={node.content}
                    placeholder="Enter your content..."
                    on:input={handleContentChange}
                    on:blur={stopEditing}
                    on:input={(e) => autoResize(e.target)}
                    on:click|stopPropagation
                ></textarea>
            {:else}
                <div 
                    class="content-display"
                    on:dblclick|stopPropagation={startEditing}
                >
                    {node.content || 'Double-click to edit...'}
                </div>
            {/if}
        {:else if node.type === 'dynamic'}
            <div class="dynamic-content">
                {node.content || 'Click ▶️ to generate content'}
            </div>
        {/if}
    </div>
    
    <!-- Connection ports -->
    <div 
        class="connection-port input-port" 
        class:active={isConnecting}
        data-port="input" 
        title="Input"
        on:mousedown={(e) => handlePortMouseDown(e, 'input')}
        on:mouseup={(e) => handlePortMouseUp(e, 'input')}
    ></div>
    <div 
        class="connection-port output-port" 
        class:active={!isConnecting}
        data-port="output" 
        title="Output"
        on:mousedown={(e) => handlePortMouseDown(e, 'output')}
        on:mouseup={(e) => handlePortMouseUp(e, 'output')}
    ></div>
</div>


<style>
    .node-card {
        position: absolute;
        background: white;
        border-radius: 8px;
        border: 2px solid #ddd;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        cursor: url('../assets/cursor-grab.svg') 16 16, move;
        min-height: 120px;
        width: 250px;
        user-select: none;
        transition: box-shadow 0.2s ease;
    }
    
    .node-card:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }
    
    .node-card.selected {
        border-color: #2196f3 !important;
        box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.5), 0 4px 16px rgba(0, 0, 0, 0.15);
    }
    
    .node-card.dragging {
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        transform: scale(1.02);
        cursor: url('../assets/cursor-grabbing.svg') 16 16, grabbing;
    }
    
    .node-header {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        background: rgba(255, 255, 255, 0.8);
        border-radius: 6px 6px 0 0;
    }
    
    .node-icon {
        font-size: 16px;
        margin-right: 8px;
    }
    
    .node-title {
        flex: 1;
        border: none;
        background: transparent;
        font-weight: 600;
        font-size: 14px;
        outline: none;
        cursor: url('../assets/cursor-text.svg') 16 16, text;
    }
    
    .delete-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        color: #999;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
    }
    
    .delete-btn:hover {
        background: #ff4444;
        color: white;
    }
    
    .node-content {
        padding: 12px;
        min-height: 60px;
        position: relative;
    }
    
    .content-editor {
        width: 100%;
        border: none;
        background: transparent;
        resize: none;
        outline: none;
        font-family: inherit;
        font-size: 13px;
        line-height: 1.4;
        min-height: 40px;
    }
    
    .content-display {
        cursor: url('../assets/cursor-text.svg') 16 16, text;
        min-height: 40px;
        font-size: 13px;
        line-height: 1.4;
        color: #333;
        white-space: pre-wrap;
    }
    
    .content-display:empty::before {
        content: 'Double-click to edit...';
        color: #999;
        font-style: italic;
    }
    
    .dynamic-content {
        font-size: 13px;
        line-height: 1.4;
        color: #666;
        font-style: italic;
        min-height: 40px;
    }
    
    .connection-port {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #666;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
    }
    
    .input-port {
        left: -6px;
        top: 50%;
        transform: translateY(-50%);
    }
    
    .output-port {
        right: -6px;
        top: 50%;
        transform: translateY(-50%);
    }
    
    .connection-port:hover {
        background: #2196f3;
        border-color: #2196f3;
        transform: translateY(-50%) scale(1.2);
    }
    
    .connection-port.active {
        background: #4caf50;
        border-color: #4caf50;
        box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
    }
    
    /* Execution state styles */
    .node-card.executing {
        border-color: #ff9800 !important;
        box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.15);
        animation: pulse-executing 2s ease-in-out infinite;
    }
    
    .node-card.completed {
        border-color: #4caf50 !important;
        box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.3), 0 4px 16px rgba(0, 0, 0, 0.15);
    }
    
    @keyframes pulse-executing {
        0%, 100% {
            box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.15);
        }
        50% {
            box-shadow: 0 0 0 6px rgba(255, 152, 0, 0.2), 0 6px 20px rgba(255, 152, 0, 0.1);
        }
    }
    
    .execution-indicator {
        display: flex;
        align-items: center;
        margin-right: 8px;
    }
    
    .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #ff9800;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .completion-indicator {
        color: #4caf50;
        font-weight: bold;
        font-size: 16px;
        margin-right: 8px;
    }
</style>