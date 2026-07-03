import { expect } from 'chai';
import path from 'path';
import { readFile } from 'fs/promises';
import moment from 'moment';
import BlobService, { BlobConfig } from '../src/blob-service';
import { InvalidCloudType, InvalidStatusCode } from '../src/services/exceptions';

// ─── helpers ────────────────────────────────────────────────────────────────

const BLOB_IMAGE_PATH = path.join(__dirname, 'assets', 'blob_image.jpg');
const ANOTHER_BLOB_IMAGE_PATH = path.join(__dirname, 'assets', 'another_blob_image.jpg');

const AZURE_CONFIG: BlobConfig = {
    blobStorageType: 'azure',
    connectionString: 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;',
};

const AZURE_CONTAINER = moment().format('YYYY-MM-DD');

let imageBuffer: Buffer<ArrayBufferLike>;
let anotherImageBuffer: Buffer<ArrayBufferLike>;
let azureService: BlobService;

before(async () => {
    imageBuffer = await readFile(BLOB_IMAGE_PATH);
    anotherImageBuffer = await readFile(ANOTHER_BLOB_IMAGE_PATH);
    azureService = new BlobService(AZURE_CONFIG);
});

after(async () => {
    await azureService.deleteBucket(AZURE_CONTAINER);
});

describe('BlobService — constructor', () => {
    it('creates an Azure instance successfully', () => {
        expect(() => new BlobService(AZURE_CONFIG)).to.not.throw();
    });

    it('throws InvalidCloudType for unsupported blobStorageType', () => {
        expect(() => new BlobService({ blobStorageType: 'gcp' } as never)).to.throw(InvalidCloudType);
    });
});

describe('azure basic bucket operations', () => {
    it('get blob endpoint', async () => {
        const blobEndpoint = azureService.getBlobEndpoint();
        expect(blobEndpoint).to.be.equal('http://127.0.0.1:10000/devstoreaccount1');
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

describe('BlobService.createObject — Azure (Azurite)', () => {
    before(async () => {
        await azureService.createBucket(AZURE_CONTAINER);
    });

    it('uploads fileBuffer successfully and returns a URL', async () => {
        const contentDisposition = 'attachment; filename="myTestFile.jpg"';
        const objectName = `test-upload-${Date.now()}.jpg`;

        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
            contentDisposition
        });
        expect(result).to.be.a('string').and.not.empty;

        const token = await azureService.generateSasTokenForBlob(AZURE_CONTAINER, objectName);
        const response = await fetch(`${result}?${token}`);
        expect(response.headers.get('content-disposition')).to.equal(contentDisposition);
    });

    it('uploads filePath successfully and returns a URL', async () => {
        const contentDisposition = 'attachment; filename="myTestFile.jpg"';
        const objectName = `test-upload-${Date.now()}.jpg`;

        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName: objectName,
            filePath: BLOB_IMAGE_PATH,
            contentType: 'image/jpeg',
            contentDisposition,
        });
        expect(result).to.be.a('string').and.not.empty;

        const token = await azureService.generateSasTokenForBlob(AZURE_CONTAINER, objectName);
        const response = await fetch(`${result}?${token}`);
        expect(response.headers.get('content-disposition')).to.equal(contentDisposition);
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

    it('creates an object copying from url', async () => {
        await azureService.createBucket('duplicated-container');

        const firstResult = await azureService.createObject({
            containerName: 'duplicated-container',
            objectName: `test-to-copy-${Date.now()}.jpg`,
            filePath: BLOB_IMAGE_PATH,
            contentType: 'image/jpeg',
            contentDisposition: 'attachment; filename="myTestFile.jpg"'
        });
        expect(firstResult).to.be.a('string').and.not.empty;

        const { containerName, blobName } = azureService.getBlobName(firstResult);
        const token = await azureService.generateSasTokenForBlob(containerName, blobName);
        expect(token).to.exist;
        expect(token).to.be.a('string').and.not.empty;

        const objectName = `copied-from-url-${Date.now()}.jpg`;
        const result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            copyFromUrl: `${firstResult}?${token}`,
            maxMemoryUse: 1,
        });
        expect(result).to.be.a('string').and.not.empty;

        await azureService.deleteBucket('duplicated-container');
    });

    it('Failed to copying from url', async () => {
        try {
            await azureService.createBucket('duplicated-container');
            const result = await azureService.createObject({
                containerName: 'duplicated-container',
                objectName: `test-to-copy-${Date.now()}.jpg`,
                filePath: BLOB_IMAGE_PATH,
                contentType: 'image/jpeg',
                contentDisposition: 'attachment; filename="myTestFile.jpg"'
            });
            expect(result).to.be.a('string').and.not.empty;

            const objectName = `copied-from-url-${Date.now()}.jpg`;
            await azureService.createObject({
                containerName: AZURE_CONTAINER,
                objectName,
                copyFromUrl: result,
                maxMemoryUse: 1,
            });
        } catch (error) {
            expect(error).to.be.instanceOf(InvalidStatusCode);
            expect((error as Error).message).to.contain('403');
        }
        await azureService.deleteBucket('duplicated-container');
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

        await azureService.createBucket('to-overwrite');
        const firstResult = await azureService.createObject({
            containerName: 'to-overwrite',
            objectName,
            fileBuffer: anotherImageBuffer,
            contentType: 'image/jpeg',
            overwrite: true,
        });
        expect(firstResult).to.be.a('string').and.not.empty;

        const token = await azureService.generateSasTokenForBlob('to-overwrite', objectName);
        expect(token).to.exist;
        expect(token).to.be.a('string').and.not.empty;

        let result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
            overwrite: true,
        });
        expect(result).to.be.a('string').and.not.empty;

        let props = await azureService.getObjectProperties(AZURE_CONTAINER, objectName);
        expect(props).to.exist;
        expect(props.contentLength).to.be.a('number').and.eq(373636);

        result = await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            copyFromUrl: `${firstResult}?${token}`,
            contentType: 'image/jpeg',
            overwrite: true,
        });
        expect(result).to.be.a('string').and.not.empty;
        props = await azureService.getObjectProperties(AZURE_CONTAINER, objectName);
        expect(props).to.exist;
        expect(props.contentLength).to.be.a('number').and.eq(3322458);

        await azureService.deleteBucket('to-overwrite');
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

describe('BlobService.getObjectProperties — Azure', () => {
    let objectName: string;

    before(async () => {
        objectName = `properties-test-${Date.now()}.jpg`;
        await azureService.createObject({
            containerName: AZURE_CONTAINER,
            objectName,
            fileBuffer: imageBuffer,
            contentType: 'image/jpeg',
        });
    });

    after(async () => {
        await azureService.deleteObject(AZURE_CONTAINER, objectName);
    });

    it('returns properties of an existing object', async () => {
        const props = await azureService.getObjectProperties(AZURE_CONTAINER, objectName);
        expect(props).to.exist;
        expect(props.contentType).to.equal('image/jpeg');
        expect(props.contentLength).to.be.a('number').and.greaterThan(0);
        expect(props.lastModified).to.be.instanceOf(Date);
        expect(props.etag).to.be.a('string').and.not.empty;
    });

    it('throws when object does not exist', async () => {
        try {
            await azureService.getObjectProperties(AZURE_CONTAINER, `non-existent-${Date.now()}.jpg`);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).constructor.name).to.equal('RestError');
        }
    });
});
