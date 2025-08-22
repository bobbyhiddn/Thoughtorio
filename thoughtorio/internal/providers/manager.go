package providers

import (
	"context"
	"fmt"
	"sync"
)

// ProviderManager manages all AI providers
type ProviderManager struct {
	providers map[string]AIProvider
	mu        sync.RWMutex
}

// NewProviderManager creates a new provider manager with all default providers
func NewProviderManager() *ProviderManager {
	pm := &ProviderManager{
		providers: make(map[string]AIProvider),
	}

	// Register all default providers
	pm.RegisterProvider(NewOpenRouterProvider())
	pm.RegisterProvider(NewOpenAIProvider())
	pm.RegisterProvider(NewGeminiProvider())
	pm.RegisterProvider(NewOllamaProvider())

	return pm
}

// RegisterProvider registers a new AI provider
func (pm *ProviderManager) RegisterProvider(provider AIProvider) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.providers[provider.GetName()] = provider
}

// GetProvider returns a provider by name
func (pm *ProviderManager) GetProvider(name string) (AIProvider, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	
	provider, exists := pm.providers[name]
	if !exists {
		return nil, fmt.Errorf("provider '%s' not found", name)
	}
	
	return provider, nil
}

// ListProviders returns a list of all registered provider names
func (pm *ProviderManager) ListProviders() []string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	
	names := make([]string, 0, len(pm.providers))
	for name := range pm.providers {
		names = append(names, name)
	}
	
	return names
}

// FetchModels fetches models for a specific provider
func (pm *ProviderManager) FetchModels(ctx context.Context, providerName, apiKey string) ([]Model, error) {
	provider, err := pm.GetProvider(providerName)
	if err != nil {
		return nil, err
	}
	
	return provider.FetchModels(ctx, apiKey)
}

// GetCompletion gets a completion from a specific provider
func (pm *ProviderManager) GetCompletion(ctx context.Context, providerName, model, prompt, apiKey string) (AICompletionResponse, error) {
	provider, err := pm.GetProvider(providerName)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	return provider.GetCompletion(ctx, model, prompt, apiKey)
}

// ValidateProviderConfig validates configuration for a specific provider
func (pm *ProviderManager) ValidateProviderConfig(providerName string, config map[string]interface{}) error {
	provider, err := pm.GetProvider(providerName)
	if err != nil {
		return err
	}
	
	return provider.ValidateConfig(config)
}

// ProviderRequiresAPIKey checks if a provider requires an API key
func (pm *ProviderManager) ProviderRequiresAPIKey(providerName string) (bool, error) {
	provider, err := pm.GetProvider(providerName)
	if err != nil {
		return false, err
	}
	
	return provider.RequiresAPIKey(), nil
}