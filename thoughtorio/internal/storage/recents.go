package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"thoughtorio/internal/models"
)

// RecentsStorage handles recent canvas files management
type RecentsStorage struct {
	configDir string
}

// NewRecentsStorage creates a new recents storage instance
func NewRecentsStorage() (*RecentsStorage, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get config directory: %w", err)
	}
	
	thoughtorioDir := filepath.Join(configDir, "thoughtorio")
	if err := os.MkdirAll(thoughtorioDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create config directory: %w", err)
	}
	
	return &RecentsStorage{
		configDir: thoughtorioDir,
	}, nil
}

// GetRecentCanvases returns the list of recently opened canvas files
func (rs *RecentsStorage) GetRecentCanvases() models.RecentCanvasesResult {
	recents, err := rs.loadRecentCanvases()
	if err != nil {
		return models.RecentCanvasesResult{Success: false, Error: fmt.Sprintf("Failed to load recent canvases: %v", err)}
	}
	
	return models.RecentCanvasesResult{Success: true, Recents: recents}
}

// AddToRecentCanvases adds a file to the recent canvases list
func (rs *RecentsStorage) AddToRecentCanvases(filePath string) error {
	recents, _ := rs.loadRecentCanvases()
	
	// Create new recent entry
	newRecent := models.RecentCanvas{
		Name:       filepath.Base(filePath),
		Path:       filePath,
		LastOpened: time.Now().Unix() * 1000, // Milliseconds for JavaScript compatibility
	}
	
	// Remove if already exists
	for i, recent := range recents {
		if recent.Path == filePath {
			recents = append(recents[:i], recents[i+1:]...)
			break
		}
	}
	
	// Add to front
	recents = append([]models.RecentCanvas{newRecent}, recents...)
	
	// Keep only last 10
	if len(recents) > 10 {
		recents = recents[:10]
	}
	
	// Save back to file
	return rs.saveRecentCanvases(recents)
}

// loadRecentCanvases loads the recent canvases from storage
func (rs *RecentsStorage) loadRecentCanvases() ([]models.RecentCanvas, error) {
	recentsFile := filepath.Join(rs.configDir, "recents.json")
	
	// If file doesn't exist, return empty list
	if _, err := os.Stat(recentsFile); os.IsNotExist(err) {
		return []models.RecentCanvas{}, nil
	}
	
	data, err := os.ReadFile(recentsFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read recents file: %w", err)
	}
	
	var recents []models.RecentCanvas
	if err := json.Unmarshal(data, &recents); err != nil {
		return nil, fmt.Errorf("failed to parse recents file: %w", err)
	}
	
	// Filter out files that no longer exist
	var validRecents []models.RecentCanvas
	for _, recent := range recents {
		if _, err := os.Stat(recent.Path); err == nil {
			validRecents = append(validRecents, recent)
		}
	}
	
	// Sort by last opened (most recent first)
	sort.Slice(validRecents, func(i, j int) bool {
		return validRecents[i].LastOpened > validRecents[j].LastOpened
	})
	
	return validRecents, nil
}

// saveRecentCanvases saves the recent canvases to storage
func (rs *RecentsStorage) saveRecentCanvases(recents []models.RecentCanvas) error {
	recentsFile := filepath.Join(rs.configDir, "recents.json")
	
	data, err := json.MarshalIndent(recents, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal recents: %w", err)
	}
	
	return os.WriteFile(recentsFile, data, 0644)
}