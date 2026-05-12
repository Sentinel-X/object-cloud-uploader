import moment from 'moment';
import AWSBlobStorageService from './services/aws-blob';
import BlobStorageService from './services/azure-blob';
import { DetectionAlreadyExists, InvalidCloudType } from './services/exceptions';
import { RestError } from '@azure/storage-blob';
import { S3ServiceException } from '@aws-sdk/client-s3';

export type BlobConfig = ({
    blobStorageType: 'aws';
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    containerName: string;
    endpoint?: string;
} | {
    blobStorageType: 'azure';
    connectionString: string;
});

export default class BlobService {
    private service: AWSBlobStorageService | BlobStorageService;
    private config: BlobConfig;

    public constructor(config: BlobConfig) {
        this.config = config;

        if (config.blobStorageType === 'aws') {
            this.service = new AWSBlobStorageService(config);
        } else if (config.blobStorageType === 'azure') {
            this.service = new BlobStorageService(config.connectionString);
        } else {
            throw new InvalidCloudType(`invalid_cloud_type`);
        }
    }

    private async uploadToAzure(objectName: string, blob: Buffer<ArrayBufferLike>) {
        const containerName = moment().format('YYYY-MM-DD');
        let imageUrl: string = '';
        try {
            imageUrl = await this.service.createObject({
                fileBuffer: blob,
                objectName: objectName,
                contentType: 'image/jpeg',
                containerName: containerName
            });
        } catch (err) {
            if (err instanceof DetectionAlreadyExists) {
                return imageUrl;
            } else if (err instanceof RestError && err.code == 'ContainerNotFound') {
                await this.service.createBucket(containerName);
                imageUrl = await this.service.createObject({
                    fileBuffer: blob,
                    objectName: objectName,
                    contentType: 'image/jpeg',
                    containerName: containerName
                });
            } else {
                throw err;
            }
        }
        return imageUrl;
    }

    private async uploadToAws(objectName: string, blob: Buffer<ArrayBufferLike>) {
        if (this.config.blobStorageType !== 'aws') {
            return;
        }

        let imageUrl: string = '';
        try {
            imageUrl = await this.service.createObject({
                objectName: objectName,
                fileBuffer: blob,
                contentType: 'image/jpeg',
                containerName: this.config.containerName
            });
        } catch (err) {
            if (err instanceof S3ServiceException && err?.name === 'PreconditionFailed') {
                return imageUrl;
            } else if (err instanceof S3ServiceException && err?.name === 'NoSuchBucket') {
                await this.service.createBucket(this.config.containerName);
                imageUrl = await this.service.createObject({
                    objectName: objectName,
                    fileBuffer: blob,
                    contentType: 'image/jpeg',
                    containerName: this.config.containerName,
                });
            } else {
                console.log(err);
                throw err;
            }
        }
        return imageUrl;
    }

    /**
     * Uploads an image to the configured cloud provider.
     * * This function is provider-agnostic and chooses between AWS or Azure based on the
     * `CLOUD_TYPE` environment variable. It automatically handles:
     * 1. Creating the bucket/container if it does not exist.
     * 2. Organizing folders by date (YYYY-MM-DD).
     * 3. Handling duplicates (ignores the file if it already exists).
     * * @param {string} objectName - The name/path the file will have in storage.
     * @param {Buffer<ArrayBufferLike>} blob - The buffer of the image to be uploaded.
     * @returns {Promise<string>} The public or private URL of the created object.
     */
    public async uploadImageToBlob(objectName: string, blob: Buffer<ArrayBufferLike>) {
        if (this.config.blobStorageType === 'azure') {
            return await this.uploadToAzure(objectName, blob);
        } else if (this.config.blobStorageType === 'aws') {
            return await this.uploadToAws(moment().format('YYYY-MM-DD') + '/' + objectName, blob);
        }
    }

    /**
     * Generates a temporary access token (SAS for Azure or Pre-signed URL for AWS)
     * for a specific object based on its URL.
     * * @param {string} storageType - The storage provider. Accepted values: ‘aws’ | ‘azure’.
     * @param {string} blobUrl - The full URL of the stored object.
     * @param {number} [millisecondsDuration=300000] - Token validity period in milliseconds (default: 5 minutes).
     * * @returns {Promise<string>} A string containing the token parameters (e.g., “sig=...&se=...”).
     */
    public async getSasTokenForBlob(
        storageType: string,
        blobUrl: string,
        millisecondsDuration: number = moment.duration(5, 'minutes').asMilliseconds(),
    ) {
        const { containerName, blobName } = this.service.getBlobName(blobUrl);
        if (this.config.blobStorageType === 'azure') {
            return this.service.generateSasTokenForBlob(containerName, blobName, millisecondsDuration);
        } else if (this.config.blobStorageType === 'aws') {
            return await this.service.generateSasTokenForBlob(containerName, blobName, millisecondsDuration);
        }
    }

    /**
     * Handle Bucket/Container deletion
     * @param containerName A Bucket (AWS) / Container (Azure) to be deleted
     */
    public async deleteBucket(containerName: string) {
        await this.service.deleteBucket(containerName);
    }
};
