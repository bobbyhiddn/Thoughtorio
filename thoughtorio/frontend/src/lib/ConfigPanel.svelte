<script>
    import { canvasState } from '../stores/canvas.js';
    import { nodeActions, nodeDataStore } from '../stores/nodes.js';
    import { workflowContainers } from '../stores/workflows.js';
    import { copyText } from './clipboard.js';
    
    export let visible = false;
    
    let selectedEntity = null;
    let entityType = null;
    let yamlConfig = '';
    
    // React to canvas selection changes
    $: {
        if ($canvasState.selectedNode) {
            selectedEntity = $canvasState.selectedNode;
            entityType = 'node';
            updateConfig();
        } else if ($canvasState.selectedConnection) {
            selectedEntity = $canvasState.selectedConnection;
            entityType = 'connection';
            updateConfig();
        } else {
            selectedEntity = null;
            entityType = null;
            yamlConfig = '';
        }
    }
    
    // Update when node data changes
    $: if (selectedEntity && entityType === 'node' && $nodeDataStore) {
        updateConfig();
    }
    
    function updateConfig() {
        if (!selectedEntity) {
            yamlConfig = '';
            return;
        }
        
        try {
            if (entityType === 'node') {
                const nodeData = $nodeDataStore.get(selectedEntity);
                if (nodeData) {
                    yamlConfig = nodeData.toCleanYAML();
                } else {
                    yamlConfig = 'No YAML data found for this node';
                }
            } else if (entityType === 'connection') {
                // For connections, show connection details
                const connection = $canvasState.connections?.find(c => c.id === selectedEntity);
                if (connection) {
                    yamlConfig = `# Connection Configuration
id: ${connection.id}
from: ${connection.fromId}
to: ${connection.toId}
from_port: ${connection.fromPort}
to_port: ${connection.toPort}
created: ${new Date(connection.created).toISOString()}`;
                } else {
                    yamlConfig = 'Connection not found';
                }
            }
        } catch (error) {
            yamlConfig = `Error loading configuration: ${error.message}`;
        }
    }
    
    function handleClose() {
        visible = false;
    }
    
    async function handleCopyConfig() {
        if (yamlConfig) {
            const result = await copyText(yamlConfig);
            if (result.success) {
                console.log('Config copied to clipboard');
            } else {
                console.error('Failed to copy config:', result.error);
            }
        }
    }
    
    function getEntityTitle() {
        if (!selectedEntity) return 'No Selection';
        
        if (entityType === 'node') {
            const node = $canvasState.selectedNode;
            return `Node: ${node || selectedEntity}`;
        } else if (entityType === 'connection') {
            return `Connection: ${selectedEntity.substring(0, 8)}...`;
        }
        
        return 'Unknown Entity';
    }
</script>

<div class="config-panel" class:visible>
    <div class="panel-header">
        <h3>Configuration</h3>
        <button class="close-button" on:click={handleClose}>×</button>
    </div>
    
    <div class="panel-content">
        {#if selectedEntity}
            <div class="entity-info">
                <h4>{getEntityTitle()}</h4>
                <div class="config-actions">
                    <button class="copy-button" on:click={handleCopyConfig}>
                        📋 Copy Config
                    </button>
                </div>
            </div>
            
            <div class="config-display">
                <pre class="yaml-content">{yamlConfig}</pre>
            </div>
        {:else}
            <div class="no-selection">
                <p>Select a node or connection to view its configuration</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .config-panel {
        position: fixed;
        top: 0;
        right: -400px;
        width: 400px;
        height: 100vh;
        background: #ffffff;
        border-left: 1px solid #e0e0e0;
        box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        transition: right 0.3s ease;
        display: flex;
        flex-direction: column;
    }
    
    .config-panel.visible {
        right: 0;
    }
    
    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e0e0e0;
        background: #f8f9fa;
    }
    
    .panel-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #333;
    }
    
    .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s ease;
    }
    
    .close-button:hover {
        background: rgba(0, 0, 0, 0.1);
    }
    
    .panel-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    
    .entity-info {
        padding: 16px 20px;
        border-bottom: 1px solid #e0e0e0;
        background: #fafafa;
    }
    
    .entity-info h4 {
        margin: 0 0 12px 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
    }
    
    .config-actions {
        display: flex;
        gap: 8px;
    }
    
    .copy-button {
        background: #2196f3;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }
    
    .copy-button:hover {
        background: #1976d2;
    }
    
    .config-display {
        flex: 1;
        overflow: auto;
        padding: 0;
    }
    
    .yaml-content {
        margin: 0;
        padding: 20px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 12px;
        line-height: 1.4;
        color: #333;
        background: #ffffff;
        white-space: pre-wrap;
        word-wrap: break-word;
        border: none;
        outline: none;
    }
    
    .no-selection {
        padding: 40px 20px;
        text-align: center;
        color: #666;
    }
    
    .no-selection p {
        margin: 0;
        font-size: 14px;
    }
</style>