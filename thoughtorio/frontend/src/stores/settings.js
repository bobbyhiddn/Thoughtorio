import { writable } from 'svelte/store';

// Available AI providers based on your Go lego code
export const availableProviders = [
    {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Access multiple LLM providers through OpenRouter',
        requiresApiKey: true,
        models: []
    },
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'Direct OpenAI API integration',
        requiresApiKey: true,
        models: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo']
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Google Gemini Pro models',
        requiresApiKey: true,
        models: ['gemini-pro', 'gemini-pro-vision']
    },
    {
        id: 'local',
        name: 'Local (Ollama)',
        description: 'Local models via Ollama',
        requiresApiKey: false,
        models: []
    }
];

// Available embedding providers
export const availableEmbeddingProviders = [
    {
        id: 'openai',
        name: 'OpenAI Embeddings',
        description: 'OpenAI text-embedding-3-small/large'
    },
    {
        id: 'gemini',
        name: 'Gemini Embeddings',
        description: 'Google Gemini embedding models'
    },
    {
        id: 'local',
        name: 'Local Embeddings',
        description: 'Local embedding models'
    }
];

// Model list stores
export const modelList = writable([]);
export const isModelListLoading = writable(false);
export const modelListError = writable('');
export const embeddingModelList = writable([]);
export const isEmbeddingModelListLoading = writable(false);
export const embeddingModelListError = writable('');

// Settings store
export const settings = writable({
    // LLM Provider settings
    activeMode: 'openrouter',
    openrouter_api_key: '',
    openai_api_key: '',
    openai_embedding_api_key: '',
    gemini_api_key: '',
    gemini_embedding_api_key: '',
    chat_model_id: '',
    story_processing_model_id: '',
    local_embedding_model_name: '',
    
    // UI settings
    showContainerLabels: true,
    autoExecuteWorkflows: false,
    debugMode: false,
    
    // Canvas settings  
    defaultNodeWidth: 200,
    defaultNodeHeight: 120,
    containerPadding: 20
});

// Store provider-specific model selections
export const providerModels = writable({
    openrouter: { chat: '', story: '' },
    openai: { chat: '', story: '' },
    gemini: { chat: '', story: '' },
    local: { chat: '', story: '' }
});

// Settings actions
export const settingsActions = {
    // Load settings from backend/localStorage
    load: async () => {
        try {
            // TODO: Call Wails backend to get config from ~/.llore/config.json
            // For now, try localStorage as fallback
            const saved = localStorage.getItem('thoughtorio-settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                settings.update(current => ({ ...current, ...parsed }));
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    },
    
    // Save settings to backend/localStorage
    save: async (newSettings) => {
        try {
            settings.update(current => ({ ...current, ...newSettings }));
            
            // TODO: Call Wails backend to save config to ~/.llore/config.json
            // For now, save to localStorage as fallback
            localStorage.setItem('thoughtorio-settings', JSON.stringify(newSettings));
            
            console.log('Settings saved:', newSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    },
    
    // Update specific setting
    update: (key, value) => {
        settings.update(current => {
            const updated = { ...current, [key]: value };
            // Auto-save when settings change
            settingsActions.save(updated);
            return updated;
        });
    },
    
    // Reset to defaults
    reset: () => {
        const defaults = {
            activeMode: 'openrouter',
            openrouter_api_key: '',
            openai_api_key: '',
            openai_embedding_api_key: '',
            gemini_api_key: '',
            gemini_embedding_api_key: '',
            chat_model_id: '',
            story_processing_model_id: '',
            local_embedding_model_name: '',
            showContainerLabels: true,
            autoExecuteWorkflows: false,
            debugMode: false,
            defaultNodeWidth: 200,
            defaultNodeHeight: 120,
            containerPadding: 20
        };
        settings.set(defaults);
        settingsActions.save(defaults);
    },
    
    // Test connection with current provider
    testConnection: async () => {
        // TODO: Implement provider connection test
        return { success: true, message: 'Connection test not implemented yet' };
    },
    
    // Fetch available models for current provider
    fetchModels: async (providerId, apiKey) => {
        try {
            isModelListLoading.set(true);
            modelListError.set('');
            
            console.log(`Fetching models for ${providerId}...`);
            
            // Check if Wails is available - if not, provide fallback data for development
            if (!window.go || !window.go.main || !window.go.main.App) {
                console.warn('Wails runtime not available - using fallback data for development');
                
                // Provide fallback data for development mode
                if (providerId === 'openrouter') {
                    models = [
                        { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o' },
                        { id: 'openai/gpt-4', name: 'OpenAI: GPT-4' },
                        { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic: Claude 3.5 Sonnet' }
                    ];
                } else if (providerId === 'openai') {
                    models = [
                        { id: 'gpt-4o', name: 'GPT-4o' },
                        { id: 'gpt-4', name: 'GPT-4' },
                        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
                    ];
                } else if (providerId === 'gemini') {
                    models = [
                        { id: 'gemini-pro', name: 'Gemini Pro' },
                        { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' }
                    ];
                } else if (providerId === 'local') {
                    models = [
                        { id: 'llama3:latest', name: 'Llama 3' },
                        { id: 'mistral:latest', name: 'Mistral' }
                    ];
                }
                
                modelList.set(models);
                return models;
            }
            
            let models = [];
            
            if (providerId === 'openrouter') {
                models = await window.go.main.App.FetchOpenRouterModels(apiKey);
            } else if (providerId === 'openai') {
                models = await window.go.main.App.FetchOpenAIModels(apiKey);
            } else if (providerId === 'gemini') {
                models = await window.go.main.App.FetchGeminiModels(apiKey);
            } else if (providerId === 'local') {
                models = await window.go.main.App.FetchOllamaModels();
            }
            
            modelList.set(models || []);
            return models || [];
        } catch (error) {
            console.error('Failed to fetch models:', error);
            modelListError.set(`Error loading models: ${error.message}`);
            modelList.set([]);
            return [];
        } finally {
            isModelListLoading.set(false);
        }
    },

    // Fetch embedding models (for local mode)
    fetchEmbeddingModels: async () => {
        try {
            isEmbeddingModelListLoading.set(true);
            embeddingModelListError.set('');
            
            // Check if Wails is available - if not, provide fallback data for development
            if (!window.go || !window.go.main || !window.go.main.App) {
                console.warn('Wails runtime not available - using fallback embedding models for development');
                
                const models = [
                    { id: 'nomic-embed-text:latest', name: 'Nomic Embed Text' },
                    { id: 'all-minilm:latest', name: 'All MiniLM' }
                ];
                
                embeddingModelList.set(models);
                return models;
            }
            
            // Use Ollama models for embedding (same API)
            const models = await window.go.main.App.FetchOllamaModels();
            
            embeddingModelList.set(models || []);
            return models || [];
        } catch (error) {
            console.error('Failed to fetch embedding models:', error);
            embeddingModelListError.set(`Error loading embedding models: ${error.message}`);
            embeddingModelList.set([]);
            return [];
        } finally {
            isEmbeddingModelListLoading.set(false);
        }
    },

    // Clear model lists
    clearModels: () => {
        modelList.set([]);
        modelListError.set('');
        embeddingModelList.set([]);
        embeddingModelListError.set('');
    }
};

// Initialize settings on app load
settingsActions.load();