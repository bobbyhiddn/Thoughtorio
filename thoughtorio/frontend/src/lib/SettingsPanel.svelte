<script>
    import { onMount } from 'svelte';
    import { 
        settings, 
        settingsActions, 
        availableProviders,
        modelList,
        isModelListLoading,
        modelListError,
        embeddingModelList,
        isEmbeddingModelListLoading,
        embeddingModelListError,
        providerModels
    } from '../stores/settings.js';
    
    export let isOpen = false;
    
    let selectedTab = 'providers';
    let testingConnection = false;
    let testResult = null;
    let saveMessage = '';
    let errorMessage = '';
    let isLoading = false;
    
    // Show/hide API keys
    let showOpenRouterKey = false;
    let showOpenAIKey = false;
    let showOpenAIEmbeddingKey = false;
    let showGeminiKey = false;
    let showGeminiEmbeddingKey = false;
    
    // Track user changes to avoid overwriting
    let userChangedChatModel = false;
    let userChangedStoryModel = false;
    
    $: currentProvider = availableProviders.find(p => p.id === $settings.activeMode);
    
    // Handle settings updates
    function updateSetting(key, value) {
        settingsActions.update(key, value);
    }
    
    // Handle mode change
    async function onActiveModeChange() {
        // Save current model selections for the previous mode
        if ($settings.chat_model_id || $settings.story_processing_model_id) {
            providerModels.update(prev => ({
                ...prev,
                [$settings.activeMode]: {
                    chat: $settings.chat_model_id,
                    story: $settings.story_processing_model_id
                }
            }));
        }
        
        // Clear errors and models
        clearErrors();
        settingsActions.clearModels();
        
        // Reset model selections
        updateSetting('chat_model_id', '');
        updateSetting('story_processing_model_id', '');
        userChangedChatModel = false;
        userChangedStoryModel = false;
        
        // Load models for new mode
        await handleModeSpecificModelLoad();
        
        // Restore saved selections if they exist
        const savedModels = $providerModels[$settings.activeMode];
        if (savedModels && $modelList.length > 0) {
            if (savedModels.chat && $modelList.some(m => m.id === savedModels.chat)) {
                updateSetting('chat_model_id', savedModels.chat);
            }
            if (savedModels.story && $modelList.some(m => m.id === savedModels.story)) {
                updateSetting('story_processing_model_id', savedModels.story);
            }
        }
    }
    
    // Handle model selection changes
    function handleChatModelChange(event) {
        const newValue = event.target.value;
        if (newValue === '') return;
        
        userChangedChatModel = true;
        updateSetting('chat_model_id', newValue);
        
        providerModels.update(prev => ({
            ...prev,
            [$settings.activeMode]: {
                ...prev[$settings.activeMode],
                chat: newValue
            }
        }));
    }
    
    function handleStoryModelChange(event) {
        const newValue = event.target.value;
        if (newValue === '') return;
        
        userChangedStoryModel = true;
        updateSetting('story_processing_model_id', newValue);
        
        providerModels.update(prev => ({
            ...prev,
            [$settings.activeMode]: {
                ...prev[$settings.activeMode],
                story: newValue
            }
        }));
    }
    
    // Handle API key changes and trigger model loading
    function handleOpenRouterApiKeyChange() {
        clearErrors();
        if ($settings.activeMode === 'openrouter' || $settings.activeMode === 'local') {
            if ($settings.openrouter_api_key) {
                settingsActions.fetchModels($settings.activeMode, $settings.openrouter_api_key);
            } else {
                settingsActions.clearModels();
            }
        }
    }
    
    function handleOpenAIApiKeyChange() {
        clearErrors();
        if ($settings.activeMode === 'openai') {
            if ($settings.openai_api_key) {
                settingsActions.fetchModels($settings.activeMode, $settings.openai_api_key);
            } else {
                settingsActions.clearModels();
            }
        }
    }
    
    function handleGeminiApiKeyChange() {
        clearErrors();
        if ($settings.activeMode === 'gemini') {
            if ($settings.gemini_api_key) {
                settingsActions.fetchModels($settings.activeMode, $settings.gemini_api_key);
            } else {
                settingsActions.clearModels();
            }
        }
    }
    
    // Load models based on current mode
    async function handleModeSpecificModelLoad() {
        settingsActions.clearModels();
        
        if ($settings.activeMode === 'openrouter' || $settings.activeMode === 'local') {
            if ($settings.openrouter_api_key && !$isModelListLoading) {
                await settingsActions.fetchModels($settings.activeMode, $settings.openrouter_api_key);
            }
        } else if ($settings.activeMode === 'openai') {
            if ($settings.openai_api_key && !$isModelListLoading) {
                await settingsActions.fetchModels($settings.activeMode, $settings.openai_api_key);
            }
        } else if ($settings.activeMode === 'gemini') {
            if ($settings.gemini_api_key && !$isModelListLoading) {
                await settingsActions.fetchModels($settings.activeMode, $settings.gemini_api_key);
            }
        }
        
        // Load embedding models for local mode
        if ($settings.activeMode === 'local') {
            await settingsActions.fetchEmbeddingModels();
        }
    }
    
    // Save settings with validation
    async function saveSettings() {
        clearErrors();
        isLoading = true;
        
        let errors = [];
        
        // Validate based on active mode
        if ($settings.activeMode === 'openai' && !$settings.openai_api_key) {
            errors.push('OpenAI API Key is required for OpenAI mode.');
        }
        if ($settings.activeMode === 'gemini' && !$settings.gemini_api_key) {
            errors.push('Gemini API Key is required for Gemini mode.');
        }
        if (($settings.activeMode === 'openrouter' || $settings.activeMode === 'local') && !$settings.openrouter_api_key) {
            errors.push('OpenRouter API Key is required for OpenRouter/Local mode.');
        }
        if ($settings.activeMode === 'local' && !$settings.local_embedding_model_name) {
            errors.push('Ollama Embedding Model is required for Local mode.');
        }
        
        // Validate model selections for modes that require them
        if (($settings.activeMode === 'openrouter' || $settings.activeMode === 'local' || $settings.activeMode === 'openai' || $settings.activeMode === 'gemini') && $modelList.length > 0) {
            if (!$settings.chat_model_id || !$settings.story_processing_model_id) {
                errors.push('Please select both a Chat Model and a Story Processing Model.');
            }
        }
        
        if (errors.length > 0) {
            errorMessage = errors.join(' ');
            isLoading = false;
            return;
        }
        
        try {
            await settingsActions.save($settings);
            saveMessage = 'Settings saved successfully!';
            setTimeout(() => saveMessage = '', 3000);
            
            // Refresh model list
            await handleModeSpecificModelLoad();
        } catch (error) {
            errorMessage = `Failed to save settings: ${error.message}`;
        } finally {
            isLoading = false;
        }
    }
    
    function clearErrors() {
        errorMessage = '';
        saveMessage = '';
    }
    
    // Test connection with current provider
    async function testConnection() {
        testingConnection = true;
        testResult = null;
        
        try {
            const result = await settingsActions.testConnection();
            testResult = result;
        } catch (error) {
            testResult = { success: false, message: error.message };
        } finally {
            testingConnection = false;
        }
    }
    
    // Reset settings to defaults
    function resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            settingsActions.reset();
        }
    }
    
    // Close panel when clicking outside
    function handleBackdropClick(event) {
        if (event.target === event.currentTarget) {
            isOpen = false;
        }
    }
    
    // Handle keyboard shortcuts
    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            isOpen = false;
        }
    }
    
    // Initialize on mount
    onMount(async () => {
        // Wait for Wails runtime to be available
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        while ((!window.go || !window.go.main || !window.go.main.App) && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.go && window.go.app && window.go.app.App) {
            handleModeSpecificModelLoad();
        } else {
            console.warn('Wails runtime not available after waiting');
        }
    });
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if isOpen}
    <div class="settings-backdrop" on:click={handleBackdropClick}>
        <div class="settings-panel">
            <header class="settings-header">
                <h2>Thoughtorio Settings</h2>
                <button class="close-button" on:click={() => isOpen = false}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </header>
            
            <div class="settings-content">
                <form on:submit|preventDefault={saveSettings}>
                    <!-- Active Processing Mode Selector -->
                    <div class="form-group">
                        <label for="activeModeSelect">Active Processing Mode:</label>
                        <select 
                            id="activeModeSelect" 
                            bind:value={$settings.activeMode} 
                            on:change={onActiveModeChange}
                        >
                            <option value="openrouter">OpenRouter (LLM + Auto Embeddings)</option>
                            <option value="openai">OpenAI (LLM & Embeddings)</option>
                            <option value="gemini">Gemini (LLM & Embeddings)</option>
                            <option value="local">Local Ollama (LLM & Embeddings)</option>
                        </select>
                        <p class="help-text">Determines AI services for language models and embeddings.</p>
                    </div>
                    
                    <!-- OpenRouter API Key -->
                    {#if $settings.activeMode === 'openrouter' || $settings.activeMode === 'local'}
                        <div class="form-group">
                            <label for="openrouterApiKey">OpenRouter API Key:</label>
                            <div class="api-key-input">
                                {#if showOpenRouterKey}
                                    <input
                                        type="text"
                                        id="openrouterApiKey"
                                        bind:value={$settings.openrouter_api_key}
                                        on:input={handleOpenRouterApiKeyChange}
                                        placeholder="Enter your OpenRouter API key"
                                    />
                                {:else}
                                    <input
                                        type="password"
                                        id="openrouterApiKey"
                                        bind:value={$settings.openrouter_api_key}
                                        on:input={handleOpenRouterApiKeyChange}
                                        placeholder="Enter your OpenRouter API key"
                                    />
                                {/if}
                                <button
                                    type="button"
                                    class="toggle-visibility"
                                    on:click={() => (showOpenRouterKey = !showOpenRouterKey)}
                                    title={showOpenRouterKey ? "Hide API Key" : "Show API Key"}
                                >
                                    {showOpenRouterKey ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                            <p class="help-text">
                                Used for LLM features. Get from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter.ai</a>.
                            </p>
                        </div>
                    {/if}
                    
                    <!-- OpenAI API Key -->
                    {#if $settings.activeMode === 'openai'}
                        <div class="form-group">
                            <label for="openaiApiKey">OpenAI API Key:</label>
                            <div class="api-key-input">
                                {#if showOpenAIKey}
                                    <input
                                        type="text"
                                        id="openaiApiKey"
                                        bind:value={$settings.openai_api_key}
                                        on:input={handleOpenAIApiKeyChange}
                                        placeholder="Enter your OpenAI API key"
                                    />
                                {:else}
                                    <input
                                        type="password"
                                        id="openaiApiKey"
                                        bind:value={$settings.openai_api_key}
                                        on:input={handleOpenAIApiKeyChange}
                                        placeholder="Enter your OpenAI API key"
                                    />
                                {/if}
                                <button
                                    type="button"
                                    class="toggle-visibility"
                                    on:click={() => (showOpenAIKey = !showOpenAIKey)}
                                    title={showOpenAIKey ? "Hide API Key" : "Show API Key"}
                                >
                                    {showOpenAIKey ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                            <p class="help-text">
                                Required for OpenAI LLM and Embeddings. Get from
                                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI API Keys</a>.
                            </p>
                        </div>
                        
                        <!-- Separate OpenAI Embedding Key -->
                        <div class="form-group">
                            <label for="openaiEmbeddingApiKey">OpenAI Embedding API Key (Optional):</label>
                            <div class="api-key-input">
                                {#if showOpenAIEmbeddingKey}
                                    <input
                                        type="text"
                                        id="openaiEmbeddingApiKey"
                                        bind:value={$settings.openai_embedding_api_key}
                                        placeholder="Leave blank to use main OpenAI key"
                                    />
                                {:else}
                                    <input
                                        type="password"
                                        id="openaiEmbeddingApiKey"
                                        bind:value={$settings.openai_embedding_api_key}
                                        placeholder="Leave blank to use main OpenAI key"
                                    />
                                {/if}
                                <button
                                    type="button"
                                    class="toggle-visibility"
                                    on:click={() => (showOpenAIEmbeddingKey = !showOpenAIEmbeddingKey)}
                                    title={showOpenAIEmbeddingKey ? "Hide API Key" : "Show API Key"}
                                >
                                    {showOpenAIEmbeddingKey ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                            <p class="help-text">
                                Optional separate key for embeddings. If blank, will use the main OpenAI API key.
                            </p>
                        </div>
                    {/if}
                    
                    <!-- Gemini API Key -->
                    {#if $settings.activeMode === 'gemini'}
                        <div class="form-group">
                            <label for="geminiApiKey">Gemini API Key:</label>
                            <div class="api-key-input">
                                {#if showGeminiKey}
                                    <input
                                        type="text"
                                        id="geminiApiKey"
                                        bind:value={$settings.gemini_api_key}
                                        on:input={handleGeminiApiKeyChange}
                                        placeholder="Enter your Gemini API key"
                                    />
                                {:else}
                                    <input
                                        type="password"
                                        id="geminiApiKey"
                                        bind:value={$settings.gemini_api_key}
                                        on:input={handleGeminiApiKeyChange}
                                        placeholder="Enter your Gemini API key"
                                    />
                                {/if}
                                <button
                                    type="button"
                                    class="toggle-visibility"
                                    on:click={() => (showGeminiKey = !showGeminiKey)}
                                    title={showGeminiKey ? "Hide Gemini Key" : "Show Gemini Key"}
                                >
                                    {showGeminiKey ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                            <p class="help-text">
                                Required for Gemini LLM and Embeddings.
                                Get from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
                            </p>
                        </div>
                        
                        <!-- Separate Gemini Embedding Key -->
                        <div class="form-group">
                            <label for="geminiEmbeddingApiKey">Gemini Embedding API Key (Optional):</label>
                            <div class="api-key-input">
                                {#if showGeminiEmbeddingKey}
                                    <input
                                        type="text"
                                        id="geminiEmbeddingApiKey"
                                        bind:value={$settings.gemini_embedding_api_key}
                                        placeholder="Leave blank to use main Gemini key"
                                    />
                                {:else}
                                    <input
                                        type="password"
                                        id="geminiEmbeddingApiKey"
                                        bind:value={$settings.gemini_embedding_api_key}
                                        placeholder="Leave blank to use main Gemini key"
                                    />
                                {/if}
                                <button
                                    type="button"
                                    class="toggle-visibility"
                                    on:click={() => (showGeminiEmbeddingKey = !showGeminiEmbeddingKey)}
                                    title={showGeminiEmbeddingKey ? "Hide API Key" : "Show API Key"}
                                >
                                    {showGeminiEmbeddingKey ? "👁️" : "👁️‍🗨️"}
                                </button>
                            </div>
                            <p class="help-text">
                                Optional separate key for embeddings. If blank, will use the main Gemini API key.
                            </p>
                        </div>
                    {/if}
                    
                    <!-- Local Embedding Model -->
                    {#if $settings.activeMode === 'local'}
                        <div class="form-group">
                            <label for="local-embedding-model-name">Ollama Embedding Model:</label>
                            {#if $isEmbeddingModelListLoading}
                                <div class="loading-text">Loading embedding models...</div>
                            {:else if $embeddingModelListError}
                                <div class="error-text">{$embeddingModelListError}</div>
                                <input
                                    type="text"
                                    id="local-embedding-model-name"
                                    bind:value={$settings.local_embedding_model_name}
                                    placeholder="e.g. nomic-embed-text"
                                />
                            {:else}
                                <select
                                    id="local-embedding-model-name"
                                    bind:value={$settings.local_embedding_model_name}
                                    disabled={$isEmbeddingModelListLoading}
                                >
                                    <option value="">Select an embedding model</option>
                                    {#each $embeddingModelList as model}
                                        <option value={model.id}>{model.name || model.id}</option>
                                    {/each}
                                </select>
                            {/if}
                        </div>
                    {/if}
                    
                    <!-- Chat Model Selection -->
                    {#if $settings.activeMode === 'openrouter' || $settings.activeMode === 'local' || $settings.activeMode === 'openai' || $settings.activeMode === 'gemini'}
                        <div class="form-group">
                            <label for="chat-model-select">
                                Chat Model ({$settings.activeMode === 'openrouter' ? 'OpenRouter' : $settings.activeMode === 'local' ? 'Ollama' : $settings.activeMode.toUpperCase()}):
                            </label>
                            {#if !$settings[`${$settings.activeMode === 'local' ? 'openrouter' : $settings.activeMode}_api_key`]}
                                <p class="info-text">Set {$settings.activeMode === 'local' ? 'OpenRouter' : $settings.activeMode.toUpperCase()} API Key to load models.</p>
                            {:else if $isModelListLoading}
                                <span>Loading models...</span>
                            {:else if $modelListError}
                                <span class="error-inline">{$modelListError}</span>
                            {:else if $modelList.length === 0}
                                <span class="info-text">No models found. Check API key or try refreshing.</span>
                            {:else}
                                <select
                                    id="chat-model-select"
                                    value={$settings.chat_model_id}
                                    on:change={handleChatModelChange}
                                    disabled={$isModelListLoading}
                                >
                                    <option value="">Select a model</option>
                                    {#each $modelList as model (model.id)}
                                        <option value={model.id}>{model.name || model.id}</option>
                                    {/each}
                                </select>
                            {/if}
                            <p class="help-text">Model used for chat and interactive features.</p>
                        </div>
                        
                        <div class="form-group">
                            <label for="story-processing-model-select">
                                Processing Model ({$settings.activeMode === 'openrouter' ? 'OpenRouter' : $settings.activeMode === 'local' ? 'Ollama' : $settings.activeMode.toUpperCase()}):
                            </label>
                            {#if !$settings[`${$settings.activeMode === 'local' ? 'openrouter' : $settings.activeMode}_api_key`]}
                                <p class="info-text">Set {$settings.activeMode === 'local' ? 'OpenRouter' : $settings.activeMode.toUpperCase()} API Key to load models.</p>
                            {:else if $isModelListLoading}
                                <span>Loading models...</span>
                            {:else if $modelListError}
                                <span class="error-inline">{$modelListError}</span>
                            {:else if $modelList.length === 0}
                                <span class="info-text">No models found. Check API key or try refreshing.</span>
                            {:else}
                                <select
                                    id="story-processing-model-select"
                                    value={$settings.story_processing_model_id}
                                    on:change={handleStoryModelChange}
                                    disabled={$isModelListLoading}
                                >
                                    <option value="">Select a model</option>
                                    {#each $modelList as model (model.id)}
                                        <option value={model.id}>{model.name || model.id}</option>
                                    {/each}
                                </select>
                            {/if}
                            <p class="help-text">Model used for workflow processing and analysis.</p>
                        </div>
                    {/if}
                    
                    <!-- Canvas Settings -->
                    <div class="settings-section">
                        <h3>Canvas Settings</h3>
                        <div class="setting-group">
                            <label for="node-width">Default Node Width</label>
                            <input 
                                id="node-width"
                                type="number" 
                                min="100" 
                                max="500"
                                bind:value={$settings.defaultNodeWidth}
                            />
                        </div>
                        
                        <div class="setting-group">
                            <label for="node-height">Default Node Height</label>
                            <input 
                                id="node-height"
                                type="number" 
                                min="80" 
                                max="400"
                                bind:value={$settings.defaultNodeHeight}
                            />
                        </div>
                        
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input 
                                    type="checkbox" 
                                    bind:checked={$settings.showContainerLabels}
                                />
                                Show workflow container labels
                            </label>
                        </div>
                        
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input 
                                    type="checkbox" 
                                    bind:checked={$settings.autoExecuteWorkflows}
                                />
                                Auto-execute workflows on connection
                            </label>
                        </div>
                        
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input 
                                    type="checkbox" 
                                    bind:checked={$settings.debugMode}
                                />
                                Enable debug mode
                            </label>
                        </div>
                    </div>
                    
                    <!-- Save Button -->
                    <button type="submit" class="save-button" disabled={isLoading}>
                        {#if isLoading}Saving...{:else}Save Settings{/if}
                    </button>
                    
                    <!-- Messages -->
                    {#if saveMessage}
                        <p class="success-message">{saveMessage}</p>
                    {/if}
                    {#if errorMessage}
                        <p class="error-message">{errorMessage}</p>
                    {/if}
                </form>
            </div>
        </div>
    </div>
{/if}

<style>
    .settings-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
    }
    
    .settings-panel {
        background: #1e1e1e;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        width: 90%;
        max-width: 700px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.02);
    }
    
    .settings-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #f9fafb;
    }
    
    .close-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #9ca3af;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        transition: all 0.2s ease;
    }
    
    .close-button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #f9fafb;
    }
    
    .settings-content {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
        max-height: calc(85vh - 80px);
    }
    
    .form-group {
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .form-group:last-of-type {
        border-bottom: none;
    }
    
    .settings-section {
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .settings-section h3 {
        margin: 0 0 20px 0;
        font-size: 16px;
        font-weight: 600;
        color: #f9fafb;
    }
    
    .setting-group {
        margin-bottom: 16px;
    }
    
    label {
        display: block;
        color: #d1d5db;
        margin-bottom: 8px;
        font-weight: 500;
        font-size: 14px;
    }
    
    .api-key-input {
        position: relative;
        display: flex;
        align-items: center;
    }
    
    input[type="text"],
    input[type="password"],
    input[type="number"],
    select {
        width: 100%;
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #f9fafb;
        font-size: 14px;
        transition: all 0.3s ease;
    }
    
    select {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23a0a0a0' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        background-size: 16px 12px;
        padding-right: 40px;
    }
    
    /* Fix dropdown option colors for dark theme */
    select option {
        background: #2d2d2d;
        color: #f9fafb;
        border: none;
    }
    
    select option:checked {
        background: #4f46e5;
        color: white;
    }
    
    select:disabled {
        opacity: 0.5;
        background-color: rgba(255, 255, 255, 0.02);
    }
    
    .api-key-input input {
        padding-right: 50px;
    }
    
    input:focus,
    select:focus {
        outline: none;
        border-color: #6366f1;
        background-color: rgba(255, 255, 255, 0.08);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
    
    .toggle-visibility {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #9ca3af;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        padding: 8px;
        font-size: 16px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }
    
    .toggle-visibility:hover {
        color: #f9fafb;
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    .help-text {
        font-size: 13px;
        color: #9ca3af;
        margin-top: 8px;
        line-height: 1.5;
    }
    
    .help-text a {
        color: #a78bfa;
        text-decoration: none;
    }
    
    .help-text a:hover {
        text-decoration: underline;
    }
    
    .info-text {
        font-size: 14px;
        color: #9ca3af;
        margin-top: 8px;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        line-height: 1.5;
    }
    
    .loading-text {
        color: #a78bfa;
        font-size: 14px;
        padding: 12px 16px;
        background: rgba(167, 139, 250, 0.1);
        border-radius: 8px;
        border: 1px solid rgba(167, 139, 250, 0.2);
    }
    
    .error-text, .error-inline {
        color: #f87171;
        font-size: 14px;
        padding: 12px 16px;
        background: rgba(248, 113, 113, 0.1);
        border-radius: 8px;
        border: 1px solid rgba(248, 113, 113, 0.2);
    }
    
    .error-inline {
        display: block;
        margin-top: 8px;
        padding: 8px 12px;
    }
    
    .save-button {
        width: 100%;
        padding: 14px 20px;
        background: #6366f1;
        border: none;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        font-size: 14px;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        transition: all 0.3s ease;
        margin-top: 24px;
    }
    
    .save-button:hover:not(:disabled) {
        background: #7c3aed;
        transform: translateY(-1px);
        box-shadow: 0 8px 25px rgba(99, 102, 241, 0.3);
    }
    
    .save-button:disabled {
        opacity: 0.6;
        cursor: url('../assets/cursor-not-allowed.svg') 16 16, not-allowed;
        background: #4b5563;
        box-shadow: none;
        transform: none;
    }
    
    .success-message {
        padding: 12px 16px;
        border-radius: 8px;
        margin-top: 16px;
        font-size: 14px;
        text-align: center;
        color: #34d399;
        background: rgba(52, 211, 153, 0.1);
        border: 1px solid rgba(52, 211, 153, 0.2);
    }
    
    .error-message {
        padding: 12px 16px;
        border-radius: 8px;
        margin-top: 16px;
        font-size: 14px;
        text-align: center;
        color: #f87171;
        background: rgba(248, 113, 113, 0.1);
        border: 1px solid rgba(248, 113, 113, 0.2);
    }
    
    .checkbox-label {
        display: flex !important;
        align-items: center;
        gap: 12px;
        font-weight: 400 !important;
        margin-bottom: 0 !important;
        cursor: url('../assets/cursor-pointer.svg') 16 16, pointer;
        padding: 8px 0;
    }
    
    input[type="radio"] {
        accent-color: #6366f1;
    }
    
    input[type="checkbox"] {
        accent-color: #6366f1;
        width: 18px;
        height: 18px;
    }
    
    /* Scrollbar styling */
    ::-webkit-scrollbar {
        width: 8px;
    }
    
    ::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb {
        background: #6366f1;
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
        background: #7c3aed;
    }
</style>