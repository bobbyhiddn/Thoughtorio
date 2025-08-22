package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"sort"
	"strings"
	"time"
)

// OpenAIProvider implements the AIProvider interface for OpenAI
type OpenAIProvider struct {
	name string
}

// NewOpenAIProvider creates a new OpenAI provider instance
func NewOpenAIProvider() *OpenAIProvider {
	return &OpenAIProvider{
		name: "openai",
	}
}

// GetName returns the provider name
func (p *OpenAIProvider) GetName() string {
	return p.name
}

// RequiresAPIKey returns true since OpenAI requires an API key
func (p *OpenAIProvider) RequiresAPIKey() bool {
	return true
}

// ValidateConfig validates OpenAI-specific configuration
func (p *OpenAIProvider) ValidateConfig(config map[string]interface{}) error {
	apiKey, ok := config["api_key"].(string)
	if !ok || apiKey == "" {
		return fmt.Errorf("OpenAI requires a valid API key")
	}
	return nil
}

// FetchModels retrieves available models from OpenAI
func (p *OpenAIProvider) FetchModels(ctx context.Context, apiKey string) ([]Model, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("OpenAI API key cannot be empty")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.openai.com/v1/models", nil)
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
		return nil, fmt.Errorf("OpenAI API error: %s", string(body))
	}

	var result struct {
		Data []struct {
			ID      string `json:"id"`
			Object  string `json:"object"`
			OwnedBy string `json:"owned_by"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// Filter for GPT models that support chat completions
	var models []Model
	for _, model := range result.Data {
		// Only include GPT models that support chat completions
		if strings.HasPrefix(model.ID, "gpt") && !strings.Contains(model.ID, "instruct") && !strings.Contains(model.ID, "vision") {
			models = append(models, Model{
				ID:   model.ID,
				Name: model.ID, // Use ID as name as friendly names aren't always distinct or present
			})
		}
	}

	// Sort models by ID for consistency
	sort.Slice(models, func(i, j int) bool {
		return models[i].ID < models[j].ID
	})

	return models, nil
}

// GetCompletion performs text completion using OpenAI
func (p *OpenAIProvider) GetCompletion(ctx context.Context, model, prompt, apiKey string) (AICompletionResponse, error) {
	reqBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"max_completion_tokens": 1000,
	}
	
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(jsonBody))
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := client.Do(req)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("OpenAI API error (%d): %s", resp.StatusCode, string(body))
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
		return AICompletionResponse{Error: result.Error.Message}, fmt.Errorf("OpenAI error: %s", result.Error.Message)
	}
	
	if len(result.Choices) == 0 {
		return AICompletionResponse{Error: "No response from OpenAI"}, fmt.Errorf("no response from OpenAI")
	}
	
	return AICompletionResponse{Content: result.Choices[0].Message.Content}, nil
}