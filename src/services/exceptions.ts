class ExtendableError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }
}

export class DetectionAlreadyExists extends ExtendableError { }
export class InvalidCloudType extends ExtendableError { }
