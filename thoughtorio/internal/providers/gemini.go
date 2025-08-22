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

// GeminiProvider implements the AIProvider interface for Google Gemini
type GeminiProvider struct {
	name string
}

// NewGeminiProvider creates a new Gemini provider instance
func NewGeminiProvider() *GeminiProvider {
	return &GeminiProvider{
		name: "gemini",
	}
}

// GetName returns the provider name
func (p *GeminiProvider) GetName() string {
	return p.name
}

// RequiresAPIKey returns true since Gemini requires an API key
func (p *GeminiProvider) RequiresAPIKey() bool {
	return true
}

// ValidateConfig validates Gemini-specific configuration
func (p *GeminiProvider) ValidateConfig(config map[string]interface{}) error {
	apiKey, ok := config["api_key"].(string)
	if !ok || apiKey == "" {
		return fmt.Errorf("Gemini requires a valid API key")
	}
	return nil
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

// FetchModels retrieves available models from Gemini
func (p *GeminiProvider) FetchModels(ctx context.Context, apiKey string) ([]Model, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("Gemini API key cannot be empty")
	}

	// Construct the API URL
	apiURL := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models?key=%s", apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
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
			sdkModelID := model.Name
			if len(model.Name) > 7 && model.Name[:7] == "models/" {
				sdkModelID = model.Name[7:]
			}

			// Ensure we have a valid model ID
			if sdkModelID != "" {
				models[len(models)] = Model{
					ID:   sdkModelID,
					Name: model.DisplayName,
				}
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

// GetCompletion performs text completion using Gemini
func (p *GeminiProvider) GetCompletion(ctx context.Context, model, prompt, apiKey string) (AICompletionResponse, error) {
	reqBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]string{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": 2000,
		},
	}
	
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return AICompletionResponse{Error: err.Error()}, err
	}
	
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)
	
	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
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

		var errorResponse struct {
			Error struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
				Status  string `json:"status"`
			} `json:"error"`
		}

		if err := json.Unmarshal(body, &errorResponse); err == nil && errorResponse.Error.Message != "" {
			return AICompletionResponse{Error: errorResponse.Error.Message}, fmt.Errorf(errorResponse.Error.Message)
		}

		// Fallback for unexpected error format
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