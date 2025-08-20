// internal/llm/gemini_llm.go
package llm

import (
	"context"
	"fmt"
	"log"

	"google.golang.org/genai"
)

const (
	GeminiDefaultChatModel = "gemini-pro"
)

// Available Gemini models for chat
var GeminiChatModels = []OpenRouterModel{
	{ID: "gemini-pro", Name: "Gemini Pro"},
	{ID: "gemini-pro-vision", Name: "Gemini Pro Vision"},
	{ID: "gemini-1.5-pro", Name: "Gemini 1.5 Pro"},
	{ID: "gemini-1.5-flash", Name: "Gemini 1.5 Flash"},
}

// GetGeminiCompletion generates a chat completion using Gemini API
func GetGeminiCompletion(prompt, model, apiKey string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("Gemini API key cannot be empty")
	}
	if model == "" {
		model = GeminiDefaultChatModel
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, &genai.ClientConfig{APIKey: apiKey})
	if err != nil {
		log.Printf("Failed to create Gemini client: %v", err)
		return "", fmt.Errorf("failed to create Gemini client: %w", err)
	}
	defer client.Close()

	// Get the generative model
	genModel := client.GenerativeModel(model)
	if genModel == nil {
		return "", fmt.Errorf("failed to get Gemini model: %s", model)
	}

	// Generate content
	resp, err := genModel.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		log.Printf("Gemini content generation failed: %v", err)
		return "", fmt.Errorf("failed to generate content with Gemini: %w", err)
	}

	if resp == nil || len(resp.Candidates) == 0 {
		return "", fmt.Errorf("Gemini returned no response candidates")
	}

	candidate := resp.Candidates[0]
	if candidate.Content == nil || len(candidate.Content.Parts) == 0 {
		return "", fmt.Errorf("Gemini candidate has no content parts")
	}

	// Extract text from the first part
	firstPart := candidate.Content.Parts[0]
	if textPart, ok := firstPart.(genai.Text); ok {
		log.Printf("Gemini completion successful using model %s", model)
		return string(textPart), nil
	}

	return "", fmt.Errorf("Gemini response part is not text")
}

// FetchGeminiModels returns the list of available Gemini chat models
// Since Gemini doesn't have a public models API like OpenAI, we return a static list
func FetchGeminiModels(apiKey string) ([]OpenRouterModel, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("Gemini API key cannot be empty")
	}

	// For now, return static list of known Gemini models
	// In the future, this could be enhanced to test model availability
	log.Printf("Returning %d known Gemini chat models", len(GeminiChatModels))
	
	// Return a copy to avoid external modification
	models := make([]OpenRouterModel, len(GeminiChatModels))
	copy(models, GeminiChatModels)
	
	return models, nil
}