import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getConfig } from '@/lib/config-cache'
import { ValidationError, ExternalApiError } from '@/lib/errors'

/**
 * File storage abstraction.
 *
 * Two backends, selected by `storage.type` (config-cache) or `STORAGE_TYPE`
 * env var (env wins):
 *
 *   1. local — files saved under `${storage.localDir}` (default ./storage).
 *      Keys are sanitized to prevent path traversal; the on-disk path is
 *      `<dir>/<first2-of-key-hash>/<key>`. Atomic writes via `*.tmp` + rename.
 *
 *   2. s3 — files saved to an S3-compatible bucket (AWS S3, MinIO, R2,
 *      Backblaze B2, ...). Uses @aws-sdk/client-s3 (dynamically imported so
 *      the local backend doesn't require the SDK installed).
 *
 * Public API:
 *   - saveFile(key, buffer, opts) → location URI (e.g. "local://ab/file.bin")
 *   - readFile(key) → Buffer
 *   - deleteFile(key) → void
 *   - getSignedUrl(key, ttl) → string (local: data URL or /api/_storage route; s3: presigned GET URL)
 *   - validateFileType(buffer, allowedTypes) → boolean
 *
 * Magic-number validation is keyed off a small built-in signature table for
 * common browser / image / archive types. Callers pass `allowedTypes` as an
 * array of mime-style strings (e.g. ['png', 'jpeg', 'pdf', 'zip']).
 */

// ---------------- Magic-number table ----------------
interface MagicSignature {
  /** Offset to inspect. */
  offset: number
  /** Expected bytes at that offset. */
  bytes: number[]
  /** Filetype name returned by `detectFileType`. */
  type: string
  /** Mime type, when known. */
  mime: string
}

const SIGNATURES: MagicSignature[] = [
  // Images
  { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47], type: 'png', mime: 'image/png' },
  { offset: 0, bytes: [0xff, 0xd8, 0xff], type: 'jpeg', mime: 'image/jpeg' },
  { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38], type: 'gif', mime: 'image/gif' },
  { offset: 0, bytes: [0x42, 0x4d], type: 'bmp', mime: 'image/bmp' },
  { offset: 0, bytes: [0x57, 0x45, 0x42, 0x50], type: 'webp', mime: 'image/webp' },
  // Documents
  { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], type: 'pdf', mime: 'application/pdf' },
  // Archives
  { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04], type: 'zip', mime: 'application/zip' },
  { offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06], type: 'zip', mime: 'application/zip' }, // empty zip
  { offset: 0, bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], type: 'rar', mime: 'application/vnd.rar' },
  { offset: 0, bytes: [0x1f, 0x8b], type: 'gzip', mime: 'application/gzip' },
  { offset: 257, bytes: [0x75, 0x73, 0x74, 0x61, 0x72], type: 'tar', mime: 'application/x-tar' },
  // 7z
  { offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], type: '7z', mime: 'application/x-7z-compressed' },
  // Browser profile snapshots might be tarballs — covered by tar/gzip above
]

export interface DetectedType {
  type: string
  mime: string
}

/** Detect a file's type from its magic-number. Returns null if unknown. */
export function detectFileType(buffer: Buffer): DetectedType | null {
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.offset + sig.bytes.length) continue
    let match = true
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) {
        match = false
        break
      }
    }
    if (match) return { type: sig.type, mime: sig.mime }
  }
  return null
}

/**
 * Validate the buffer's magic-number against `allowedTypes`.
 * Throws ValidationError on mismatch.
 */
export function validateFileType(buffer: Buffer, allowedTypes: string[]): DetectedType {
  if (!Buffer.isBuffer(buffer)) {
    throw new ValidationError('文件内容无效', { code: 'VALIDATION_FAILED' })
  }
  const detected = detectFileType(buffer)
  if (!detected) {
    throw new ValidationError('无法识别文件类型', {
      code: 'VALIDATION_FAILED',
      data: { allowedTypes },
    })
  }
  if (!allowedTypes.includes(detected.type)) {
    throw new ValidationError(`不允许上传 ${detected.type} 类型文件`, {
      code: 'VALIDATION_FAILED',
      data: { detected: detected.type, allowedTypes },
    })
  }
  return detected
}

// ---------------- Backend selection ----------------
export type StorageBackend = 'local' | 's3'

async function getBackend(): Promise<StorageBackend> {
  const t = (await getConfig<string>('storage.type', 'local')) ?? 'local'
  return t === 's3' ? 's3' : 'local'
}

// ---------------- Key sanitisation ----------------
/**
 * Sanitize a storage key into a filesystem-safe relative path.
 *   - Disallows `..`, absolute paths, backslashes
 *   - Allows alphanumerics, dashes, underscores, slashes
 *   - Caps total length at 256 chars
 */
export function sanitizeKey(key: string): string {
  if (!key || typeof key !== 'string') {
    throw new ValidationError('存储 key 不能为空', { code: 'VALIDATION_FAILED' })
  }
  // Replace backslashes with forward slashes
  const norm = key.replace(/\\/g, '/').replace(/^\/+/, '')
  // Allow only safe chars
  if (!/^[A-Za-z0-9._\-/]+$/.test(norm)) {
    throw new ValidationError(`非法的存储 key: ${key}`, { code: 'VALIDATION_FAILED' })
  }
  // Reject path traversal
  const parts = norm.split('/')
  if (parts.some((p) => p === '..' || p === '.')) {
    throw new ValidationError('存储 key 含非法路径片段', { code: 'VALIDATION_FAILED' })
  }
  if (norm.length > 256) {
    throw new ValidationError('存储 key 过长（>256）', { code: 'VALIDATION_FAILED' })
  }
  return norm
}

function shardedPath(key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  return path.join(hash.slice(0, 2), hash.slice(2, 4), key)
}

// ---------------- Public API ----------------
export interface SaveFileOpts {
  /** If provided, validates the buffer's magic-number against this list. */
  allowedTypes?: string[]
  /** Content-Type for S3 metadata. */
  contentType?: string
  /** Whether the object should be public-readable on S3. Default false. */
  public?: boolean
  /** Optional metadata to attach. */
  metadata?: Record<string, string>
}

export interface SaveFileResult {
  key: string
  location: string
  backend: StorageBackend
  size: number
  contentType?: string
}

export async function saveFile(key: string, buffer: Buffer, opts: SaveFileOpts = {}): Promise<SaveFileResult> {
  if (!Buffer.isBuffer(buffer)) {
    throw new ValidationError('buffer 参数必须是 Buffer', { code: 'VALIDATION_FAILED' })
  }
  const safeKey = sanitizeKey(key)

  // Magic-number validation
  let detectedType: DetectedType | null = null
  if (opts.allowedTypes && opts.allowedTypes.length > 0) {
    detectedType = validateFileType(buffer, opts.allowedTypes)
  } else {
    detectedType = detectFileType(buffer)
  }
  const contentType = opts.contentType ?? detectedType?.mime ?? 'application/octet-stream'

  const backend = await getBackend()
  if (backend === 's3') {
    return saveToS3(safeKey, buffer, { ...opts, contentType })
  }
  return saveToLocal(safeKey, buffer, { ...opts, contentType })
}

export async function readFile(key: string): Promise<Buffer> {
  const safeKey = sanitizeKey(key)
  const backend = await getBackend()
  if (backend === 's3') {
    return readFromS3(safeKey)
  }
  return readFromLocal(safeKey)
}

export async function deleteFile(key: string): Promise<void> {
  const safeKey = sanitizeKey(key)
  const backend = await getBackend()
  if (backend === 's3') {
    await deleteFromS3(safeKey)
    return
  }
  await deleteFromLocal(safeKey)
}

/**
 * Returns a URL the client can use to fetch the object.
 *   - local: a data URL (small files) or a `/api/_storage/<key>` route URL
 *     (the actual file is served by a dedicated handler).
 *   - s3: a presigned GET URL valid for `ttl` seconds.
 */
export async function getSignedUrl(key: string, ttlSeconds = 300): Promise<string> {
  const safeKey = sanitizeKey(key)
  const backend = await getBackend()
  if (backend === 's3') {
    return presignS3(safeKey, ttlSeconds)
  }
  // Local backend: short signed URL pointing at the storage handler route.
  // The handler is expected to live at /api/_storage/[...key] and verify the
  // signature before serving bytes.
  const expires = Math.floor(Date.now() / 1000) + Math.max(60, Math.min(ttlSeconds, 86400))
  const secret = process.env.FILE_STORAGE_SIGNING_KEY || process.env.JWT_SECRET || 'dev-storage-signing-key'
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${safeKey}|${expires}`)
    .digest('hex')
  const params = new URLSearchParams({ k: safeKey, expires: String(expires), sig })
  return `/api/_storage?${params.toString()}`
}

// ---------------- Local backend ----------------
async function getLocalDir(): Promise<string> {
  const dir = (await getConfig<string>('storage.localDir', './storage')) ?? './storage'
  const abs = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
  await fs.promises.mkdir(abs, { recursive: true })
  return abs
}

async function saveToLocal(key: string, buffer: Buffer, opts: SaveFileOpts & { contentType: string }): Promise<SaveFileResult> {
  const baseDir = await getLocalDir()
  const rel = shardedPath(key)
  const fullPath = path.join(baseDir, rel)
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })
  // Atomic write: temp file + rename
  const tmp = `${fullPath}.tmp.${process.pid}.${Date.now()}`
  await fs.promises.writeFile(tmp, buffer)
  await fs.promises.rename(tmp, fullPath)
  // Sidecar metadata file for content-type
  await fs.promises.writeFile(`${fullPath}.meta.json`, JSON.stringify({ contentType: opts.contentType, metadata: opts.metadata ?? {} })).catch(() => {})
  return {
    key,
    location: `local://${rel}`,
    backend: 'local',
    size: buffer.byteLength,
    contentType: opts.contentType,
  }
}

async function readFromLocal(key: string): Promise<Buffer> {
  const baseDir = await getLocalDir()
  const fullPath = path.join(baseDir, shardedPath(key))
  try {
    return await fs.promises.readFile(fullPath)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      throw new ValidationError('文件不存在', { code: 'NOT_FOUND', httpStatus: 404 })
    }
    throw new ExternalApiError(`本地存储读取失败：${err.message}`, { upstream: 'local-storage', cause: e })
  }
}

async function deleteFromLocal(key: string): Promise<void> {
  const baseDir = await getLocalDir()
  const fullPath = path.join(baseDir, shardedPath(key))
  await fs.promises.rm(fullPath, { force: true }).catch(() => {})
  await fs.promises.rm(`${fullPath}.meta.json`, { force: true }).catch(() => {})
}

// ---------------- S3 backend (dynamic import) ----------------
interface S3Config {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
}

async function getS3Config(): Promise<S3Config> {
  const endpoint = (await getConfig<string>('storage.s3Endpoint')) ?? ''
  const bucket = (await getConfig<string>('storage.s3Bucket')) ?? ''
  const region = (await getConfig<string>('storage.s3Region', 'us-east-1')) ?? 'us-east-1'
  const accessKeyId = (await getConfig<string>('storage.s3AccessKeyId')) ?? ''
  const secretAccessKey = (await getConfig<string>('storage.s3SecretAccessKey')) ?? ''
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new ExternalApiError('S3 存储配置不完整（endpoint/bucket/credentials）', {
      upstream: 's3-storage',
      code: 'EXTERNAL_API_UNAVAILABLE',
      httpStatus: 503,
    })
  }
  // MinIO / R2 / B2 / etc. typically require path-style addressing.
  const forcePathStyle = !endpoint.includes('amazonaws.com')
  return { endpoint, bucket, region, accessKeyId, secretAccessKey, forcePathStyle }
}

// Cache the imported S3 client module so we don't re-import on every call.
// The S3 SDK is an optional peer dependency; when not installed the local
// backend is used instead. We type the bundle loosely with structural
// minimal interfaces so the call sites stay type-checked.
interface S3Cmds {
  PutObjectCommand: { new (input: Record<string, unknown>): unknown }
  GetObjectCommand: { new (input: Record<string, unknown>): unknown }
  DeleteObjectCommand: { new (input: Record<string, unknown>): unknown }
}
interface S3ClientLike {
  send(cmd: unknown): Promise<unknown>
}
interface S3Bundle {
  client: S3ClientLike
  cmds: S3Cmds & { getSignedUrl: (client: S3ClientLike, cmd: unknown, opts: { expiresIn: number }) => Promise<string> }
}

let s3Bundle: S3Bundle | null = null
let s3BundleError: unknown = null

async function getS3Client(): Promise<S3Bundle> {
  if (s3Bundle) return s3Bundle
  if (s3BundleError) throw s3BundleError
  try {
    const cfg = await getS3Config()
    // The S3 SDK is an optional peer dependency — we don't want to crash the
    // Next.js server when it's not installed (the local backend is the
    // default). Use a variable-based dynamic import so Turbopack/webpack
    // cannot statically resolve it (which would cause "Module not found").
    const s3Module = '@aws-sdk/client-s3'
    const presignModule = '@aws-sdk/s3-request-presigner'
    const mod = await import(/* @vite-ignore */ s3Module).catch(() => null)
    if (!mod) throw new Error('S3 SDK not installed')
    const client = new mod.S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
    const presignMod = await import(/* @vite-ignore */ presignModule).catch(() => null)
    s3Bundle = {
      client: client as unknown as S3ClientLike,
      cmds: {
        PutObjectCommand: mod.PutObjectCommand,
        GetObjectCommand: mod.GetObjectCommand,
        DeleteObjectCommand: mod.DeleteObjectCommand,
        getSignedUrl: presignMod ? presignMod.getSignedUrl : undefined,
      } as unknown as S3Bundle['cmds'],
    }
    return s3Bundle
  } catch (e) {
    s3BundleError = e
    console.error('[file-storage] @aws-sdk/client-s3 not available', e)
    throw new ExternalApiError(
      'S3 客户端未安装（@aws-sdk/client-s3），无法使用 s3 存储后端',
      { upstream: 's3-storage', code: 'EXTERNAL_API_UNAVAILABLE', httpStatus: 503, cause: e },
    )
  }
}

async function saveToS3(key: string, buffer: Buffer, opts: SaveFileOpts & { contentType: string }): Promise<SaveFileResult> {
  const bundle = await getS3Client()
  const cfg = await getS3Config()
  await bundle.client.send(
    new bundle.cmds.PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: opts.contentType,
      Metadata: opts.metadata,
      ...(opts.public ? { ACL: 'public-read' } : {}),
    }),
  )
  return {
    key,
    location: `s3://${cfg.bucket}/${key}`,
    backend: 's3',
    size: buffer.byteLength,
    contentType: opts.contentType,
  }
}

async function readFromS3(key: string): Promise<Buffer> {
  const bundle = await getS3Client()
  const cfg = await getS3Config()
  const out = (await bundle.client.send(
    new bundle.cmds.GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
  )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } & AsyncIterable<Buffer> }
  const body = out.Body
  if (!body) throw new ExternalApiError('S3 对象为空', { upstream: 's3-storage', httpStatus: 404, code: 'NOT_FOUND' })
  // transformToByteArray is the modern way; fall back to streaming chunks.
  if (typeof body.transformToByteArray === 'function') {
    const arr = await body.transformToByteArray()
    return Buffer.from(arr)
  }
  // Fallback: collect stream chunks
  const chunks: Buffer[] = []
  for await (const c of body as AsyncIterable<Buffer>) chunks.push(c)
  return Buffer.concat(chunks)
}

async function deleteFromS3(key: string): Promise<void> {
  const bundle = await getS3Client()
  const cfg = await getS3Config()
  await bundle.client.send(
    new bundle.cmds.DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
  )
}

async function presignS3(key: string, ttlSeconds: number): Promise<string> {
  const bundle = await getS3Client()
  const cfg = await getS3Config()
  const url = await bundle.cmds.getSignedUrl(
    bundle.client,
    new bundle.cmds.GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: Math.max(60, Math.min(ttlSeconds, 86400)) },
  )
  return url
}

/** Test-only: reset the cached S3 bundle. */
export function _resetStorageForTest(): void {
  s3Bundle = null
  s3BundleError = null
}
