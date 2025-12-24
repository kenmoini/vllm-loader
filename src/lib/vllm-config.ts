import { VLLMConfig } from "@/types";

export function buildVLLMArgs(modelPath: string, config: VLLMConfig): string[] {
  const args: string[] = ["serve", modelPath];

  // Required arguments
  args.push("--port", config.port.toString());
  args.push("--host", config.host);

  // Optional tokenizer
  if (config.tokenizer) {
    args.push("--tokenizer", config.tokenizer);
  }

  if (config.tokenizerMode) {
    args.push("--tokenizer-mode", config.tokenizerMode);
  }

  // Parallelism
  if (config.tensorParallelSize && config.tensorParallelSize > 1) {
    args.push("--tensor-parallel-size", config.tensorParallelSize.toString());
  }

  if (config.pipelineParallelSize && config.pipelineParallelSize > 1) {
    args.push(
      "--pipeline-parallel-size",
      config.pipelineParallelSize.toString()
    );
  }

  // Data type
  if (config.dtype && config.dtype !== "auto") {
    args.push("--dtype", config.dtype);
  }

  // Memory settings
  if (config.maxModelLen) {
    args.push("--max-model-len", config.maxModelLen.toString());
  }

  if (
    config.gpuMemoryUtilization &&
    config.gpuMemoryUtilization > 0 &&
    config.gpuMemoryUtilization <= 1
  ) {
    args.push(
      "--gpu-memory-utilization",
      config.gpuMemoryUtilization.toString()
    );
  }

  // Quantization
  if (config.quantization) {
    args.push("--quantization", config.quantization);
  }

  if (config.loadFormat && config.loadFormat !== "auto") {
    args.push("--load-format", config.loadFormat);
  }

  // Server options
  if (config.apiKey) {
    args.push("--api-key", config.apiKey);
  }

  if (config.servedModelName) {
    args.push("--served-model-name", config.servedModelName);
  }

  // Advanced options
  if (config.enforceEager) {
    args.push("--enforce-eager");
  }

  if (config.maxNumSeqs) {
    args.push("--max-num-seqs", config.maxNumSeqs.toString());
  }

  if (config.trustRemoteCode) {
    args.push("--trust-remote-code");
  }

  return args;
}

export function getDefaultConfig(port: number): VLLMConfig {
  return {
    port,
    host: "127.0.0.1",
    dtype: "auto",
    gpuMemoryUtilization: 0.9,
    enforceEager: false,
    trustRemoteCode: false,
  };
}

export function validateConfig(config: Partial<VLLMConfig>): string[] {
  const errors: string[] = [];

  if (config.port !== undefined) {
    if (config.port < 1024 || config.port > 65535) {
      errors.push("Port must be between 1024 and 65535");
    }
  }

  if (config.gpuMemoryUtilization !== undefined) {
    if (config.gpuMemoryUtilization <= 0 || config.gpuMemoryUtilization > 1) {
      errors.push("GPU memory utilization must be between 0 and 1");
    }
  }

  if (config.tensorParallelSize !== undefined) {
    if (config.tensorParallelSize < 1) {
      errors.push("Tensor parallel size must be at least 1");
    }
  }

  if (config.maxModelLen !== undefined) {
    if (config.maxModelLen < 1) {
      errors.push("Max model length must be at least 1");
    }
  }

  if (config.maxNumSeqs !== undefined) {
    if (config.maxNumSeqs < 1) {
      errors.push("Max number of sequences must be at least 1");
    }
  }

  return errors;
}
