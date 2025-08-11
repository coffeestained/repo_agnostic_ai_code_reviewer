import parse from 'parse-diff';
import { HttpProvider } from '../providers/http/HttpProvider.js';
import { doGeminiResponse } from '../providers/gemini/Gemini.js';
import { Logger } from '../lib/logger.js';

export class BaseRepoAdapter {
    constructor(payload) {
        if (typeof payload !== 'object' || payload === null) {
            throw new TypeError("Payload must be an object.");
        }
        this.payload = payload;
        this.http = new HttpProvider();
        this.parse = parse;
        this.doLLM = doGeminiResponse;
        this.logger = Logger;
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

    get prUrl() {
        throw new Error("Subclass must implement 'prUrl' getter.");
    }

    get diffUrl() {
        throw new Error("Subclass must implement 'diffUrl' getter.");
    }

    get threadsUrl() {
        throw new Error("Subclass must implement 'threadsUrl' getter.");
    }

    get reviewersUrl() {
        throw new Error("Subclass must implement 'reviewersUrl' getter.");
    }

    get reviewsUrl() {
        throw new Error("Subclass must implement 'reviewsUrl' getter.");
    }

    get headers() {
        throw new Error("Subclass must implement 'headers' getter.");
    }

    get commentProperties() {
        throw new Error("Subclass must implement 'commentProperties' getter.");
    }

    get llmResponse() {
        throw new Error("Subclass must implement 'llmResponse' getter.");
    }

    set llmResponse(val) {
        throw new Error("Subclass must implement 'llmResponse' setter.");
    }

    get tree() {
        throw new Error("Subclass must implement 'tree' getter.");
    }

    set tree(val) {
        throw new Error("Subclass must implement 'tree' setter.");
    }

    get diff() {
        throw new Error("Subclass must implement 'diff' getter.");
    }

    set diff(val) {
        throw new Error("Subclass must implement 'diff' setter.");
    }

    async getLLMResponse() {
        throw new Error("Subclass must implement 'getLLMResponse' method.");
    }

    async getDiff() {
        throw new Error("Subclass must implement 'getDiff' method.");
    }

    async getCommentTree() {
        throw new Error("Subclass must implement 'getCommentTree' method.");
    }

    async isAuthenticated() {
        throw new Error("Subclass must implement 'isAuthenticated' method.");
    }

    async postNewReviewer() {
        throw new Error("Subclass must implement 'postNewReviewer' method.");
    }

    async postProcessing() {
        throw new Error("Subclass must implement 'postProcessing' method.");
    }

    async postReviewComments() {
        throw new Error("Subclass must implement 'postReviewComments' method.");
    }

    async postReviewCommentResolution() {
        throw new Error("Subclass must implement 'postReviewCommentResolution' method.");
    }

    async postApprovalStatus() {
        throw new Error("Subclass must implement 'postApprovalStatus' method.");
    }

    getNested(obj, paths) {
        return paths.reduce((result, path) => {
            const value = path.split('.').reduce((acc, key) => acc?.[key], obj);
            result[path] = value;
            return result;
        }, {});
    }
}

export class NormalizedUser {
    constructor(id, login, name = null) {
        this.id = id;
        this.login = login;
        this.name = name;
    }

    toString() {
        return `User(id=${this.id}, name='${this.name}', login='${this.login}')`;
    }
}
