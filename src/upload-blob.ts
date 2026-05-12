import moment from 'moment';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { RestError } from '@azure/storage-blob';
import AWSBlobStorageService from './services/aws-blob';
import BlobStorageService from './services/azure-blob';
import { DetectionAlreadyExists, InvalidCloudType } from './services/exceptions';

function getAwsService() {
    return new AWSBlobStorageService({
        region: process.env.AWS_REGION!,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        endpoint: process.env.AWS_ENDPOINT!
    });
}

function getAzureService() {
    return new BlobStorageService(process.env.AZURE_CONNECTION_STRING!);
}

async function uploadToAzure(objectName: string, blob: Buffer<ArrayBufferLike>) {
    if (!process.env.AZURE_CONNECTION_STRING) {
        throw new Error('Missing AZURE_CONNECTION_STRING environment variable');
    }

    const azureBlobStorageService = getAzureService();

    const containerName = moment().format('YYYY-MM-DD');
    let imageUrl: string = '';
    try {
        imageUrl = await azureBlobStorageService.createObject({
            fileBuffer: blob,
            objectName: objectName,
            contentType: 'image/jpeg',
            containerName: containerName
        });
    } catch (err) {
        if (err instanceof DetectionAlreadyExists) {
            return imageUrl;
        } else if (err instanceof RestError && err.code == 'ContainerNotFound') {
            await azureBlobStorageService.createBucket(containerName);
            imageUrl = await azureBlobStorageService.createObject({
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

async function uploadToAws(objectName: string, blob: Buffer<ArrayBufferLike>) {
    if (!process.env.AWS_ACCESS_KEY_ID) {
        throw new Error('Missing AWS_ACCESS_KEY_ID environment variable');
    }

    if (!process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('Missing AWS_SECRET_ACCESS_KEY environment variable');
    }

    const awsBucketName = process.env.AWS_BUCKET_NAME!;
    if (!awsBucketName || awsBucketName === '') {
        throw new Error('Missing AWS_BUCKET_NAME environment variable');
    }

    if (!process.env.AWS_ENDPOINT) {
        throw new Error('Missing AWS_ENDPOINT environment variable');
    }

    if (!process.env.AWS_REGION) {
        throw new Error('Missing AWS_REGION environment variable');
    }

    const awsBlobStorageService = getAwsService();

    let imageUrl: string = '';
    try {
        imageUrl = await awsBlobStorageService.createObject({
            objectName: objectName,
            fileBuffer: blob,
            contentType: 'image/jpeg',
            containerName: awsBucketName,
        });
    } catch (err) {
        if (err instanceof S3ServiceException && err?.name === 'PreconditionFailed') {
            return imageUrl;
        } else if (err instanceof S3ServiceException && err?.name === 'NoSuchBucket') {
            await awsBlobStorageService.createBucket(awsBucketName);
            imageUrl = await awsBlobStorageService.createObject({
                objectName: objectName,
                fileBuffer: blob,
                contentType: 'image/jpeg',
                containerName: awsBucketName,
            });
        } else {
            console.log(err);
            throw err;
        }
    }
    return imageUrl;
}

export async function uploadImageToBlob(objectName: string, blob: Buffer<ArrayBufferLike>) {
    const cloudType = process.env.CLOUD_TYPE!;
    if (!cloudType || cloudType === '') {
        throw new Error('Missing CLOUD_TYPE environment variable');
    }

    if (cloudType === 'azure') {
        return await uploadToAzure(objectName, blob);
    } else if (cloudType === 'aws') {
        return await uploadToAws(moment().format('YYYY-MM-DD') + '/' + objectName, blob);
    } else {
        throw new InvalidCloudType(`invalid_cloud_type.${cloudType.replaceAll(' ', '').replaceAll('-', '_').replaceAll('.', '_')}`);
    }
}
