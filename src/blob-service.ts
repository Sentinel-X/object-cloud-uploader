import AWSBlobStorageService from './services/aws-blob';
import BlobStorageService from './services/azure-blob';
import { InvalidCloudType } from './services/exceptions';
import { CreateObjectParams, IBlobStorageService } from './services/blob-interface';

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

    public createObject(params: CreateObjectParams) {
        return this.service.createObject(params);
    }

    public createBucket(containerName: string, isPublic?: boolean) {
        return this.service.createBucket(containerName, isPublic);
    }

    public getBlobName(blobUrl: string) {
        return this.service.getBlobName(blobUrl);
    }

    public generateSasTokenForBlob(containerName: string, blobName: string, millisecondsDuration?: number) {
        return this.service.generateSasTokenForBlob(containerName, blobName, millisecondsDuration);
    }

    public async deleteBucket(containerName: string) {
        await this.service.deleteBucket(containerName);
    }
}
