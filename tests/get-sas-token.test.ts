import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import moment from 'moment';
import { getSasTokenForBlob } from '../src/get-sas-token';
import { uploadImageToBlob } from '../src/upload-blob';
import AWSBlobStorageService from '../src/services/aws-blob';
import BlobStorageService from '../src/services/azure-blob';

// ─── helpers ────────────────────────────────────────────────────────────────

const BLOB_IMAGE_PATH = path.join(__dirname, 'assets', 'blob_image.jpg');

const AWS_CONFIG = {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    endpoint: 'http://localhost:9444',
};

const AZURE_CONNECTION_STRING = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;';

const AWS_BUCKET = 'sas-token-test-bucket';
const AZURE_CONTAINER = moment().format('YYYY-MM-DD');

// ─── setup: sobe os blobs antes dos testes ───────────────────────────────────

let awsBlobUrl: string;
let azureBlobUrl: string;
let imageBuffer: Buffer<ArrayBufferLike>;

before(async () => {
    imageBuffer = await fs.promises.readFile(BLOB_IMAGE_PATH) as Buffer<ArrayBufferLike>;

    // AWS
    process.env.CLOUD_TYPE = 'aws';
    process.env.AWS_ACCESS_KEY_ID = AWS_CONFIG.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = AWS_CONFIG.secretAccessKey;
    process.env.AWS_REGION = AWS_CONFIG.region;
    process.env.AWS_ENDPOINT = AWS_CONFIG.endpoint;
    process.env.AWS_BUCKET_NAME = AWS_BUCKET;
    process.env.AZURE_CONNECTION_STRING = AZURE_CONNECTION_STRING;

    awsBlobUrl = await uploadImageToBlob('sas-token-test.jpg', imageBuffer);

    // Azure
    process.env.CLOUD_TYPE = 'azure';
    azureBlobUrl = await uploadImageToBlob('sas-token-test.jpg', imageBuffer);
});

after(async () => {
    const awsService = new AWSBlobStorageService(AWS_CONFIG);
    await awsService.deleteBucket(AWS_BUCKET);

    const azureService = new BlobStorageService(AZURE_CONNECTION_STRING);
    await azureService.deleteBucket(AZURE_CONTAINER);
});

// ─── AWS ─────────────────────────────────────────────────────────────────────

describe('getSasTokenForBlob — AWS (s3Ninja)', () => {
    it('returns a SAS token string for a valid blob URL', async () => {
        const token = await getSasTokenForBlob('aws', awsBlobUrl, AWS_CONFIG);

        expect(token).to.exist;
    });

    it('token contains expected query params', async () => {
        const token = await getSasTokenForBlob('aws', awsBlobUrl, AWS_CONFIG);

        expect(token).to.include('X-Amz-Signature');
        expect(token).to.include('X-Amz-Credential');
        expect(token).to.include('X-Amz-Expires');
    });

    it('reads credentials from env when config is not provided', async () => {
        process.env.CLOUD_TYPE = 'aws';
        process.env.AWS_ACCESS_KEY_ID = AWS_CONFIG.accessKeyId;
        process.env.AWS_SECRET_ACCESS_KEY = AWS_CONFIG.secretAccessKey;
        process.env.AWS_REGION = AWS_CONFIG.region;
        process.env.AWS_ENDPOINT = AWS_CONFIG.endpoint;

        const token = await getSasTokenForBlob('aws', awsBlobUrl);

        expect(token).to.be.a('string').and.not.empty;
    });

    it('throws when AWS_ACCESS_KEY_ID is missing and no config provided', async () => {
        const original = process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_ACCESS_KEY_ID;
        try {
            await getSasTokenForBlob('aws', awsBlobUrl);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('AWS_ACCESS_KEY_ID');
        } finally {
            process.env.AWS_ACCESS_KEY_ID = original;
        }
    });

    it('throws when AWS_SECRET_ACCESS_KEY is missing and no config provided', async () => {
        const original = process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        try {
            await getSasTokenForBlob('aws', awsBlobUrl);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('AWS_SECRET_ACCESS_KEY');
        } finally {
            process.env.AWS_SECRET_ACCESS_KEY = original;
        }
    });

    it('throws when AWS_REGION is missing and no config provided', async () => {
        const original = process.env.AWS_REGION;
        delete process.env.AWS_REGION;
        try {
            await getSasTokenForBlob('aws', awsBlobUrl);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('AWS_REGION');
        } finally {
            process.env.AWS_REGION = original;
        }
    });
});

// ─── Azure ───────────────────────────────────────────────────────────────────

describe('getSasTokenForBlob — Azure (Azurite)', () => {
    it('returns a SAS token object for a valid blob URL', async () => {
        const token = await getSasTokenForBlob('azure', azureBlobUrl, {
            connectionString: AZURE_CONNECTION_STRING,
        } as never);

        expect(token).to.not.be.undefined;
        expect(token!.toString()).to.be.a('string').and.not.empty;
    });

    it('token contains expected query params', async () => {
        const token = await getSasTokenForBlob('azure', azureBlobUrl, {
            connectionString: AZURE_CONNECTION_STRING,
        } as never);

        const tokenStr = token!.toString();
        expect(tokenStr).to.include('sig=');
        expect(tokenStr).to.include('se=');
        expect(tokenStr).to.include('sp=');
    });

    it('reads connection string from env when config is not provided', async () => {
        process.env.AZURE_CONNECTION_STRING = AZURE_CONNECTION_STRING;

        const token = await getSasTokenForBlob('azure', azureBlobUrl);

        expect(token).to.not.be.undefined;
        expect(token!.toString()).to.be.a('string').and.not.empty;
    });

    it('throws when AZURE_CONNECTION_STRING is missing and no config provided', async () => {
        const original = process.env.AZURE_CONNECTION_STRING;
        delete process.env.AZURE_CONNECTION_STRING;
        try {
            await getSasTokenForBlob('azure', azureBlobUrl);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('AZURE_CONNECTION_STRING');
        } finally {
            process.env.AZURE_CONNECTION_STRING = original;
        }
    });

    it('throws when URL does not belong to the configured endpoint', async () => {
        try {
            await getSasTokenForBlob('azure', 'http://other-account.blob.core.windows.net/container/blob.jpg', {
                connectionString: AZURE_CONNECTION_STRING,
            } as never);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('is not a valid URL');
        }
    });

    it('throws when storageType is not supported', async () => {
        try {
            await getSasTokenForBlob('gcp', awsBlobUrl, AWS_CONFIG);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('invalid_storage_type');
        }
    });
});
