import { apiClient } from "@/lib/api/client";

// Cliente tipado do módulo SOPHIIA (Portal do Servidor + Studio do
// Instrutor). Todos os caminhos passam pelo proxy BFF (/api/backend/*).

export interface SophiiaSystem {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
}

export interface SophiiaCourse {
  id: string;
  system_id: string;
  title: string;
  description: string;
  is_active: boolean;
  current_version_id?: string | null;
  workload_hours?: number;
}

export type VideoStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";

export interface OutlineLesson {
  id: string;
  title: string;
  is_mandatory: boolean;
  order_index: number;
  has_video: boolean;
  video_status?: VideoStatus;
  hls_master_key?: string;
  completed: boolean;
}

export interface OutlineModule {
  id: string;
  title: string;
  order_index: number;
  lessons: OutlineLesson[] | null;
}

export interface CourseOutline {
  course_version_id: string;
  modules: OutlineModule[] | null;
}

export interface ProgressResult {
  course_version_id: string;
  completed_mandatory_lessons: number;
  total_mandatory_lessons: number;
  progress_percentage: number;
  is_completed: boolean;
  certificate_queued: boolean;
}

export interface SophiiaCertificate {
  id: string;
  validation_token: string;
  course_title_snapshot: string;
  version_tag_snapshot: string;
  workload_hours_snapshot: number;
  status: "VALID" | "REVOKED";
  issued_at: string;
}

export interface UploadTicket {
  video_asset_id: string;
  upload_url: string;
  bucket: string;
  object_key: string;
  expires_in_seconds: number;
}

const base = "v1/sophiia";

export const sophiiaApi = {
  listSystems: () =>
    apiClient.get<SophiiaSystem[]>(`${base}/portal/catalog/systems`).then((r) => r.data ?? []),

  listCourses: (systemId: string) =>
    apiClient
      .get<SophiiaCourse[]>(
        `${base}/portal/catalog/courses?system_id=${encodeURIComponent(systemId)}`,
      )
      .then((r) => r.data ?? []),

  courseOutline: (versionId: string) =>
    apiClient.get<CourseOutline>(`${base}/portal/courses/${versionId}/outline`).then((r) => r.data),

  heartbeat: (courseVersionId: string, lessonId: string, positionSeconds: number) =>
    apiClient.post(`${base}/portal/progress/heartbeat`, {
      course_version_id: courseVersionId,
      lesson_id: lessonId,
      position_seconds: Math.max(0, Math.round(positionSeconds)),
    }),

  completeLesson: (lessonId: string) =>
    apiClient
      .post<ProgressResult>(`${base}/portal/lessons/${lessonId}/complete`)
      .then((r) => r.data),

  listCertificates: () =>
    apiClient.get<SophiiaCertificate[]>(`${base}/portal/certificates`).then((r) => r.data ?? []),

  certificateDownloadHref: (certId: string) =>
    `/api/backend/${base}/portal/certificates/${certId}/download`,

  createUploadUrl: (lessonId: string) =>
    apiClient
      .post<UploadTicket>(`${base}/admin/lessons/${lessonId}/upload-url`)
      .then((r) => r.data),

  confirmUpload: (videoAssetId: string) =>
    apiClient.post(`${base}/admin/video-assets/${videoAssetId}/confirm`),

  getLessonVideo: (lessonId: string) =>
    apiClient.get<VideoAsset>(`${base}/admin/lessons/${lessonId}/video`).then((r) => r.data),

  // --- Edição do catálogo (Studio, exige a role sophiia-instructor) ---
  createSystem: (body: { code: string; name: string; description?: string }) =>
    apiClient.post<{ id: string }>(`${base}/admin/systems`, body).then((r) => r.data),

  createCourse: (systemId: string, body: { title: string; description?: string }) =>
    apiClient
      .post<{ id: string }>(`${base}/admin/systems/${systemId}/courses`, body)
      .then((r) => r.data),

  createVersion: (courseId: string, body: { version_tag: string; workload_hours: number }) =>
    apiClient
      .post<{ id: string }>(`${base}/admin/courses/${courseId}/versions`, body)
      .then((r) => r.data),

  createModule: (versionId: string, body: { title: string; order_index: number }) =>
    apiClient
      .post<{ id: string }>(`${base}/admin/versions/${versionId}/modules`, body)
      .then((r) => r.data),

  createLesson: (
    moduleId: string,
    body: { title: string; is_mandatory: boolean; order_index: number; markdown_content?: string },
  ) =>
    apiClient
      .post<{ id: string }>(`${base}/admin/modules/${moduleId}/lessons`, body)
      .then((r) => r.data),

  publishVersion: (versionId: string) =>
    apiClient.post(`${base}/admin/versions/${versionId}/publish`),
};

export interface VideoAsset {
  id: string;
  lesson_id: string;
  status: VideoStatus;
  hls_master_key: string;
  duration_seconds: number;
  progress_percent: number;
  error_message?: string;
}

// putToPresignedUrl envia o arquivo direto ao MinIO com relatório de
// progresso (XHR, já que fetch() não expõe upload progress).
export function putToPresignedUrl(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`upload falhou: HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("erro de rede no upload"));
    xhr.send(file);
  });
}

// hlsMasterUrl monta a URL pública do master.m3u8 no MinIO (prefixo hls/
// tem leitura anônima — ver storage.EnsureHLSPublicRead).
export function hlsMasterUrl(hlsMasterKey: string): string {
  const minio = process.env.NEXT_PUBLIC_MINIO_URL || "http://localhost:9002";
  const bucket = process.env.NEXT_PUBLIC_MINIO_BUCKET || "sophiia";
  return `${minio.replace(/\/$/, "")}/${bucket}/${hlsMasterKey.replace(/^\//, "")}`;
}
