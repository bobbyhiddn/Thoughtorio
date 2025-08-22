package app

import (
	"context"

	"thoughtorio/internal/models"
	"thoughtorio/internal/providers"
	"thoughtorio/internal/services"
	"thoughtorio/internal/storage"
)

// App struct - simplified orchestration layer
type App struct {
	ctx              context.Context
	providerManager  *providers.ProviderManager
	canvasStorage    *storage.CanvasStorage
	recentsStorage   *storage.RecentsStorage
	clipboardService *services.ClipboardService
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		providerManager: providers.NewProviderManager(),
	}
}

// Startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.canvasStorage = storage.NewCanvasStorage(ctx)
	a.clipboardService = services.NewClipboardService(ctx)
	
	// Initialize recents storage
	recentsStorage, err := storage.NewRecentsStorage()
	if err != nil {
		// Log error but don't fail startup
		// Could implement proper logging here
		recentsStorage = nil
	}
	a.recentsStorage = recentsStorage
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return "Hello " + name + ", It's show time!"
}

// AI Provider Methods

// FetchOpenRouterModels fetches models from OpenRouter
func (a *App) FetchOpenRouterModels(apiKey string) ([]providers.Model, error) {
	return a.providerManager.FetchModels(a.ctx, "openrouter", apiKey)
}

// FetchOpenAIModels fetches models from OpenAI
func (a *App) FetchOpenAIModels(apiKey string) ([]providers.Model, error) {
	return a.providerManager.FetchModels(a.ctx, "openai", apiKey)
}

// FetchGeminiModels fetches models from Gemini
func (a *App) FetchGeminiModels(apiKey string) ([]providers.Model, error) {
	return a.providerManager.FetchModels(a.ctx, "gemini", apiKey)
}

// FetchOllamaModels fetches models from Ollama
func (a *App) FetchOllamaModels() ([]providers.Model, error) {
	return a.providerManager.FetchModels(a.ctx, "local", "")
}

// AICompletionResponse matches the expected frontend format
type AICompletionResponse struct {
	Content string
	Error   string `json:",omitempty"`
}

// GetAICompletion performs AI completion using the specified provider
// Returns the same format as the old system for frontend compatibility
func (a *App) GetAICompletion(provider, model, prompt, apiKey string) (AICompletionResponse, error) {
	response, err := a.providerManager.GetCompletion(a.ctx, provider, model, prompt, apiKey)
	
	// Convert providers.AICompletionResponse to our frontend-compatible format
	frontendResponse := AICompletionResponse{
		Content: response.Content,
		Error:   response.Error,
	}
	
	return frontendResponse, err
}

// Canvas File Operations

// SaveCanvas saves canvas data to a file
func (a *App) SaveCanvas(canvasData string) models.CanvasFileResult {
	result := a.canvasStorage.SaveCanvas(canvasData)
	
	// Add to recents if successful and recents storage is available
	if result.Success && result.Path != "" && a.recentsStorage != nil {
		a.recentsStorage.AddToRecentCanvases(result.Path)
	}
	
	return result
}

// LoadCanvas loads canvas data from a file
func (a *App) LoadCanvas() models.CanvasFileResult {
	result := a.canvasStorage.LoadCanvas()
	
	// Add to recents if successful and recents storage is available
	if result.Success && result.Path != "" && a.recentsStorage != nil {
		a.recentsStorage.AddToRecentCanvases(result.Path)
	}
	
	return result
}

// LoadCanvasFromPath loads canvas data from a specific path
func (a *App) LoadCanvasFromPath(filePath string) models.CanvasFileResult {
	result := a.canvasStorage.LoadCanvasFromPath(filePath)
	
	// Add to recents if successful and recents storage is available
	if result.Success && result.Path != "" && a.recentsStorage != nil {
		a.recentsStorage.AddToRecentCanvases(result.Path)
	}
	
	return result
}

// GetRecentCanvases returns the list of recent canvas files
func (a *App) GetRecentCanvases() models.RecentCanvasesResult {
	if a.recentsStorage == nil {
		return models.RecentCanvasesResult{Success: false, Error: "Recents storage not available"}
	}
	
	return a.recentsStorage.GetRecentCanvases()
}

// Clipboard Operations

// SetClipboard sets text in the system clipboard
func (a *App) SetClipboard(text string) models.ClipboardResult {
	return a.clipboardService.SetClipboard(text)
}

// GetClipboard gets text from the system clipboard
func (a *App) GetClipboard() models.ClipboardResult {
	return a.clipboardService.GetClipboard()
}