export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "error"
  | "cancelled";

export interface Download {
  id: string;
  name: string;
  filename: string;
  source: DownloadSource;
  status: DownloadStatus;
  progress: DownloadProgress;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface DownloadSource {
  type: "url" | "s3";
  url?: string;
  bucket?: string;
  key?: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  speed?: number;
  eta?: number;
}

export interface DownloadEvent {
  type: "progress" | "status" | "error" | "complete";
  downloadId: string;
  timestamp: string;
  data: {
    status?: DownloadStatus;
    progress?: DownloadProgress;
    error?: string;
    modelId?: string;
  };
}

export interface StartDownloadRequest {
  name: string;
  source: DownloadSource;
}

export interface DownloadListResponse {
  downloads: Download[];
}
