/**
 * Base parameters shared across all object creation operations.
 */
type CreateObjectParamsBase = {
    /** Bucket (AWS) or Container (Azure) where the object will be stored. */
    containerName: string;
    /** The key/path the object will have in storage. */
    objectName: string;
    /** MIME type of the file (e.g. `'image/jpeg'`). */
    contentType?: string;
    /**
     * If `true`, silently returns the existing object URL instead of throwing
     * `DetectionAlreadyExists` when the object already exists.
     * @default false
     */
    ignoreIfAlreadyExists?: boolean;
    /**
     * If `true`, automatically creates the bucket/container when it does not exist
     * and retries the upload. If `false` and the bucket/container is missing, throws.
     * @default false
     */
    forceContainerCreation?: boolean;
};

/**
 * Parameters for `createObject`. Provide either `fileBuffer` or `filePath` — not both.
 */
export type CreateObjectParams =
    | (CreateObjectParamsBase & { fileBuffer: Buffer; filePath?: never; })
    | (CreateObjectParamsBase & { filePath: string; fileBuffer?: never; });

/**
 * Common interface implemented by all blob storage service providers (AWS, Azure, etc.).
 * `BlobService` delegates all operations to a concrete implementation of this interface.
 */
export interface IBlobStorageService {
    /**
     * Uploads an object to storage. Accepts either a `fileBuffer` or a `filePath`.
     * @throws {DetectionAlreadyExists} If the object already exists and `ignoreIfAlreadyExists` is `false`.
     * @returns The URL of the uploaded object.
     */
    createObject(params: CreateObjectParams): Promise<string>;

    /**
     * Creates a bucket (AWS) or container (Azure).
     * Silently ignores the operation if it already exists.
     * @param containerName - Name of the bucket or container.
     * @param isPublic - Whether to allow public read access. Defaults to `false`.
     */
    createBucket(containerName: string, isPublic?: boolean): Promise<void>;

    /**
     * Generates a temporary access token for a stored object.
     * Returns a SAS token for Azure or a pre-signed URL query string for AWS.
     * @param containerName - Bucket or container where the object is stored.
     * @param blobName - Key/path of the object in storage.
     * @param millisecondsDuration - Token validity in milliseconds. Defaults to 5 minutes.
     */
    generateSasTokenForBlob(containerName: string, blobName: string, millisecondsDuration?: number): unknown;

    /**
     * Extracts the container/bucket name and blob/object name from a full storage URL.
     * @throws {Error} If the URL does not match the configured endpoint (Azure).
     */
    getBlobName(blobUrl: string): { blobName: string; containerName: string; };

    /**
     * Deletes a bucket (AWS) or container (Azure) and all its contents.
     * Silently ignores the operation if it does not exist.
     */
    deleteBucket(containerName: string): Promise<void>;
}
