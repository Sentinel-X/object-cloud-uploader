import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import moment from 'moment';
import BlobService, { BlobConfig } from '../src/blob-service';
import { InvalidCloudType } from '../src/services/exceptions';

// ─── helpers ────────────────────────────────────────────────────────────────

const BLOB_IMAGE_PATH = path.join(__dirname, 'assets', 'blob_image.jpg');

const AWS_CONFIG: BlobConfig = {
    blobStorageType: 'aws',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    endpoint: 'http://localhost:9444',
};

const AWS_CONTAINER_NAME = 'blob-service-test-bucket';

const AZURE_CONFIG: BlobConfig = {
    blobStorageType: 'azure',
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
    await awsService.deleteBucket(AWS_CONTAINER_NAME);
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

// ─── createObject ─────────────────────────────────────────────────────────────

describe('BlobService.createObject — AWS (s3Ninja)', () => {
    it('uploads successfully and returns a URL', async () => {
        const result = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName: `test-upload-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('creates bucket automatically and uploads if bucket does not exist', async () => {
        const service = new BlobService({ ...AWS_CONFIG });
        const result = await service.createObject({
            containerName: 'auto-created-bucket',
            objectName: `new-bucket-test-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
            forceContainerCreation: true,
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('returns existing URL when ignoreIfAlreadyExists is true', async () => {
        const objectName = `ignore-duplicate-${Date.now()}.jpg`;
        await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName,
            fileBuffer: imageBuffer,
        });
        const result = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName,
            fileBuffer: imageBuffer,
            ignoreIfAlreadyExists: true,
        });
        expect(result).to.be.a('string').and.not.empty;
    });
});

describe('BlobService.createObject — Azure (Azurite)', () => {
    before(async () => {
        await azureService.createBucket(AZURE_CONTAINER);
    });

    it('uploads successfully and returns a URL', async () => {
        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: `test-upload-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('creates container automatically and uploads if container does not exist', async () => {
        const tempContainer = `temp-${Date.now()}`;
        try {
            const result = await azureService.createObject({
                containerName: tempContainer,
                objectName: 'new-container-test.jpg',
                fileBuffer: imageBuffer,
                contentType: 'image/jpeg',
                forceContainerCreation: true
            });
            expect(result).to.be.a('string').and.not.empty;
        } finally {
            await azureService.deleteBucket(tempContainer);
        }
    });

    it('throws DetectionAlreadyExists when object already exists', async () => {
        const objectName = `duplicate-${Date.now()}.jpg`;
        await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
        });
        try {
            await azureService.createObject({
                containerName: AZURE_CONTAINER,
                objectName,
                fileBuffer: imageBuffer,
            });
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).constructor.name).to.equal('DetectionAlreadyExists');
        }
    });

    it('returns existing URL when ignoreIfAlreadyExists is true', async () => {
        const objectName = `ignore-duplicate-${Date.now()}.jpg`;
        await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
        });
        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
            ignoreIfAlreadyExists: true,
        });
        expect(result).to.be.a('string').and.not.empty;
    });
});

// ─── getBlobName ─────────────────────────────────────────────────────────────

describe('BlobService.getBlobName — AWS', () => {
    it('extracts containerName and blobName from a valid URL', async () => {
        const url = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName: `get-blob-name-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
        });
        const { containerName, blobName } = awsService.getBlobName(url);
        expect(containerName).to.equal(AWS_CONTAINER_NAME);
        expect(blobName).to.be.a('string').and.not.empty;
    });
});

describe('BlobService.getBlobName — Azure', () => {
    before(async () => {
        await azureService.createBucket(AZURE_CONTAINER);
    });

    it('extracts containerName and blobName from a valid URL', async () => {
        const url = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: `get-blob-name-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
        });
        const { containerName, blobName } = azureService.getBlobName(url);
        expect(containerName).to.equal(AZURE_CONTAINER);
        expect(blobName).to.be.a('string').and.not.empty;
    });

    it('throws when URL does not belong to the configured endpoint', () => {
        expect(() => azureService.getBlobName('http://other-account.blob.core.windows.net/container/blob.jpg'))
            .to.throw('is not a valid URL');
    });
});

// ─── generateSasTokenForBlob ──────────────────────────────────────────────────

describe('BlobService.generateSasTokenForBlob — AWS (s3Ninja)', () => {
    let containerName: string;
    let blobName: string;

    before(async () => {
        const url = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName: `sas-test-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
        });
        ({ containerName, blobName } = awsService.getBlobName(url));
    });

    it('returns a token string', async () => {
        const token = await awsService.generateSasTokenForBlob(containerName, blobName);
        expect(token).to.exist;
        expect(String(token)).to.be.a('string').and.not.empty;
    });

    it('token contains expected query params', async () => {
        const token = await awsService.generateSasTokenForBlob(containerName, blobName);
        const tokenStr = String(token);
        expect(tokenStr).to.include('X-Amz-Signature');
        expect(tokenStr).to.include('X-Amz-Credential');
        expect(tokenStr).to.include('X-Amz-Expires');
    });
});

describe('BlobService.generateSasTokenForBlob — Azure (Azurite)', () => {
    let containerName: string;
    let blobName: string;

    before(async () => {
        await azureService.createBucket(AZURE_CONTAINER);
        const url = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: `sas-test-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
        });
        ({ containerName, blobName } = azureService.getBlobName(url));
    });

    it('returns a token string', async () => {
        const token = await azureService.generateSasTokenForBlob(containerName, blobName);
        expect(token).to.exist;
        expect(String(token)).to.be.a('string').and.not.empty;
    });

    it('token contains expected query params', async () => {
        const token = await azureService.generateSasTokenForBlob(containerName, blobName);
        const tokenStr = String(token);
        expect(tokenStr).to.include('sig=');
        expect(tokenStr).to.include('se=');
        expect(tokenStr).to.include('sp=');
    });
});
