// lib/storageUrl.ts
export function publicStorageUrl(bucket: string, path: string) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
