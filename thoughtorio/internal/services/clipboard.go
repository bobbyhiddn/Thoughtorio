package services

import (
	"context"
	"fmt"

	"thoughtorio/internal/models"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ClipboardService handles clipboard operations
type ClipboardService struct {
	ctx context.Context
}

// NewClipboardService creates a new clipboard service instance
func NewClipboardService(ctx context.Context) *ClipboardService {
	return &ClipboardService{
		ctx: ctx,
	}
}

// SetClipboard writes text to the system clipboard
func (cs *ClipboardService) SetClipboard(text string) models.ClipboardResult {
	err := runtime.ClipboardSetText(cs.ctx, text)
	if err != nil {
		return models.ClipboardResult{Success: false, Error: fmt.Sprintf("Failed to set clipboard: %v", err)}
	}
	return models.ClipboardResult{Success: true}
}

// GetClipboard reads text from the system clipboard
func (cs *ClipboardService) GetClipboard() models.ClipboardResult {
	text, err := runtime.ClipboardGetText(cs.ctx)
	if err != nil {
		return models.ClipboardResult{Success: false, Error: fmt.Sprintf("Failed to get clipboard: %v", err)}
	}
	return models.ClipboardResult{Success: true, Data: text}
}