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

// OpenRouterProvider implements the AIProvider interface for OpenRouter
type OpenRouterProvider struct {
	name string
}

// NewOpenRouterProvider creates a new OpenRouter provider instance
func NewOpenRouterProvider() *OpenRouterProvider {
	return &OpenRouterProvider{
		name: "openrouter",
	}
}

// GetName returns the provider name
func (p *OpenRouterProvider) GetName() string {
	return p.name
}

// RequiresAPIKey returns true since OpenRouter requires an API key
func (p *OpenRouterProvider) RequiresAPIKey() bool {
	return true
}

// ValidateConfig validates OpenRouter-specific configuration
func (p *OpenRouterProvider) ValidateConfig(config map[string]interface{}) error {
	apiKey, ok := config["api_key"].(string)
	if !ok || apiKey == "" {
		return fmt.Errorf("OpenRouter requires a valid API key")
	}
	return nil
}

// FetchModels retrieves available models from OpenRouter
func (p *OpenRouterProvider) FetchModels(ctx context.Context, apiKey string) ([]Model, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("OpenRouter API key cannot be empty")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", "https://openrouter.ai/api/v1/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("OpenRouter API error: %s", string(body))
	}

	var result struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	models := make([]Model, len(result.Data))
	for i, model := range result.Data {
		models[i] = Model{
			ID:   model.ID,
			Name: model.Name,
		}
	}

	return models, nil
}

// GetCompletion performs text completion using OpenRouter
func (p *OpenRouterProvider) GetCompletion(ctx context.Context, model, prompt, apiKey string) (AICompletionResponse, error) {
	reqBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"max_tokens": 1000,
	}
	
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(jsonBody))
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://thoughtorio.app")
	req.Header.Set("X-Title", "Thoughtorio")
	
	resp, err := client.Do(req)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("OpenRouter API error (%d): %s", resp.StatusCode, string(body))
		return AICompletionResponse{Error: errMsg}, fmt.Errorf(errMsg)
	}
	
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	if result.Error.Message != "" {
		return AICompletionResponse{Error: result.Error.Message}, fmt.Errorf("OpenRouter error: %s", result.Error.Message)
	}
	
	if len(result.Choices) == 0 {
		return AICompletionResponse{Error: "No response from OpenRouter"}, fmt.Errorf("no response from OpenRouter")
	}
	
	return AICompletionResponse{Content: result.Choices[0].Message.Content}, nil
}