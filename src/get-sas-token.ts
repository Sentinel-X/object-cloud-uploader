import moment from 'moment';
import { getAwsService } from './services/aws-blob';
import { getAzureService } from './services/azure-blob';

type SupportedStorageType = 'aws' | 'azure';
const SUPPORTED_STORAGE_TYPES: SupportedStorageType[] = ['aws', 'azure'];

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
