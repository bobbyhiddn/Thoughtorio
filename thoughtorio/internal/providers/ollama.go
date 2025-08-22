package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"
)

// OllamaProvider implements the AIProvider interface for local Ollama models
type OllamaProvider struct {
	name    string
	baseURL string
}

// NewOllamaProvider creates a new Ollama provider instance
func NewOllamaProvider() *OllamaProvider {
	return &OllamaProvider{
		name:    "local",
		baseURL: "http://localhost:11434",
	}
}

// GetName returns the provider name
func (p *OllamaProvider) GetName() string {
	return p.name
}

// RequiresAPIKey returns false since Ollama is local and doesn't require an API key
func (p *OllamaProvider) RequiresAPIKey() bool {
	return false
}

// ValidateConfig validates Ollama-specific configuration
func (p *OllamaProvider) ValidateConfig(config map[string]interface{}) error {
	// Ollama doesn't require specific configuration validation
	// Could add base URL validation in the future if customizable
	return nil
}

// FetchModels retrieves available models from Ollama
func (p *OllamaProvider) FetchModels(ctx context.Context, apiKey string) ([]Model, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", p.baseURL+"/api/tags", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request for Ollama models: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Ollama models (is Ollama running?): %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("Ollama API error: %s", string(body))
	}

	var result struct {
		Models []struct {
			Name       string    `json:"name"`
			ModifiedAt time.Time `json:"modified_at"`
			Size       int64     `json:"size"`
		} `json:"models"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	models := make([]Model, len(result.Models))
	for i, model := range result.Models {
		models[i] = Model{
			ID:   model.Name,
			Name: model.Name,
		}
	}

	return models, nil
}

// GetCompletion performs text completion using Ollama
func (p *OllamaProvider) GetCompletion(ctx context.Context, model, prompt, apiKey string) (AICompletionResponse, error) {
	reqBody := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": false,
	}
	
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	client := &http.Client{Timeout: 120 * time.Second} // Longer timeout for local models
	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/generate", bytes.NewBuffer(jsonBody))
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := client.Do(req)
	if err != nil {
		return AICompletionResponse{Error: "Ollama connection failed (is Ollama running?): " + err.Error()}, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("Ollama API error (%d): %s", resp.StatusCode, string(body))
		return AICompletionResponse{Error: errMsg}, fmt.Errorf(errMsg)
	}
	
	var result struct {
		Response string `json:"response"`
		Error    string `json:"error"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	if result.Error != "" {
		return AICompletionResponse{Error: result.Error}, fmt.Errorf("Ollama error: %s", result.Error)
	}
	
	return AICompletionResponse{Content: result.Response}, nil
}