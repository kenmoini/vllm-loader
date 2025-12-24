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
  type: "url" | "s3";
  url?: string;
  bucket?: string;
  key?: string;
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
