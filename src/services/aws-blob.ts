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
    DeleteObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import moment from 'moment';
import { DetectionAlreadyExists } from './exceptions';
import { CreateObjectParams, IBlobStorageService } from './blob-interface';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';

export default class AWSBlobStorageService implements IBlobStorageService {
    private s3Client: S3Client;
    public readonly blobEndpoint: string;

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
            requestHandler: {
                connectionTimeout: 10000,
                socketTimeout: 300000,
            },
        });

        this.blobEndpoint = endpoint
            ? endpoint
            : `https://s3.${region}.amazonaws.com`;
    }

    /**
     * create object can either receive a `fileBuffer` or `filePath` to upload a file to S3
     * @returns the blobUrl for the created object
     */
    public async createObject(params: CreateObjectParams): Promise<string> {
        const ignoreIfAlreadyExists = params.ignoreIfAlreadyExists ?? false;
        const overwrite = params.overwrite ?? false;

        try {
            if (params.filePath !== undefined) {
                const stream = createReadStream(params.filePath);

                const upload = new Upload({
                    client: this.s3Client,
                    params: {
                        Bucket: params.containerName,
                        Key: params.objectName,
                        Body: stream,
                        ContentType: params.contentType,
                        ContentDisposition: params.contentDisposition,
                        ...(overwrite ? {} : { IfNoneMatch: '*' }),
                    },
                    queueSize: 4,
                    partSize: 8 * 1024 * 1024,
                    leavePartsOnError: false,
                });

                await upload.done();
            } else if (params.copyFromUrl !== undefined) {
                params.maxMemoryUse = (params.maxMemoryUse ?? 8) * 1024 * 1024;
                const response = await fetch(params.copyFromUrl);
                const size = Number(response.headers.get('content-length') ?? 0);
                const originalContentDisposition = response.headers.get('content-disposition');
                const originalContentType = response.headers.get('content-type');

                params.contentType = params.contentType ?? originalContentType ?? undefined;
                params.contentDisposition = params.contentDisposition ?? originalContentDisposition ?? undefined;

                if (size > params.maxMemoryUse) {
                    const tempFile = `/tmp/${randomUUID()}`;
                    await pipeline(
                        response.body!,
                        createWriteStream(tempFile),
                    );

                    const stream = createReadStream(tempFile);

                    const upload = new Upload({
                        client: this.s3Client,
                        params: {
                            Bucket: params.containerName,
                            Key: params.objectName,
                            Body: stream,
                            ContentType: params.contentType,
                            ContentDisposition: params.contentDisposition,
                            ...(overwrite ? {} : { IfNoneMatch: '*' }),
                        },
                        queueSize: 1,
                        partSize: params.maxMemoryUse,
                        leavePartsOnError: false,
                    });

                    await upload.done();
                    await unlink(tempFile);

                } else {
                    const buffer = Buffer.from(
                        await response.arrayBuffer(),
                    );

                    const command = new PutObjectCommand({
                        Bucket: params.containerName,
                        Key: params.objectName,
                        Body: buffer,
                        ContentType: params.contentType,
                        ContentDisposition: params.contentDisposition,
                        ...(overwrite ? {} : { IfNoneMatch: '*' }),
                    });

                    await this.s3Client.send(command);
                }

            } else {
                const body = params.fileBuffer;

                const command = new PutObjectCommand({
                    Bucket: params.containerName,
                    Key: params.objectName,
                    Body: body,
                    ContentType: params.contentType,
                    ContentDisposition: params.contentDisposition,
                    ...(overwrite ? {} : { IfNoneMatch: '*' }),
                });

                await this.s3Client.send(command);
            }

            return this.buildObjectUrl(params.containerName, params.objectName);
        } catch (err) {
            if (err instanceof S3ServiceException && err.name === 'PreconditionFailed') {
                if (ignoreIfAlreadyExists) {
                    return this.buildObjectUrl(params.containerName, params.objectName);
                }
                throw new DetectionAlreadyExists('Blob already uploaded.');
            }
            if (err instanceof S3ServiceException && err.name === 'NoSuchBucket' && params.forceContainerCreation) {
                await this.createBucket(params.containerName);
                return await this.createObject(params);
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

    public generateBlobUrl({ containerName, objectName }: { containerName: string; objectName: string; }) {
        if (this.blobEndpoint.includes('amazonaws.com')) {
            const region = this.blobEndpoint.split('.')[1];
            return `https://${containerName}.s3.${region}.amazonaws.com/${objectName}`;
        }
        return `${this.blobEndpoint}/${containerName}/${objectName}`;
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

    public async deleteObject(containerName: string, objectName: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: containerName,
            Key: objectName,
        });
        await this.s3Client.send(command);
    }

    public async getObjectProperties(containerName: string, objectName: string) {
        const command = new HeadObjectCommand({
            Bucket: containerName,
            Key: objectName,
        });

        const response = await this.s3Client.send(command);

        return {
            contentType: response.ContentType,
            contentLength: response.ContentLength,
            lastModified: response.LastModified,
            etag: response.ETag,
            metadata: response.Metadata,
        };
    }
}
