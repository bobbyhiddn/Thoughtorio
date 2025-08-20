<script>
    import { onMount, afterUpdate } from 'svelte';
    import { canvasState } from '../stores/canvas.js';
    import { nodeActions } from '../stores/nodes.js';
    
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
        if (startConnection && port === 'output') {
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
    style="
        left: {node.x}px; 
        top: {node.y}px;
        background: {nodeStyle.background};
        border-color: {nodeStyle.border};
    "
    on:mousedown={handleMouseDown}
    on:click={handleClick}
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
        cursor: move;
        min-height: 120px;
        max-width: 600px;
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
        cursor: text;
    }
    
    .delete-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
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
        cursor: text;
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
        cursor: crosshair;
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
</style>