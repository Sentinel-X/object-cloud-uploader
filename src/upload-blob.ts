import moment from 'moment';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { RestError } from '@azure/storage-blob';
import { DetectionAlreadyExists, InvalidCloudType } from './services/exceptions';
import { getAzureService } from './services/azure-blob';
import { getAwsService } from './services/aws-blob';

async function uploadToAzure(objectName: string, blob: Buffer<ArrayBufferLike>) {
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
    const awsBucketName = process.env.AWS_BUCKET_NAME!;
    if (!awsBucketName || awsBucketName === '') {
        throw new Error('Missing AWS_BUCKET_NAME environment variable');
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
 * @throws {Error} If `CLOUD_TYPE` is missing or if the provider is invalid.
 * @throws {InvalidCloudType} If the configured cloud type is not supported.
 */
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
