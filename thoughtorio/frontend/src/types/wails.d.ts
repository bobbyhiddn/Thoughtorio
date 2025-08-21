declare global {
  interface Window {
    go?: {
      main?: {
        App?: {
          GetClipboard(): Promise<{ success: boolean; data?: string; error?: string }>;
          SetClipboard(text: string): Promise<{ success: boolean; data?: string; error?: string }>;
          GetAICompletion(mode: string, model: string, prompt: string, apiKey: string): Promise<any>;
          FetchGeminiModels(apiKey: string): Promise<any>;
          SaveCanvas(canvasData: string): Promise<any>;
          LoadCanvas(): Promise<any>;
          LoadCanvasFromPath(filePath: string): Promise<any>;
          GetRecentCanvases(): Promise<any>;
          [key: string]: any;
        };
      };
    };
    showCanvasContextMenu?: (x: number, y: number, items: any[]) => void;
  }
}

export {};