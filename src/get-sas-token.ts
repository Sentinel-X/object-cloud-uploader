import moment from 'moment';
import { getAwsService } from './services/aws-blob';
import { getAzureService } from './services/azure-blob';

type SupportedStorageType = 'aws' | 'azure';
const SUPPORTED_STORAGE_TYPES: SupportedStorageType[] = ['aws', 'azure'];

/**
 * Generates a temporary access token (SAS for Azure or Pre-signed URL for AWS)
 * for a specific object based on its URL.
 * * @param {string} storageType - The storage provider. Accepted values: ‘aws’ | ‘azure’.
 * @param {string} blobUrl - The full URL of the stored object.
 * @param {Object} [config] - Optional credential settings. If omitted, environment variables will be used.
 * @param {string} [config.accessKeyId] - (AWS) Access key ID.
 * @param {string} [config.secretAccessKey] - (AWS) Secret access key.
 * @param {string} [config.region] - (AWS) Bucket region.
 * @param {string} [config.endpoint] - (AWS) Custom endpoint (e.g., LocalStack or MinIO).
 * @param {string} [config.connectionString] - (Azure) Full connection string.
 * @param {number} [millisecondsDuration=300000] - Token validity period in milliseconds (default: 5 minutes).
 * * @returns {Promise<string>} A string containing the token parameters (e.g., “sig=...&se=...”).
 * @throws {Error} If the storageType is invalid or if the required credentials are not found.
 */
export async function getSasTokenForBlob(
    storageType: string,
    blobUrl: string,
    config?: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        endpoint?: string;
        connectionString?: string;
    },
    millisecondsDuration: number = moment.duration(5, 'minutes').asMilliseconds(),
) {
    if (!SUPPORTED_STORAGE_TYPES.includes(storageType as SupportedStorageType)) {
        throw new Error(`invalid_storage_type.${storageType.replaceAll(' ', '').replaceAll('-', '_').replaceAll('.', '_')}`);
    }

    if (storageType === 'azure') {
        const azureBlobStorageService = getAzureService(config?.connectionString);
        const { containerName, blobName } = azureBlobStorageService.getBlobName(blobUrl);
        return azureBlobStorageService.generateSasTokenForBlob(containerName, blobName, millisecondsDuration);
    } else if (storageType === 'aws') {
        const awsBlobStorageService = getAwsService(config);
        const { containerName, blobName } = awsBlobStorageService.getBlobName(blobUrl);
        return await awsBlobStorageService.generateSasTokenForBlob(containerName, blobName, millisecondsDuration);
    }
}
