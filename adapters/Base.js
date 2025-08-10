export class BaseRepoAdapter {
    constructor(payload) {
        if (typeof payload !== 'object' || payload === null) {
            throw new TypeError("Payload must be an object.");
        }
        this.payload = payload;
    }

    get provider() {
        throw new Error("Subclass must implement 'provider' getter.");
    }

    get baseApiUrl() {
        throw new Error("Subclass must implement 'baseApiUrl' getter.");
    }

    get pullRequestNumber() {
        throw new Error("Subclass must implement 'pullRequestNumber' getter.");
    }

    get action() {
        throw new Error("Subclass must implement 'action' getter.");
    }

    get author() {
        throw new Error("Subclass must implement 'author' getter.");
    }

    get reviewers() {
        throw new Error("Subclass must implement 'reviewers' getter.");
    }

    get diffUrl() {
        throw new Error("Subclass must implement 'diffUrl' getter.");
    }

    get threadsUrl() {
        throw new Error("Subclass must implement 'threadsUrl' getter.");
    }
}