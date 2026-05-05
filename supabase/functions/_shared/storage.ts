const STORAGE_PHOTO_REF_PREFIX = "supabase-storage://";
const REPORT_PHOTOS_BUCKET = "report-photos";

export type StoragePhotoRef = {
  bucket: string;
  path: string;
};

type SignedUrlResult =
  | { ok: true; urls: string[] }
  | { ok: false; message: string; details?: unknown };

type StorageBucketClient = {
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
};

type StorageClient = {
  from: (bucket: string) => StorageBucketClient;
};

type SupabaseStorageClient = {
  storage: StorageClient;
};

export function parsePhotoStoragePath(value: string): StoragePhotoRef | null {
  const pathValue = value.startsWith(STORAGE_PHOTO_REF_PREFIX)
    ? value.slice(STORAGE_PHOTO_REF_PREFIX.length)
    : value;
  const separatorIndex = pathValue.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === pathValue.length - 1) {
    return null;
  }
  return {
    bucket: pathValue.slice(0, separatorIndex),
    path: pathValue.slice(separatorIndex + 1),
  };
}

export function makeStoragePhotoRef(ref: StoragePhotoRef): string {
  return `${STORAGE_PHOTO_REF_PREFIX}${ref.bucket}/${ref.path}`;
}

function isAllowedReportPhoto(ref: StoragePhotoRef, userId: string): boolean {
  return ref.bucket === REPORT_PHOTOS_BUCKET && ref.path.startsWith(`${userId}/`);
}

export async function createSignedPhotoUrls(
  supabase: SupabaseStorageClient,
  photoStoragePaths: string[],
  userId: string,
): Promise<SignedUrlResult> {
  const urls: string[] = [];

  for (const photoStoragePath of photoStoragePaths) {
    const ref = parsePhotoStoragePath(photoStoragePath);
    if (ref === null || !isAllowedReportPhoto(ref, userId)) {
      return {
        ok: false,
        message: "Photo storage path is invalid or outside the authenticated user scope.",
        details: { photoStoragePath },
      };
    }

    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, 10 * 60);
    if (error !== null || data === null) {
      return {
        ok: false,
        message: error?.message ?? "Could not create a signed photo URL.",
        details: { bucket: ref.bucket, path: ref.path },
      };
    }
    urls.push(data.signedUrl);
  }

  return { ok: true, urls };
}
