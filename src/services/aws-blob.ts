import {
    S3Client,
    PutObjectCommand,
    CreateBucketCommand,
    GetObjectCommand,
    PutBucketCorsCommand,
    DeleteBucketCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    S3ServiceException
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFile } from 'fs/promises';
import moment from 'moment';
import { DetectionAlreadyExists } from './exceptions';

type CreateObjectParamsBase = {
    containerName: string;
    objectName: string;
    contentType?: string;
    ignoreIfAlreadyExists?: boolean;
};

type CreateObjectParams =
    | (CreateObjectParamsBase & { fileBuffer: Buffer; filePath?: never; })
    | (CreateObjectParamsBase & { filePath: string; fileBuffer?: never; });

export default class AWSBlobStorageService {
    private s3Client: S3Client;
    private blobEndpoint: string;

    public constructor(config: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        endpoint?: string;
    }) {
        const { accessKeyId, secretAccessKey, region, endpoint } = config;

        if (!accessKeyId || !secretAccessKey || !region) {
            throw new Error('AWS credentials (accessKeyId, secretAccessKey, region) are required');
        }

        this.s3Client = new S3Client({
            region,
            credentials: { accessKeyId, secretAccessKey },
            ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
        });

        this.blobEndpoint = endpoint
            ? endpoint
            : `https://s3.${region}.amazonaws.com`;
    }

    /**
     * create object can either receive a `fileBuffer` or `filePath` to upload a file to S3
     * @returns the blobUrl for the created object
     */
    public async createObject({
        containerName,
        objectName,
        fileBuffer,
        filePath,
        contentType,
        ignoreIfAlreadyExists,
    }: CreateObjectParams) {
        ignoreIfAlreadyExists = ignoreIfAlreadyExists ?? false;

        try {
            const body = fileBuffer ?? (await readFile(filePath!));

            const command = new PutObjectCommand({
                Bucket: containerName,
                Key: objectName,
                Body: body,
                ContentType: contentType,
                // Same as Azure ifNoneMatch: '*'
                IfNoneMatch: '*',
            });

            await this.s3Client.send(command);
            return this.buildObjectUrl(containerName, objectName);
        } catch (err) {
            if (err instanceof S3ServiceException && err?.name === 'PreconditionFailed') {
                if (ignoreIfAlreadyExists) {
                    return this.buildObjectUrl(containerName, objectName);
                } else {
                    throw new DetectionAlreadyExists('Blob already uploaded.');
                }
            }
            throw err;
        }
    }

    public async createBucket(containerName: string, isPublic = false) {
        try {
            await this.s3Client.send(
                new CreateBucketCommand({ Bucket: containerName })
            );

            await this.s3Client.send(
                new PutBucketCorsCommand({
                    Bucket: containerName,
                    CORSConfiguration: {
                        CORSRules: [
                            {
                                AllowedHeaders: ['*'],
                                AllowedMethods: ['POST', 'PUT', 'GET', 'HEAD', 'DELETE'],
                                AllowedOrigins: ['*'],
                                ExposeHeaders: ['*'],
                                MaxAgeSeconds: 0,
                            },
                        ],
                    },
                })
            );

            // To make the bucket public, you also need to configure
            // a Bucket Policy separately, S3 does not expose a public ACL by defaultão.
            if (isPublic) {
                console.warn(
                    'For public buckets in S3, configure a bucket policy separately.'
                );
            }
        } catch (err) {
            if (err instanceof S3ServiceException && (err?.name === 'BucketAlreadyOwnedByYou' || err?.name === 'BucketAlreadyExists')) {
                return;
            }
            console.error(err);
            throw err;
        }
    }

    public async generateSasTokenForBlob(
        containerName: string,
        blobName: string,
        millisecondsDuration = moment.duration(5, 'minutes').asMilliseconds()
    ) {
        const command = new GetObjectCommand({
            Bucket: containerName,
            Key: blobName,
        });

        const signedUrl = await getSignedUrl(this.s3Client, command, {
            expiresIn: Math.floor(millisecondsDuration / 1000),
        });

        return signedUrl.split('?')[1];
    }

    public getBlobName(blobUrl: string) {
        const url = new URL(blobUrl);

        let containerName: string;
        let blobName: string;

        if (blobUrl.startsWith(this.blobEndpoint)) {
            // Path-style: https://s3.region.amazonaws.com/bucket/key
            const pathName = url.pathname.slice(1); // remove leading /
            const firstSeparator = pathName.indexOf('/');
            containerName = pathName.slice(0, firstSeparator);
            blobName = pathName.slice(firstSeparator + 1);
        } else {
            // Virtual-hosted-style: https://bucket.s3.region.amazonaws.com/key
            containerName = url.hostname.split('.')[0];
            blobName = url.pathname.slice(1);
        }

        return { blobName, containerName };
    }

    private buildObjectUrl(containerName: string, objectName: string) {
        if (this.blobEndpoint.includes('amazonaws.com')) {
            // Virtual-hosted-style URL (AWS pattern)
            const region = this.blobEndpoint.split('.')[1];
            return `https://${containerName}.s3.${region}.amazonaws.com/${objectName}`;
        }
        // Path-style for custom endpoints (LocalStack, MinIO, etc.)
        return `${this.blobEndpoint}/${containerName}/${objectName}`;
    }

    public async deleteBucket(containerName: string) {
        try {
            await this.deleteAllObjects(containerName);

            const command = new DeleteBucketCommand({ Bucket: containerName });
            await this.s3Client.send(command);
        } catch (err) {
            console.error(err);
        }
    }

    private async getAllObjectKeys(containerName: string) {
        let continuationToken = undefined;
        const allKeys = [];

        do {
            const listCommand: ListObjectsV2Command = new ListObjectsV2Command({
                Bucket: containerName,
                ContinuationToken: continuationToken,
            });

            const response = await this.s3Client.send(listCommand);

            if (response.Contents) {
                allKeys.push(...response.Contents.map(obj => ({ Key: obj.Key })));
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        return allKeys;
    }

    private async deleteAllObjects(containerName: string) {
        try {
            const keys = await this.getAllObjectKeys(containerName);

            if (keys.length === 0) {
                return;
            }

            const batchSize = 1000;
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);

                const deleteCommand = new DeleteObjectsCommand({
                    Bucket: containerName,
                    Delete: {
                        Objects: batch,
                    },
                });

                await this.s3Client.send(deleteCommand);
            }
        } catch (err) {
            console.error(err);
        }
    }

}

export function getAwsService(config?: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    endpoint?: string;
}) {
    if (!config) {
        if (!process.env.AWS_ACCESS_KEY_ID) {
            throw new Error('Missing AWS_ACCESS_KEY_ID environment variable');
        }

        if (!process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('Missing AWS_SECRET_ACCESS_KEY environment variable');
        }

        if (!process.env.AWS_ENDPOINT) {
            throw new Error('Missing AWS_ENDPOINT environment variable');
        }

        if (!process.env.AWS_REGION) {
            throw new Error('Missing AWS_REGION environment variable');
        }
    }

    return new AWSBlobStorageService(config || {
        region: process.env.AWS_REGION!,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        endpoint: process.env.AWS_ENDPOINT!
    });
}
