import {
    S3Client,
    PutObjectCommand,
    CreateBucketCommand,
    GetObjectCommand,
    PutBucketCorsCommand,
    DeleteBucketCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    S3ServiceException,
    NoSuchBucket,
    HeadBucketCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFile } from 'fs/promises';
import moment from 'moment';
import { DetectionAlreadyExists } from './exceptions';
import { CreateObjectParams, IBlobStorageService } from './blob-interface';

export default class AWSBlobStorageService implements IBlobStorageService {
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
        forceContainerCreation,
        overwrite
    }: CreateObjectParams): Promise<string> {
        ignoreIfAlreadyExists = ignoreIfAlreadyExists ?? false;
        overwrite = overwrite ?? false;

        try {
            if (forceContainerCreation) {
                await this.ensureBucketExists(containerName);
            }

            const body = fileBuffer ?? (await readFile(filePath!));

            const command = new PutObjectCommand({
                Bucket: containerName,
                Key: objectName,
                Body: body,
                ContentType: contentType,
                // Same as Azure ifNoneMatch: '*'
                ...(overwrite ? {} : { IfNoneMatch: '*' }),
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

    private async ensureBucketExists(bucketName: string): Promise<void> {
        try {
            await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
        } catch (err) {
            if (err instanceof S3ServiceException && (err.name === 'NotFound' || err.$metadata.httpStatusCode === 404)) {
                await this.createBucket(bucketName);
            } else {
                throw err;
            }
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
            // a Bucket Policy separately, S3 does not expose a public ACL by default.
            if (isPublic) {
                console.warn(
                    'For public buckets in S3, configure a bucket policy separately.'
                );
            }
        } catch (err) {
            if (err instanceof S3ServiceException && (err?.name === 'BucketAlreadyOwnedByYou' || err?.name === 'BucketAlreadyExists')) {
                return;
            }
            throw err;
        }
    }

    public async generateSasTokenForBlob(containerName: string, blobName: string, millisecondsDuration = moment.duration(5, 'minutes').asMilliseconds()) {
        const command = new GetObjectCommand({
            Bucket: containerName,
            Key: blobName,
        });

        const signedUrl = await getSignedUrl(this.s3Client, command, {
            expiresIn: moment.duration(millisecondsDuration, 'milliseconds').asSeconds(),
        });

        return String(signedUrl.split('?')[1]);
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
            if (err instanceof NoSuchBucket) {
                return;
            }
            throw err;
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
        const keys = await this.getAllObjectKeys(containerName);

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
    }

}
