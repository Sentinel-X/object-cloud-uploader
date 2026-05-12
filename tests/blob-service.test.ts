import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import moment from 'moment';
import BlobService from '../src/blob-service';
import { InvalidCloudType } from '../src/services/exceptions';

// ─── helpers ────────────────────────────────────────────────────────────────

const BLOB_IMAGE_PATH = path.join(__dirname, 'assets', 'blob_image.jpg');

const AWS_CONFIG = {
    blobStorageType: 'aws' as const,
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    endpoint: 'http://localhost:9444',
    containerName: 'blob-service-test-bucket',
};

const AZURE_CONFIG = {
    blobStorageType: 'azure' as const,
    connectionString: 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;',
};

const AZURE_CONTAINER = moment().format('YYYY-MM-DD');

let imageBuffer: Buffer<ArrayBufferLike>;
let awsService: BlobService;
let azureService: BlobService;

before(async () => {
    imageBuffer = await fs.promises.readFile(BLOB_IMAGE_PATH) as Buffer<ArrayBufferLike>;
    awsService = new BlobService(AWS_CONFIG);
    azureService = new BlobService(AZURE_CONFIG);
});

after(async () => {
    await awsService.deleteBucket(AWS_CONFIG.containerName);
    await awsService.deleteBucket('auto-created-bucket');
    await azureService.deleteBucket(AZURE_CONTAINER);
});

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('BlobService — constructor', () => {
    it('creates an AWS instance successfully', () => {
        expect(() => new BlobService(AWS_CONFIG)).to.not.throw();
    });

    it('creates an Azure instance successfully', () => {
        expect(() => new BlobService(AZURE_CONFIG)).to.not.throw();
    });

    it('throws InvalidCloudType for unsupported blobStorageType', () => {
        expect(() => new BlobService({ blobStorageType: 'gcp' } as never)).to.throw(InvalidCloudType);
    });
});

// ─── AWS / s3Ninja ───────────────────────────────────────────────────────────

describe('BlobService.uploadImageToBlob — AWS (s3Ninja)', () => {
    it('uploads successfully and returns a URL', async () => {
        const result = await awsService.uploadImageToBlob('test-upload.jpg', imageBuffer);
        expect(result).to.be.a('string').and.not.empty;
    });

    it('prepends today\'s date to the object name', async () => {
        const today = moment().format('YYYY-MM-DD');
        const result = await awsService.uploadImageToBlob('date-test.jpg', imageBuffer);
        expect(result).to.include(today);
    });

    it('does not throw uploading the same object twice (PreconditionFailed handled)', async () => {
        await awsService.uploadImageToBlob('duplicate.jpg', imageBuffer);
        const result = await awsService.uploadImageToBlob('duplicate.jpg', imageBuffer);
        expect(result).to.be.a('string');
    });

    it('creates bucket automatically if it does not exist', async () => {
        const service = new BlobService({ ...AWS_CONFIG, containerName: 'auto-created-bucket' });
        const result = await service.uploadImageToBlob('new-bucket-test.jpg', imageBuffer);
        expect(result).to.be.a('string').and.not.empty;
    });
});

describe('BlobService.getSasTokenForBlob — AWS (s3Ninja)', () => {
    let blobUrl: string;

    before(async () => {
        blobUrl = await awsService.uploadImageToBlob(`sas-test-${Date.now()}.jpg`, imageBuffer) ?? '';
    });

    it('returns a token string for a valid blob URL', async () => {
        const token = await awsService.getSasTokenForBlob('aws', blobUrl);
        expect(token).to.exist;
        expect(token!.toString()).to.be.a('string').and.not.empty;
    });

    it('token contains expected query params', async () => {
        const token = await awsService.getSasTokenForBlob('aws', blobUrl);
        const tokenStr = token!.toString();
        expect(tokenStr).to.include('X-Amz-Signature');
        expect(tokenStr).to.include('X-Amz-Credential');
        expect(tokenStr).to.include('X-Amz-Expires');
    });
});

// ─── Azure / Azurite ─────────────────────────────────────────────────────────

describe('BlobService.uploadImageToBlob — Azure (Azurite)', () => {
    it('uploads successfully and returns a URL', async () => {
        const result = await azureService.uploadImageToBlob(`test-upload-${Date.now()}.jpg`, imageBuffer);
        expect(result).to.be.a('string').and.not.empty;
    });

    it('uses today\'s date as the container name', async () => {
        const today = moment().format('YYYY-MM-DD');
        const result = await azureService.uploadImageToBlob(`container-test-${Date.now()}.jpg`, imageBuffer);
        expect(result).to.include(today);
    });

    it('does not throw uploading the same object twice (DetectionAlreadyExists handled)', async () => {
        await azureService.uploadImageToBlob('duplicate.jpg', imageBuffer);
        const result = await azureService.uploadImageToBlob('duplicate.jpg', imageBuffer);
        expect(result).to.be.a('string');
    });

    it('creates container automatically if it does not exist', async () => {
        const result = await azureService.uploadImageToBlob(`after-delete-${Date.now()}.jpg`, imageBuffer);
        expect(result).to.be.a('string').and.not.empty;
        expect(result).to.include(moment().format('YYYY-MM-DD'));
    });
});

describe('BlobService.getSasTokenForBlob — Azure (Azurite)', () => {
    let blobUrl: string;

    before(async () => {
        blobUrl = await azureService.uploadImageToBlob(`sas-test-${Date.now()}.jpg`, imageBuffer) ?? '';
    });

    it('returns a token for a valid blob URL', async () => {
        const token = await azureService.getSasTokenForBlob('azure', blobUrl);
        expect(token).to.exist;
        expect(token!.toString()).to.be.a('string').and.not.empty;
    });

    it('token contains expected query params', async () => {
        const token = await azureService.getSasTokenForBlob('azure', blobUrl);
        const tokenStr = token!.toString();
        expect(tokenStr).to.include('sig=');
        expect(tokenStr).to.include('se=');
        expect(tokenStr).to.include('sp=');
    });

    it('throws when URL does not belong to the configured endpoint', async () => {
        try {
            await azureService.getSasTokenForBlob('azure', 'http://other-account.blob.core.windows.net/container/blob.jpg');
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('is not a valid URL');
        }
    });
});
