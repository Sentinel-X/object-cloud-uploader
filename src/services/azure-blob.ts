import {
    BlobServiceClient,
    ContainerSASPermissions,
    RestError,
    SASProtocol,
    StorageSharedKeyCredential,
    generateBlobSASQueryParameters
} from '@azure/storage-blob';
import moment from 'moment';
import { DetectionAlreadyExists } from './exceptions';
import { CreateObjectParams, IBlobStorageService } from './blob-interface';

export default class BlobStorageService implements IBlobStorageService {
    private blobServiceClient: BlobServiceClient;
    private blobEndpoint: string;

    public constructor(connectionString: string) {
        if (!connectionString) {
            throw Error('Azure Storage connectionString not found');
        }

        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const azureConfig: { AccountName?: string; BlobEndpoint?: string; } = {};

        const connectionStringProps = connectionString.split(';');
        for (const connectionStringProp of connectionStringProps) {
            const key = connectionStringProp.split('=')[0];
            if (key == 'BlobEndpoint' || key == 'AccountName') {
                azureConfig[key] = connectionStringProp.split('=')[1];
            }
        }

        if (azureConfig.BlobEndpoint) {
            this.blobEndpoint = azureConfig.BlobEndpoint;
        } else if (azureConfig.AccountName) {
            this.blobEndpoint = `https://${azureConfig.AccountName}.blob.core.windows.net`;
        } else {
            throw new Error('Couldn\'t resolve blobEndpoint');
        }

    }

    /**
     * create object can either receiver a `fileBuffer` or `filePath` to upload a file to azure blob
     * @returns the blobUrl for the created objected
     */
    public async createObject({ containerName, objectName, fileBuffer, filePath, contentType, ignoreIfAlreadyExists, forceContainerCreation }: CreateObjectParams): Promise<string> {
        if (!ignoreIfAlreadyExists) {
            ignoreIfAlreadyExists = false;
        }

        try {
            const containerClient = this.blobServiceClient.getContainerClient(containerName);

            if (forceContainerCreation) {
                await containerClient.createIfNotExists();
            }

            const blobClient = containerClient.getBlockBlobClient(objectName);
            if (fileBuffer) {
                await blobClient.uploadData(fileBuffer, {
                    blobHTTPHeaders: { blobContentType: contentType },
                    conditions: {
                        ifNoneMatch: '*'
                    }
                });
            } else if (filePath) {
                await blobClient.uploadFile(filePath, {
                    blobHTTPHeaders: { blobContentType: contentType },
                    conditions: {
                        ifNoneMatch: '*'
                    }
                });
            }

            return `${this.blobEndpoint}/${containerName}/${objectName}`;
        } catch (err) {
            if (err instanceof RestError && err.code == 'BlobAlreadyExists') {
                if (ignoreIfAlreadyExists) {
                    return `${this.blobEndpoint}/${containerName}/${objectName}`;
                } else {
                    throw new DetectionAlreadyExists('Blob already uploaded.');
                }
            }
            throw err;
        }
    }

    public async createBucket(containerName: string, isPublic = false) {
        try {
            const containerClient = this.blobServiceClient.getContainerClient(containerName);
            await this.blobServiceClient.setProperties({
                cors: [{
                    allowedHeaders: '*',
                    allowedMethods: 'POST,PUT,GET,HEAD,DELETE,OPTIONS,MERGE,PATCH',
                    allowedOrigins: '*',
                    exposedHeaders: '*',
                    maxAgeInSeconds: 0
                }]
            });
            await containerClient.create({
                access: isPublic ? 'container' : undefined,
            });
        } catch (err) {
            if (err instanceof RestError && err.code == 'ContainerAlreadyExists') {
                return;
            }
            throw err;
        }
    }

    public async generateSasTokenForBlob(containerName: string, blobName: string, millisecondsDuration = moment.duration(5, 'minutes').asMilliseconds()) {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        const startsOn = new Date();

        let protocol = SASProtocol.Https;

        if (new URL(this.blobEndpoint).protocol === 'http:') {
            protocol = SASProtocol.HttpsAndHttp;
        }

        const sasToken = generateBlobSASQueryParameters({
            containerName,
            blobName,
            permissions: ContainerSASPermissions.parse('r'),
            startsOn: startsOn,
            expiresOn: new Date(startsOn.getTime() + millisecondsDuration),
            version: '2024-11-04',
            protocol,
        }, containerClient.credential as StorageSharedKeyCredential);

        return String(sasToken);
    }

    public getBlobName(blobUrl: string) {

        if (!blobUrl.startsWith(`${this.blobEndpoint}/`)) {
            throw new Error(`"${blobUrl}" is not a valid URL for "${this.blobEndpoint}".`);
        }

        const pathName = blobUrl.slice(this.blobEndpoint.length + 1);
        const firstSeparator = pathName.indexOf('/');

        return {
            blobName: pathName.slice(firstSeparator + 1),
            containerName: pathName.slice(0, firstSeparator)
        };
    }

    public async deleteBucket(containerName: string) {
        try {
            const containerClient = this.blobServiceClient.getContainerClient(containerName);
            await containerClient.delete();
        } catch (err) {
            if (err instanceof RestError && (err.code === 'ContainerNotFound' || err.statusCode === 404)) {
                return;
            }
            throw err;
        }
    }
}
