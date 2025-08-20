package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// Model represents a model from any provider
type Model struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// OpenRouter model fetching
func (a *App) FetchOpenRouterModels(apiKey string) ([]Model, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("OpenRouter API key cannot be empty")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", "https://openrouter.ai/api/v1/models", nil)
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

// OpenAI model fetching
func (a *App) FetchOpenAIModels(apiKey string) ([]Model, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("OpenAI API key cannot be empty")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", "https://api.openai.com/v1/models", nil)
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

	// Filter to only chat models
	var models []Model
	for _, model := range result.Data {
		if model.ID == "gpt-3.5-turbo" || model.ID == "gpt-4" || model.ID == "gpt-4-turbo" ||
			model.ID == "gpt-4o" || model.ID == "gpt-4o-mini" {
			models = append(models, Model{
				ID:   model.ID,
				Name: model.ID,
			})
		}
	}

	return models, nil
}

// GeminiAPIModelInfo represents individual model information from the Gemini API
type GeminiAPIModelInfo struct {
	Name                        string   `json:"name"`
	DisplayName                 string   `json:"displayName"`
	Description                 string   `json:"description"`
	SupportedGenerationMethods  []string `json:"supportedGenerationMethods"`
}

// GeminiAPIModelListResponse is the top-level structure for the API's model list response
type GeminiAPIModelListResponse struct {
	Models        []GeminiAPIModelInfo `json:"models"`
	NextPageToken string               `json:"nextPageToken,omitempty"`
}

// Gemini model fetching - dynamically fetches from Gemini API
func (a *App) FetchGeminiModels(apiKey string) ([]Model, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("Gemini API key cannot be empty")
	}

	// Construct the API URL
	apiURL := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models?key=%s", apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request for Gemini models: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch models from Gemini API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("Gemini API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read Gemini API response body: %w", err)
	}

	var apiResponse GeminiAPIModelListResponse
	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return nil, fmt.Errorf("failed to unmarshal Gemini API response: %w", err)
	}

	var models []Model
	for _, model := range apiResponse.Models {
		isGenerativeModel := false
		for _, method := range model.SupportedGenerationMethods {
			if method == "generateContent" { // We need this for generative models
				isGenerativeModel = true
				break
			}
		}

		if isGenerativeModel {
			// The Gemini SDK expects the model ID without the "models/" prefix
			// (e.g., "gemini-1.5-pro-latest")
			sdkModelID := model.Name
			if len(model.Name) > 7 && model.Name[:7] == "models/" {
				sdkModelID = model.Name[7:]
			}

			// Ensure we have a valid model ID
			if sdkModelID != "" {
				models = append(models, Model{
					ID:   sdkModelID,
					Name: model.DisplayName,
				})
			}
		}
	}

	// Sort models by display name for consistent UI presentation
	for i := 0; i < len(models)-1; i++ {
		for j := i + 1; j < len(models); j++ {
			if models[i].Name > models[j].Name {
				models[i], models[j] = models[j], models[i]
			}
		}
	}

	return models, nil
}

// Ollama model fetching
func (a *App) FetchOllamaModels() ([]Model, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", "http://localhost:11434/api/tags", nil)
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

// AI Completion request/response structs
type AICompletionRequest struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Prompt   string `json:"prompt"`
	APIKey   string `json:"api_key"`
}

type AICompletionResponse struct {
	Content string `json:"content"`
	Error   string `json:"error,omitempty"`
}

// Main AI completion function - routes to appropriate provider
func (a *App) GetAICompletion(provider, model, prompt, apiKey string) (AICompletionResponse, error) {
	switch provider {
	case "openrouter":
		return a.getOpenRouterCompletion(model, prompt, apiKey)
	case "openai":
		return a.getOpenAICompletion(model, prompt, apiKey)
	case "gemini":
		return a.getGeminiCompletion(model, prompt, apiKey)
	case "local":
		return a.getOllamaCompletion(model, prompt)
	default:
		return AICompletionResponse{Error: "Unknown provider: " + provider}, fmt.Errorf("unknown provider: %s", provider)
	}
}

// OpenRouter completion
func (a *App) getOpenRouterCompletion(model, prompt, apiKey string) (AICompletionResponse, error) {
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
	req, err := http.NewRequest("POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(jsonBody))
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

// OpenAI completion
func (a *App) getOpenAICompletion(model, prompt, apiKey string) (AICompletionResponse, error) {
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
	req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(jsonBody))
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

// Gemini completion
func (a *App) getGeminiCompletion(model, prompt, apiKey string) (AICompletionResponse, error) {
	reqBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": 1000,
		},
	}
	
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)
	
	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := client.Do(req)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		body, _ := ioutil.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("Gemini API error (%d): %s", resp.StatusCode, string(body))
		return AICompletionResponse{Error: errMsg}, fmt.Errorf(errMsg)
	}
	
	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	if result.Error.Message != "" {
		return AICompletionResponse{Error: result.Error.Message}, fmt.Errorf("Gemini error: %s", result.Error.Message)
	}
	
	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return AICompletionResponse{Error: "No response from Gemini"}, fmt.Errorf("no response from Gemini")
	}
	
	return AICompletionResponse{Content: result.Candidates[0].Content.Parts[0].Text}, nil
}

// Ollama completion for local models
func (a *App) getOllamaCompletion(model, prompt string) (AICompletionResponse, error) {
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
	req, err := http.NewRequest("POST", "http://localhost:11434/api/generate", bytes.NewBuffer(jsonBody))
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
