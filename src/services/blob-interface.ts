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
    /**
     * If `true`, the object will replace another object if already exists
     * @default false
     */
    overwrite?: boolean;
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
    createObject(params: CreateObjectParams): Promise<string>;
    createBucket(containerName: string, isPublic?: boolean): Promise<void>;
    generateSasTokenForBlob(containerName: string, blobName: string, millisecondsDuration?: number): Promise<string>;
    getBlobName(blobUrl: string): { blobName: string; containerName: string; };
    generateBlobUrl(params: { containerName: string; objectName: string; }): string;
    deleteBucket(containerName: string): Promise<void>;
    deleteObject(containerName: string, objectName: string): Promise<void>;
}
