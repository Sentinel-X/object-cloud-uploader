import AWSBlobStorageService from './services/aws-blob';
import BlobStorageService from './services/azure-blob';
import { InvalidCloudType } from './services/exceptions';
import { CreateObjectParams, IBlobStorageService } from './services/blob-interface';
import { NoSuchBucket } from '@aws-sdk/client-s3';

export type BlobConfig = ({
    blobStorageType: 'aws';
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
} | {
    blobStorageType: 'azure';
    connectionString: string;
});

export default class BlobService {
    private service: IBlobStorageService;

    /**
     * Creates a new BlobService instance configured for the specified cloud provider.
     * @param {BlobConfig} config - Configuration object for the storage provider.
     * For AWS: `{ blobStorageType: 'aws', region, accessKeyId, secretAccessKey, endpoint? }`
     * For Azure: `{ blobStorageType: 'azure', connectionString }`
     * @throws {InvalidCloudType} If `blobStorageType` is not `'aws'` or `'azure'`.
     */
    public constructor(config: BlobConfig) {
        if (config.blobStorageType === 'aws') {
            this.service = new AWSBlobStorageService(config);
        } else if (config.blobStorageType === 'azure') {
            this.service = new BlobStorageService(config.connectionString);
        } else {
            throw new InvalidCloudType(`invalid_cloud_type`);
        }
    }

    /**
     * Uploads an object to storage. Accepts either a `fileBuffer` or a `filePath`.
     * @param {CreateObjectParams} params - Parameters for object creation.
     * @throws {DetectionAlreadyExists} If the object already exists and `ignoreIfAlreadyExists` is `false`.
     * @returns The URL of the uploaded object.
     */
    public createObject(params: CreateObjectParams) {
        return this.service.createObject(params);
    }

    /**
     * Creates a bucket (AWS) or container (Azure).
     * Silently ignores the operation if it already exists.
     * @param containerName - Name of the bucket or container.
     * @param isPublic - Whether to allow public read access. Defaults to `false`.
     */
    public createBucket(containerName: string, isPublic?: boolean) {
        return this.service.createBucket(containerName, isPublic);
    }

    /**
     * Extracts the container/bucket name and blob/object name from a full storage URL.
     * @param {string} blobUrl - The full URL of the stored object.
     * @throws {Error} If the URL does not match the configured endpoint (Azure).
     */
    public getBlobName(blobUrl: string) {
        return this.service.getBlobName(blobUrl);
    }

    /**
     * Generates a temporary access token for a stored object.
     * Returns a SAS token for Azure or a pre-signed URL query string for AWS.
     * @param containerName - Bucket or container where the object is stored.
     * @param blobName - Key/path of the object in storage.
     * @param millisecondsDuration - Token validity in milliseconds. Defaults to 5 minutes.
     */
    public generateSasTokenForBlob(containerName: string, blobName: string, millisecondsDuration?: number) {
        return this.service.generateSasTokenForBlob(containerName, blobName, millisecondsDuration);
    }

    /**
     * Deletes a bucket (AWS) or container (Azure) and all its contents.
     * Silently ignores the operation if it does not exist.
     * @param {string} containerName - Name of the bucket or container to delete.
     */
    public async deleteBucket(containerName: string) {
        try {
            await this.service.deleteBucket(containerName);
        } catch (err) {
            if (err instanceof NoSuchBucket) {
                return;
            }
            throw err;
        }
    }
}
