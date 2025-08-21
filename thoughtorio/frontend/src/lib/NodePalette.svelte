<script>
    const nodeTypes = [
        {
            type: 'input',
            title: 'Input Node',
            description: 'User-editable content',
            icon: '✏️',
            color: '#2196f3'
        },
        {
            type: 'dynamic',
            title: 'AI Node',
            description: 'AI-generated content',
            icon: '🤖',
            color: '#9c27b0'
        },
        {
            type: 'static',
            title: 'Static Node',
            description: 'Fixed reference content',
            icon: '📄',
            color: '#4caf50'
        }
    ];
    
    function handleDragStart(event, nodeType) {
        event.dataTransfer.setData('text/plain', nodeType);
        event.dataTransfer.effectAllowed = 'copy';
    }
</script>

<div class="node-palette">
    <div class="palette-header">
        <h3>Node Palette</h3>
        <p class="palette-hint">Drag to canvas or double-click canvas for text node</p>
    </div>
    
    <div class="palette-nodes">
        {#each nodeTypes as nodeType}
            <div 
                class="palette-node"
                draggable="true"
                on:dragstart={(e) => handleDragStart(e, nodeType.type)}
                style="border-color: {nodeType.color}"
            >
                <div class="palette-node-icon">{nodeType.icon}</div>
                <div class="palette-node-info">
                    <div class="palette-node-title">{nodeType.title}</div>
                    <div class="palette-node-description">{nodeType.description}</div>
                </div>
            </div>
        {/each}
    </div>
    
    <div class="palette-controls">
        <div class="control-section">
            <h4>Canvas Controls</h4>
            <div class="control-hint">
                <strong>Pan:</strong> Shift + Drag or Middle Mouse<br>
                <strong>Zoom:</strong> Mouse Wheel<br>
                <strong>Select:</strong> Click node<br>
                <strong>Delete:</strong> Select node + Delete key<br>
                <strong>New Text:</strong> Double-click canvas
            </div>
        </div>
    </div>
</div>

<style>
    .node-palette {
        width: 250px;
        background: white;
        border-right: 1px solid #ddd;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }
    
    .palette-header {
        padding: 16px;
        border-bottom: 1px solid #eee;
    }
    
    .palette-header h3 {
        margin: 0 0 8px 0;
        font-size: 16px;
        color: #333;
    }
    
    .palette-hint {
        font-size: 12px;
        color: #666;
        margin: 0;
        line-height: 1.3;
    }
    
    .palette-nodes {
        padding: 16px;
        flex: 1;
    }
    
    .palette-node {
        display: flex;
        align-items: center;
        padding: 12px;
        margin-bottom: 8px;
        border: 2px solid #ddd;
        border-radius: 6px;
        cursor: url('../assets/cursor-grab.svg') 16 16, grab;
        background: white;
        transition: all 0.2s ease;
    }
    
    .palette-node:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
    }
    
    .palette-node:active {
        cursor: url('../assets/cursor-grabbing.svg') 16 16, grabbing;
        transform: scale(0.98);
    }
    
    .palette-node-icon {
        font-size: 20px;
        margin-right: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
    }
    
    .palette-node-info {
        flex: 1;
    }
    
    .palette-node-title {
        font-weight: 600;
        font-size: 14px;
        color: #333;
        margin-bottom: 2px;
    }
    
    .palette-node-description {
        font-size: 12px;
        color: #666;
        line-height: 1.2;
    }
    
    .palette-controls {
        padding: 16px;
        border-top: 1px solid #eee;
        background: #f9f9f9;
    }
    
    .control-section h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
        color: #333;
    }
    
    .control-hint {
        font-size: 11px;
        color: #666;
        line-height: 1.4;
    }
    
    .control-hint strong {
        color: #333;
    }
</style>