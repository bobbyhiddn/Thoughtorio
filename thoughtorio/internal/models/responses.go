package models

// CanvasFileResult represents the result of canvas file operations
type CanvasFileResult struct {
	Success bool   `json:"success"`
	Path    string `json:"path,omitempty"`
	Data    string `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

// RecentCanvas represents a recently opened canvas file
type RecentCanvas struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	LastOpened int64  `json:"lastOpened"`
}

// RecentCanvasesResult represents the result of fetching recent canvases
type RecentCanvasesResult struct {
	Success bool           `json:"success"`
	Recents []RecentCanvas `json:"recents,omitempty"`
	Error   string         `json:"error,omitempty"`
}

// ClipboardResult represents the result of clipboard operations
type ClipboardResult struct {
	Success bool   `json:"success"`
	Data    string `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}