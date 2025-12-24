export type ProcessStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

export interface VLLMProcess {
  id: string;
  modelId: string;
  modelName: string;
  modelPath: string;
  port: number;
  status: ProcessStatus;
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  config: VLLMConfig;
  error?: string;
}

export interface VLLMConfig {
  port: number;
  host: string;
  tokenizer?: string;
  tokenizerMode?: "auto" | "slow";
  tensorParallelSize?: number;
  pipelineParallelSize?: number;
  dtype?: "auto" | "float16" | "bfloat16" | "float32";
  maxModelLen?: number;
  gpuMemoryUtilization?: number;
  quantization?: string;
  loadFormat?: "auto" | "gguf" | "safetensors";
  apiKey?: string;
  servedModelName?: string;
  enforceEager?: boolean;
  maxNumSeqs?: number;
  trustRemoteCode?: boolean;
}

export interface ProcessEvent {
  type: "status" | "log" | "error";
  processId: string;
  timestamp: string;
  data: {
    status?: ProcessStatus;
    message?: string;
    stream?: "stdout" | "stderr";
  };
}

export interface ProcessListResponse {
  processes: VLLMProcess[];
}

export interface SpawnProcessRequest {
  modelId: string;
  config?: Partial<Omit<VLLMConfig, "port" | "host">>;
}

export interface ProcessLogsResponse {
  logs: string[];
  processId: string;
}
