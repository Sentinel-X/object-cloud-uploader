import { expect } from 'chai';
import * as fs from 'fs';
import { uploadImageToBlob } from '../src/upload-blob';
import * as path from 'path';
import AWSBlobStorageService from '../src/services/aws-blob';
import BlobStorageService from '../src/services/azure-blob';
import moment from 'moment';

// ─── helpers ────────────────────────────────────────────────────────────────

const BLOB_IMAGE_PATH = path.join(__dirname, 'assets', 'blob_image.jpg');
// eslint-disable-next-line no-sync
const imageBuffer = fs.readFileSync(BLOB_IMAGE_PATH) as Buffer<ArrayBufferLike>;

const AWS_ENV: Record<string, string> = {
    CLOUD_TYPE: 'aws',
    AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    AWS_BUCKET_NAME: 'test-bucket',
    AWS_ENDPOINT: 'http://localhost:9444',
    AWS_REGION: 'us-east-1',
    AZURE_CONNECTION_STRING: 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;',
};

const AZURE_ENV: Record<string, string> = {
    ...AWS_ENV,
    CLOUD_TYPE: 'azure',
};

function setEnv(env: Record<string, string>) {
    for (const [k, v] of Object.entries(env)) {
        process.env[k] = v;
    }
}

// ─── Environment variable validation ────────────────────────────────────────

describe('Environment variables', () => {
    const requiredAwsVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_BUCKET_NAME',
        'AWS_ENDPOINT',
        'AWS_REGION',
    ];

    for (const varName of requiredAwsVars) {
        it(`throws when ${varName} is missing`, async () => {
            const original = process.env[varName];
            setEnv({ ...AWS_ENV, CLOUD_TYPE: 'aws' });
            delete process.env[varName];
            try {
                await uploadImageToBlob('test.jpg', imageBuffer);
                expect.fail('should have thrown');
            } catch (err) {
                expect((err as Error).message).to.include(varName);
            } finally {
                if (original !== undefined) {
                    process.env[varName] = original;
                } else {
                    delete process.env[varName];
                }
            }
        });

        it(`throws when ${varName} is empty string`, async () => {
            const original = process.env[varName];
            setEnv({ ...AWS_ENV, CLOUD_TYPE: 'aws', [varName]: '' });
            try {
                await uploadImageToBlob('test.jpg', imageBuffer);
                expect.fail('should have thrown');
            } catch (err) {
                expect((err as Error).message).to.include(varName);
            } finally {
                if (original !== undefined) {
                    process.env[varName] = original;
                } else {
                    delete process.env[varName];
                }
            }
        });
    }

    it('throws when AZURE_CONNECTION_STRING is missing', async () => {
        const original = process.env.AZURE_CONNECTION_STRING;
        setEnv({ ...AZURE_ENV });
        delete process.env.AZURE_CONNECTION_STRING;
        try {
            await uploadImageToBlob('test.jpg', imageBuffer);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('AZURE_CONNECTION_STRING');
        } finally {
            if (original !== undefined) {
                process.env.AZURE_CONNECTION_STRING = original;
            } else {
                delete process.env.AZURE_CONNECTION_STRING;
            }
        }
    });

    it('throws when AZURE_CONNECTION_STRING is empty string', async () => {
        const original = process.env.AZURE_CONNECTION_STRING;
        setEnv({ ...AZURE_ENV, AZURE_CONNECTION_STRING: '' });
        try {
            await uploadImageToBlob('test.jpg', imageBuffer);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('AZURE_CONNECTION_STRING');
        } finally {
            if (original !== undefined) {
                process.env.AZURE_CONNECTION_STRING = original;
            } else {
                delete process.env.AZURE_CONNECTION_STRING;
            }
        }
    });

    it('throws when CLOUD_TYPE is missing', async () => {
        const original = process.env.CLOUD_TYPE;
        setEnv(AWS_ENV);
        delete process.env.CLOUD_TYPE;
        try {
            await uploadImageToBlob('test.jpg', imageBuffer);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('CLOUD_TYPE');
        } finally {
            if (original !== undefined) {
                process.env.CLOUD_TYPE = original;
            } else {
                delete process.env.CLOUD_TYPE;
            }
        }
    });

    it('throws when CLOUD_TYPE is invalid', async () => {
        const original = process.env.CLOUD_TYPE;
        setEnv({ ...AWS_ENV, CLOUD_TYPE: 'gcp' });
        try {
            await uploadImageToBlob('test.jpg', imageBuffer);
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as Error).message).to.include('invalid_cloud_type');
        } finally {
            if (original !== undefined) {
                process.env.CLOUD_TYPE = original;
            } else {
                delete process.env.CLOUD_TYPE;
            }
        }
    });
});

// ─── AWS / s3Ninja ───────────────────────────────────────────────────────────

describe('uploadImageToBlob — AWS (s3Ninja)', () => {
    before(() => setEnv(AWS_ENV));

    after(async () => {
        const service = new AWSBlobStorageService({
            accessKeyId: AWS_ENV.AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_ENV.AWS_SECRET_ACCESS_KEY,
            region: AWS_ENV.AWS_REGION,
            endpoint: AWS_ENV.AWS_ENDPOINT,
        });
        await service.deleteBucket(AWS_ENV.AWS_BUCKET_NAME);
        await service.deleteBucket('auto-created-bucket');
    });

    it('uploads successfully and returns a URL', async () => {
        const result = await uploadImageToBlob('test-upload.jpg', imageBuffer);
        expect(result).to.be.a('string').and.not.empty;
    });

    it('prepends today\'s date to the object name', async () => {
        const today = moment().format('YYYY-MM-DD');
        const result = await uploadImageToBlob('my-image.jpg', imageBuffer);
        expect(result).to.include(today);
    });

    it('does not throw uploading the same object twice (PreconditionFailed handled)', async () => {
        await uploadImageToBlob('duplicate.jpg', imageBuffer);
        const result = await uploadImageToBlob('duplicate.jpg', imageBuffer);
        expect(result).to.be.a('string');
    });

    it('creates bucket automatically if it does not exist', async () => {
        const original = process.env.AWS_BUCKET_NAME;
        process.env.AWS_BUCKET_NAME = 'auto-created-bucket';
        try {
            const result = await uploadImageToBlob('new-bucket-test.jpg', imageBuffer);
            expect(result).to.be.a('string').and.not.empty;
        } finally {
            process.env.AWS_BUCKET_NAME = original;
        }
    });
});

// ─── Azure / Azurite ─────────────────────────────────────────────────────────

describe('uploadImageToBlob — Azure (Azurite)', () => {
    before(() => setEnv(AZURE_ENV));

    after(async () => {
        const service = new BlobStorageService(AZURE_ENV.AZURE_CONNECTION_STRING);
        const today = new Date().toISOString().slice(0, 10);
        await service.deleteBucket(today);
    });

    it('uploads successfully and returns a URL', async () => {
        const result = await uploadImageToBlob(`test-upload-${Date.now()}.jpg`, imageBuffer);
        expect(result).to.be.a('string').and.not.empty;
    });

    it('uses today\'s date as the container name', async () => {
        const today = moment().format('YYYY-MM-DD');
        const result = await uploadImageToBlob(`container-test-${Date.now()}.jpg`, imageBuffer);
        expect(result).to.include(today);
    });

    it('does not throw uploading the same object twice (DetectionAlreadyExists handled)', async () => {
        await uploadImageToBlob('duplicate.jpg', imageBuffer);
        const result = await uploadImageToBlob('duplicate.jpg', imageBuffer);
        expect(result).to.be.a('string');
    });

    it('creates container automatically if it does not exist', async () => {
        const result = await uploadImageToBlob(`after-delete-${Date.now()}.jpg`, imageBuffer);
        expect(result).to.be.a('string').and.not.empty;
        expect(result).to.include(moment().format('YYYY-MM-DD'));
    });
});
