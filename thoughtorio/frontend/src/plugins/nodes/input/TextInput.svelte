<script>
    export let nodeData;
    export let isSelected = false;
    export let isConnecting = false;
    export let onUpdate = () => {};
    export let onDelete = () => {};

    // Reactive state
    $: config = nodeData.config || {};
    
    let textareaElement;
    let isEditing = false;
    let editingTitle = false;

    // Handle content changes
    function handleContentChange(event) {
        nodeData.content = event.target.value;
        nodeData.modified = new Date().toISOString();
        onUpdate(nodeData);
    }

    // Handle title changes
    function handleTitleChange(event) {
        nodeData.title = event.target.value;
        nodeData.modified = new Date().toISOString();
        onUpdate(nodeData);
    }

    // Handle title editing
    function startTitleEdit() {
        editingTitle = true;
    }

    function finishTitleEdit() {
        editingTitle = false;
    }

    // Handle envelope style changes
    function handleEnvelopeStyleChange(event) {
        nodeData.config.envelopeStyle = event.target.value;
        nodeData.modified = new Date().toISOString();
        onUpdate(nodeData);
    }

    // Handle wrapper template changes
    function handleWrapperTemplateChange(event) {
        nodeData.config.wrapperTemplate = event.target.value;
        nodeData.modified = new Date().toISOString();
        onUpdate(nodeData);
    }

    // Auto-resize textarea
    function autoResize(element) {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    }

    // Focus textarea when clicking the node
    function handleNodeClick() {
        if (textareaElement && !isConnecting) {
            textareaElement.focus();
            isEditing = true;
        }
    }

    // Handle blur
    function handleBlur() {
        isEditing = false;
    }

    // Format input count for display
    function formatInputCount() {
        const inputCount = nodeData.inputs?.length || 0;
        return inputCount === 0 ? 'No inputs' : `${inputCount} input${inputCount > 1 ? 's' : ''}`;
    }
</script>

<div 
    class="text-input-node"
    class:selected={isSelected}
    class:editing={isEditing}
    class:has-inputs={nodeData.inputs && nodeData.inputs.length > 0}
    class:has-error={nodeData.processingError}
    on:click={handleNodeClick}
    on:keydown
>
    <!-- Node Header -->
    <div class="node-header">
        {#if editingTitle}
            <input
                type="text"
                class="title-input"
                bind:value={nodeData.title}
                on:blur={finishTitleEdit}
                on:keydown={(e) => e.key === 'Enter' && finishTitleEdit()}
                on:input={handleTitleChange}
                autofocus
            />
        {:else}
            <h3 class="node-title" on:dblclick={startTitleEdit}>
                {nodeData.title}
            </h3>
        {/if}
        
        <div class="node-actions">
            <button 
                class="delete-btn" 
                on:click|stopPropagation={onDelete}
                title="Delete node"
            >×</button>
        </div>
    </div>

    <!-- Input Status -->
    {#if nodeData.inputs && nodeData.inputs.length > 0}
        <div class="input-status">
            <span class="input-count">{formatInputCount()}</span>
            {#if config.envelopeStyle && config.envelopeStyle !== 'none'}
                <span class="envelope-indicator">🔗 {config.envelopeStyle}</span>
            {/if}
        </div>
    {/if}

    <!-- Main Content Area -->
    <div class="content-area">
        <textarea
            bind:this={textareaElement}
            class="content-textarea"
            placeholder="Enter your text here..."
            bind:value={nodeData.content}
            on:input={handleContentChange}
            on:blur={handleBlur}
            on:focus={() => isEditing = true}
            on:input={(e) => autoResize(e.target)}
        ></textarea>
    </div>

    <!-- Configuration Panel (shown when selected) -->
    {#if isSelected}
        <div class="config-panel">
            <div class="config-section">
                <label class="config-label">
                    Envelope Style:
                    <select 
                        class="config-select" 
                        bind:value={config.envelopeStyle}
                        on:change={handleEnvelopeStyleChange}
                    >
                        <option value="none">None</option>
                        <option value="prompt_wrapper">Prompt Wrapper</option>
                        <option value="context_wrapper">Context Wrapper</option>
                        <option value="custom">Custom</option>
                    </select>
                </label>
            </div>

            {#if config.envelopeStyle && config.envelopeStyle !== 'none'}
                <div class="config-section">
                    <label class="config-label">
                        Wrapper Template:
                        <textarea
                            class="config-textarea"
                            placeholder="Template with {inputs} and {content} placeholders"
                            bind:value={config.wrapperTemplate}
                            on:input={handleWrapperTemplateChange}
                            rows="2"
                        ></textarea>
                    </label>
                </div>
            {/if}
        </div>
    {/if}

    <!-- Processing Error Display -->
    {#if nodeData.processingError}
        <div class="error-display">
            <span class="error-icon">⚠️</span>
            <span class="error-message">{nodeData.processingError}</span>
        </div>
    {/if}

    <!-- Connection Ports -->
    <div class="connection-ports">
        <!-- Input Port -->
        <div class="input-port" title="Input connections">
            <div class="port-dot"></div>
        </div>
        
        <!-- Output Port -->
        <div class="output-port" title="Output connections">
            <div class="port-dot"></div>
        </div>
    </div>
</div>

<style>
    .text-input-node {
        position: relative;
        background: white;
        border: 2px solid #3b82f6;
        border-radius: 8px;
        padding: 12px;
        min-width: 200px;
        min-height: 120px;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
        transition: all 0.2s ease;
    }

    .text-input-node:hover {
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        transform: translateY(-1px);
    }

    .text-input-node.selected {
        border-color: #1d4ed8;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    }

    .text-input-node.editing {
        border-color: #10b981;
    }

    .text-input-node.has-error {
        border-color: #ef4444;
    }

    /* Node Header */
    .node-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .node-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #1e3a8a;
        cursor: pointer;
        flex: 1;
        min-height: 20px;
    }

    .title-input {
        background: none;
        border: 1px solid #3b82f6;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 14px;
        font-weight: 600;
        color: #1e3a8a;
        width: 100%;
    }

    .node-actions {
        display: flex;
        gap: 4px;
    }

    .delete-btn {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 4px;
        width: 20px;
        height: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1;
    }

    .delete-btn:hover {
        background: #dc2626;
    }

    /* Input Status */
    .input-status {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 11px;
        color: #6b7280;
    }

    .input-count {
        background: #dbeafe;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .envelope-indicator {
        background: #ecfdf5;
        color: #059669;
        padding: 2px 6px;
        border-radius: 4px;
    }

    /* Content Area */
    .content-area {
        margin-bottom: 8px;
    }

    .content-textarea {
        width: 100%;
        min-height: 60px;
        padding: 8px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 13px;
        line-height: 1.4;
        resize: none;
        background: #fafafa;
        transition: all 0.2s ease;
    }

    .content-textarea:focus {
        outline: none;
        border-color: #3b82f6;
        background: white;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
    }

    /* Configuration Panel */
    .config-panel {
        border-top: 1px solid #e5e7eb;
        padding-top: 8px;
        margin-top: 8px;
    }

    .config-section {
        margin-bottom: 8px;
    }

    .config-label {
        display: block;
        font-size: 11px;
        font-weight: 500;
        color: #374151;
        margin-bottom: 4px;
    }

    .config-select {
        width: 100%;
        padding: 4px 6px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 11px;
        background: white;
    }

    .config-textarea {
        width: 100%;
        padding: 4px 6px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 11px;
        font-family: monospace;
        resize: vertical;
    }

    /* Error Display */
    .error-display {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 4px;
        margin-top: 8px;
    }

    .error-icon {
        font-size: 14px;
    }

    .error-message {
        font-size: 11px;
        color: #dc2626;
        flex: 1;
    }

    /* Connection Ports */
    .connection-ports {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        pointer-events: none;
    }

    .input-port {
        position: absolute;
        left: -8px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: all;
    }

    .output-port {
        position: absolute;
        right: -8px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: all;
    }

    .port-dot {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #3b82f6;
        border: 2px solid white;
        cursor: crosshair;
        transition: all 0.2s ease;
    }

    .port-dot:hover {
        background: #1d4ed8;
        transform: scale(1.2);
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
    }

    .text-input-node.has-inputs .input-port .port-dot {
        background: #10b981;
    }

    .text-input-node.has-inputs .input-port .port-dot:hover {
        background: #059669;
    }
</style>