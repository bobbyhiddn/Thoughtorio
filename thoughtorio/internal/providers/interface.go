package providers

import "context"

// Model represents a model from any provider
type Model struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AICompletionResponse represents the response from an AI completion request
type AICompletionResponse struct {
	Content string `json:"content"`
	Error   string `json:"error,omitempty"`
}

// AIProvider defines the interface that all AI providers must implement
type AIProvider interface {
	// GetName returns the unique name/identifier for this provider
	GetName() string
	
	// FetchModels retrieves available models for this provider
	FetchModels(ctx context.Context, apiKey string) ([]Model, error)
	
	// GetCompletion performs text completion using the specified model
	GetCompletion(ctx context.Context, model, prompt, apiKey string) (AICompletionResponse, error)
	
	// ValidateConfig validates the provider-specific configuration
	ValidateConfig(config map[string]interface{}) error
	
	// RequiresAPIKey returns true if this provider requires an API key
	RequiresAPIKey() bool
}