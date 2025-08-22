package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"thoughtorio/internal/models"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// CanvasStorage handles canvas file operations
type CanvasStorage struct {
	ctx context.Context
}

// NewCanvasStorage creates a new canvas storage instance
func NewCanvasStorage(ctx context.Context) *CanvasStorage {
	return &CanvasStorage{
		ctx: ctx,
	}
}

// SaveCanvas opens a save dialog and saves the canvas data to the selected file
func (cs *CanvasStorage) SaveCanvas(canvasData string) models.CanvasFileResult {
	// Open save file dialog
	filePath, err := runtime.SaveFileDialog(cs.ctx, runtime.SaveDialogOptions{
		Title:           "Save Canvas",
		DefaultFilename: "canvas.thoughtorio",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Thoughtorio Canvas Files (*.thoughtorio)",
				Pattern:     "*.thoughtorio",
			},
			{
				DisplayName: "JSON Files (*.json)",
				Pattern:     "*.json",
			},
		},
	})
	
	if err != nil {
		return models.CanvasFileResult{Success: false, Error: fmt.Sprintf("Failed to open save dialog: %v", err)}
	}
	
	if filePath == "" {
		return models.CanvasFileResult{Success: false, Error: "Save cancelled by user"}
	}
	
	// Write canvas data to file
	err = os.WriteFile(filePath, []byte(canvasData), 0644)
	if err != nil {
		return models.CanvasFileResult{Success: false, Error: fmt.Sprintf("Failed to write file: %v", err)}
	}
	
	return models.CanvasFileResult{Success: true, Path: filePath}
}

// LoadCanvas opens a file dialog and loads canvas data from the selected file
func (cs *CanvasStorage) LoadCanvas() models.CanvasFileResult {
	// Open file dialog
	filePath, err := runtime.OpenFileDialog(cs.ctx, runtime.OpenDialogOptions{
		Title: "Load Canvas",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Thoughtorio Canvas Files (*.thoughtorio)",
				Pattern:     "*.thoughtorio",
			},
			{
				DisplayName: "JSON Files (*.json)",
				Pattern:     "*.json",
			},
		},
	})
	
	if err != nil {
		return models.CanvasFileResult{Success: false, Error: fmt.Sprintf("Failed to open file dialog: %v", err)}
	}
	
	if filePath == "" {
		return models.CanvasFileResult{Success: false, Error: "Load cancelled by user"}
	}
	
	return cs.LoadCanvasFromPath(filePath)
}

// LoadCanvasFromPath loads canvas data from a specific file path
func (cs *CanvasStorage) LoadCanvasFromPath(filePath string) models.CanvasFileResult {
	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return models.CanvasFileResult{Success: false, Error: "File does not exist"}
	}
	
	// Read canvas data from file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return models.CanvasFileResult{Success: false, Error: fmt.Sprintf("Failed to read file: %v", err)}
	}
	
	// Validate JSON
	var temp interface{}
	if err := json.Unmarshal(data, &temp); err != nil {
		return models.CanvasFileResult{Success: false, Error: "Invalid canvas file format"}
	}
	
	return models.CanvasFileResult{Success: true, Path: filePath, Data: string(data)}
}