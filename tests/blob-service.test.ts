import { expect } from 'chai';
import path from 'path';
import { readFile } from 'fs/promises';
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
    imageBuffer = await readFile(BLOB_IMAGE_PATH);
    awsService = new BlobService(AWS_CONFIG);
    azureService = new BlobService(AZURE_CONFIG);
});

after(async () => {
    await awsService.deleteBucket(AWS_CONTAINER_NAME);
    await awsService.deleteBucket('auto-created-bucket');
    await awsService.deleteBucket('duplicated-container');
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

// ─── basic bucket operations ─────────────────────────────────────────────────────────────

describe('aws basic bucket operations', () => {
    it('creates and delete bucket', async () => {
        await awsService.createBucket('random-container');
        await awsService.deleteBucket('random-container');
    });

    it('delete bucket that does not exists', async () => {
        await awsService.deleteBucket('this-not-exists');
    });

    it('create duplicated container', async () => {
        await awsService.createBucket('duplicated-container');
        await awsService.createBucket('duplicated-container');
    });
});

describe('azure basic bucket operations', () => {
    it('creates and delete bucket', async () => {
        await azureService.createBucket('random-container');
        await azureService.deleteBucket('random-container');
    });

    it('delete bucket that does not exists', async () => {
        await azureService.deleteBucket('this-not-exists');
    });

    it('create duplicated container', async () => {
        await azureService.createBucket('duplicated-container');
        await azureService.createBucket('duplicated-container');
    });
});


// ─── createObject ─────────────────────────────────────────────────────────────

describe('BlobService.createObject — AWS (s3Ninja)', () => {
    before(async () => {
        await awsService.createBucket(AWS_CONTAINER_NAME);
    });

    it('uploads fileBuffer successfully and returns a URL', async () => {
        const result = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName: `test-upload-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('uploads filePath successfully and returns a URL', async () => {
        const result = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName: `test-upload-${Date.now()}.jpg`,
            filePath: BLOB_IMAGE_PATH,
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

    it('uploads fileBuffer successfully and returns a URL', async () => {
        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: `test-upload-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('uploads filePath successfully and returns a URL', async () => {
        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: `test-upload-${Date.now()}.jpg`,
            filePath: BLOB_IMAGE_PATH,
            contentType: 'image/jpeg',
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('creates container automatically and uploads if container does not exist using file buffer', async () => {
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

    it('creates container automatically and uploads if container does not exist using file path', async () => {
        const tempContainer = `temp-${Date.now()}`;
        try {
            const result = await azureService.createObject({
                containerName: tempContainer,
                objectName: 'new-container-test.jpg',
                filePath: BLOB_IMAGE_PATH,
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

// ─── createObject overwrite ───────────────────────────────────────────────────

describe('BlobService.createObject overwrite — AWS (s3Ninja)', () => {
    const objectName = `overwrite-test-${Date.now()}.jpg`;

    before(async () => {
        await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
    });

    // s3Ninja does not support IfNoneMatch header, so this test is skipped.
    // TODO: remove skip when s3Ninja adds support for IfNoneMatch (https://github.com/scireum/s3ninja)
    it.skip('throws DetectionAlreadyExists when object already exists and overwrite is false', async () => {
        try {
            await awsService.createObject({
                containerName: AWS_CONTAINER_NAME,
                objectName,
                fileBuffer: imageBuffer,
                contentType: 'image/jpeg',
                overwrite: false,
            });
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).constructor.name).to.equal('DetectionAlreadyExists');
        }
    });

    it('overwrites existing object successfully when overwrite is true', async () => {
        const result = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
            overwrite: true,
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('overwrite with filePath succeeds', async () => {
        const result = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName,
            filePath: BLOB_IMAGE_PATH,
            contentType: 'image/jpeg',
            overwrite: true,
        });
        expect(result).to.be.a('string').and.not.empty;
    });
});

describe('BlobService.createObject overwrite — Azure (Azurite)', () => {
    const objectName = `overwrite-test-${Date.now()}.jpg`;

    before(async () => {
        await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
    });

    it('throws DetectionAlreadyExists when object already exists and overwrite is false', async () => {
        try {
            await azureService.createObject({
                containerName: AZURE_CONTAINER,
                objectName,
                fileBuffer: imageBuffer,
                contentType: 'image/jpeg',
                overwrite: false,
            });
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).constructor.name).to.equal('DetectionAlreadyExists');
        }
    });

    it('overwrites existing object successfully when overwrite is true', async () => {
        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
            overwrite: true,
        });
        expect(result).to.be.a('string').and.not.empty;
    });

    it('overwrite with filePath succeeds', async () => {
        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            filePath: BLOB_IMAGE_PATH,
            contentType: 'image/jpeg',
            overwrite: true,
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

// ─── generateBlobUrl ──────────────────────────────────────────────────────────

describe('BlobService.generateBlobUrl — AWS', () => {
    it('returns a valid URL for a given containerName and objectName', () => {
        const result = awsService.generateBlobUrl({
            containerName: AWS_CONTAINER_NAME,
            objectName: 'some/nested/file.jpg',
        });
        expect(result).to.be.a('string').and.not.empty;
        expect(result).to.include(AWS_CONTAINER_NAME);
        expect(result).to.include('some/nested/file.jpg');
    });

    it('returned URL matches the URL from createObject', async () => {
        const objectName = `url-match-${Date.now()}.jpg`;
        const uploadedUrl = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        const generatedUrl = awsService.generateBlobUrl({
            containerName: AWS_CONTAINER_NAME,
            objectName,
        });
        expect(generatedUrl).to.equal(uploadedUrl);
    });
});

describe('BlobService.generateBlobUrl — Azure', () => {
    it('returns a valid URL for a given containerName and objectName', () => {
        const result = azureService.generateBlobUrl({
            containerName: AZURE_CONTAINER,
            objectName: 'some/nested/file.jpg',
        });
        expect(result).to.be.a('string').and.not.empty;
        expect(result).to.include(AZURE_CONTAINER);
        expect(result).to.include('some/nested/file.jpg');
    });

    it('returned URL matches the URL from createObject', async () => {
        const objectName = `url-match-${Date.now()}.jpg`;
        const uploadedUrl = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        const generatedUrl = azureService.generateBlobUrl({
            containerName: AZURE_CONTAINER,
            objectName,
        });
        expect(generatedUrl).to.equal(uploadedUrl);
    });
});

// ─── generateSasTokenForBlob ──────────────────────────────────────────────────

describe('BlobService.generateSasTokenForBlob — AWS (s3Ninja)', () => {
    let containerName: string;
    let blobName: string;
    let url: string;

    before(async () => {
        url = await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName: `sas-test-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
        });
        ({ containerName, blobName } = awsService.getBlobName(url));
    });

    it('returns a token string', async () => {
        const token = await awsService.generateSasTokenForBlob(containerName, blobName);
        expect(token).to.exist;
        expect(token).to.be.a('string').and.not.empty;

        const sasTokenUrl = new URL(`${url}?${token}`);
        expect(sasTokenUrl.searchParams.has('X-Amz-Signature')).to.be.true;
        expect(sasTokenUrl.searchParams.has('X-Amz-Credential')).to.be.true;
        expect(sasTokenUrl.searchParams.has('X-Amz-Expires')).to.be.true;

        expect(sasTokenUrl.searchParams.get('X-Amz-Expires')).to.be.equal(String(moment.duration(5, 'minutes').asSeconds()));
    });

    it('returns a token string with expected expire value', async () => {
        const token = await awsService.generateSasTokenForBlob(containerName, blobName, moment.duration(7, 'days').asMilliseconds());

        const sasTokenUrl = new URL(`${url}?${token}`);
        expect(sasTokenUrl.searchParams.has('X-Amz-Signature')).to.be.true;
        expect(sasTokenUrl.searchParams.has('X-Amz-Credential')).to.be.true;
        expect(sasTokenUrl.searchParams.has('X-Amz-Expires')).to.be.true;
        expect(sasTokenUrl.searchParams.get('X-Amz-Expires')).to.be.equal(String(moment.duration(7, 'days').asSeconds()));
    });
});

describe('BlobService.generateSasTokenForBlob — Azure (Azurite)', () => {
    let containerName: string;
    let blobName: string;
    let url: string;

    before(async () => {
        await azureService.createBucket(AZURE_CONTAINER);
        url = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: `sas-test-${Date.now()}.jpg`,
            fileBuffer: imageBuffer,
        });
        ({ containerName, blobName } = azureService.getBlobName(url));
    });

    it('returns a token string', async () => {
        const token = await azureService.generateSasTokenForBlob(containerName, blobName);
        expect(token).to.exist;
        expect(token).to.be.a('string').and.not.empty;

        const sasTokenUrl = new URL(`${url}?${token}`);
        expect(sasTokenUrl.searchParams.has('sig')).to.be.true;
        expect(sasTokenUrl.searchParams.has('se')).to.be.true;
        expect(sasTokenUrl.searchParams.has('st')).to.be.true;
        expect(sasTokenUrl.searchParams.has('sp')).to.be.true;
        expect(sasTokenUrl.searchParams.has('sr')).to.be.true;

        // sas token type = blob
        expect(sasTokenUrl.searchParams.get('sr')).to.be.equal('b');

        // permission type = read
        expect(sasTokenUrl.searchParams.get('sp')).to.be.equal('r');

        // five minutes default
        expect(moment(sasTokenUrl.searchParams.get('se')).diff(moment(sasTokenUrl.searchParams.get('st')), 'minutes')).to.be.equal(5);
    });

    it('returns a token string with expected expire value', async () => {
        const token = await azureService.generateSasTokenForBlob(containerName, blobName, moment.duration(7, 'days').asMilliseconds());
        expect(token).to.exist;
        expect(token).to.be.a('string').and.not.empty;

        const sasTokenUrl = new URL(`${url}?${token}`);

        // five minutes default
        expect(moment(sasTokenUrl.searchParams.get('se')).diff(moment(sasTokenUrl.searchParams.get('st')), 'days')).to.be.equal(7);
    });
});

// ─── deleteObject ─────────────────────────────────────────────────────────────

describe('BlobService.deleteObject — AWS', () => {
    it('deletes an existing object successfully', async () => {
        const objectName = `delete-test-${Date.now()}.jpg`;
        await awsService.createObject({
            containerName: AWS_CONTAINER_NAME,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        await awsService.deleteObject(AWS_CONTAINER_NAME, objectName);
    });

    it('does not throw when object does not exist', async () => {
        await awsService.deleteObject(AWS_CONTAINER_NAME, `non-existent-${Date.now()}.jpg`);
    });
});

describe('BlobService.deleteObject — Azure', () => {
    it('deletes an existing object successfully', async () => {
        const objectName = `delete-test-${Date.now()}.jpg`;
        await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
        await azureService.deleteObject(AZURE_CONTAINER, objectName);
    });

    it('does not throw when object does not exist', async () => {
        await azureService.deleteObject(AZURE_CONTAINER, `non-existent-${Date.now()}.jpg`);
    });
});
