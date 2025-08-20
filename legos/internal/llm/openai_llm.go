// internal/llm/openai_llm.go
package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"time"
)

const (
	OpenAIDefaultChatAPIEndpoint = "https://api.openai.com/v1/chat/completions"
	OpenAIModelsAPIEndpoint      = "https://api.openai.com/v1/models"
)

// OpenAIChatRequest defines the JSON structure for OpenAI chat completions
type OpenAIChatRequest struct {
	Model    string                `json:"model"`
	Messages []OpenAIChatMessage   `json:"messages"`
	Stream   bool                  `json:"stream"`
	// Other optional parameters can be added as needed
}

// OpenAIChatMessage is a single message in an OpenAI chat
type OpenAIChatMessage struct {
	Role    string `json:"role"`    // "system", "user", or "assistant"
	Content string `json:"content"`
}

// OpenAIChatResponse defines the JSON structure for OpenAI chat completions response
type OpenAIChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
}

// OpenAIModel represents a model from OpenAI's models API
type OpenAIModel struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	OwnedBy string `json:"owned_by"`
}

// OpenAIModelsResponse represents the response from OpenAI's models API
type OpenAIModelsResponse struct {
	Object string        `json:"object"`
	Data   []OpenAIModel `json:"data"`
}

// GetOpenAICompletion sends a chat completion request to OpenAI API
func GetOpenAICompletion(prompt, model, apiKey string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("OpenAI API key cannot be empty")
	}
	if model == "" {
		model = "gpt-3.5-turbo" // Default model
	}

	httpClient := &http.Client{Timeout: 120 * time.Second}

	requestPayload := OpenAIChatRequest{
		Model: model,
		Messages: []OpenAIChatMessage{
			{
				Role:    "user",
				Content: prompt,
			},
		},
		Stream: false,
	}

	bodyBytes, err := json.Marshal(requestPayload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal OpenAI request: %w", err)
	}

	req, err := http.NewRequest("POST", OpenAIDefaultChatAPIEndpoint, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create OpenAI HTTP request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("OpenAI request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read OpenAI response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("ERROR: OpenAI API returned status %d. Body: %s", resp.StatusCode, string(respBody))
		return "", fmt.Errorf("OpenAI API error (Status %d): %s", resp.StatusCode, string(respBody))
	}

	var chatResp OpenAIChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal OpenAI response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("OpenAI API returned no choices")
	}

	log.Printf("OpenAI completion successful using model %s", model)
	return chatResp.Choices[0].Message.Content, nil
}

// FetchOpenAIModels retrieves available models from OpenAI API
func FetchOpenAIModels(apiKey string) ([]OpenRouterModel, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("OpenAI API key cannot be empty")
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	log.Println("Fetching OpenAI models from:", OpenAIModelsAPIEndpoint)

	req, err := http.NewRequest("GET", OpenAIModelsAPIEndpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request for OpenAI models: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch OpenAI models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		log.Printf("ERROR: OpenAI models request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
		return nil, fmt.Errorf("OpenAI models request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read OpenAI models response: %w", err)
	}

	var apiResponse OpenAIModelsResponse
	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return nil, fmt.Errorf("failed to unmarshal OpenAI models response: %w", err)
	}

	// Filter to only chat models and convert to OpenRouterModel format for frontend compatibility
	var llmModels []OpenRouterModel
	for _, model := range apiResponse.Data {
		// Filter to only include GPT models (chat models)
		if model.ID == "gpt-3.5-turbo" || model.ID == "gpt-4" || model.ID == "gpt-4-turbo" ||
			model.ID == "gpt-4o" || model.ID == "gpt-4o-mini" {
			llmModels = append(llmModels, OpenRouterModel{
				ID:   model.ID,
				Name: model.ID, // Use ID as name for OpenAI models
			})
		}
	}

	log.Printf("Successfully fetched %d OpenAI chat models", len(llmModels))
	return llmModels, nil
}