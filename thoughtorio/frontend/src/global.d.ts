interface Go {
  main: {
    App: {
      GetAICompletion(mode: string, model: string, prompt: string, apiKey: string): Promise<{ Content: string, Error: string }>;
      FetchGeminiModels(apiKey: string): Promise<any>;
    };
  };
}

interface Window {
  go: Go;
}
