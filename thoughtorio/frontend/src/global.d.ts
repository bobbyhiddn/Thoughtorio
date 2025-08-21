interface Go {
  main: {
    App: {
      GetAICompletion(mode: string, model: string, prompt: string, apiKey: string): Promise<{ Content: string, Error: string }>;
      FetchGeminiModels(apiKey: string): Promise<any>;
      SaveCanvas(canvasData: string): Promise<{ success: boolean, path?: string, error?: string }>;
      LoadCanvas(): Promise<{ success: boolean, path?: string, data?: string, error?: string }>;
      LoadCanvasFromPath(filePath: string): Promise<{ success: boolean, path?: string, data?: string, error?: string }>;
      GetRecentCanvases(): Promise<{ success: boolean, recents?: Array<{ name: string, path: string, lastOpened: number }>, error?: string }>;
    };
  };
}

interface Window {
  go: Go;
}
