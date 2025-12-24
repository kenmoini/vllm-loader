export interface Model {
  id: string;
  name: string;
  filename: string;
  path: string;
  size: number;
  downloadedAt: string;
  source: ModelSource;
  checksum?: string;
}

export interface ModelSource {
  type: "url" | "s3" | "huggingface";
  url?: string;
  bucket?: string;
  key?: string;
  // Hugging Face specific
  repoId?: string;
  filename?: string;
  revision?: string;
}

export interface ModelListResponse {
  models: Model[];
}

export interface ModelCreateRequest {
  name: string;
  filename: string;
  path: string;
  size: number;
  source: ModelSource;
  checksum?: string;
}
