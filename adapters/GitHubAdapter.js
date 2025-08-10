import { BaseRepoAdapter } from "./Base.js";

export class GitHubAdapter extends BaseRepoAdapter {
    constructor(payload) {
        super(payload);
        this._normalizedData = this._normalize();
    }

    _normalize() {
        const data = {
            provider: "github",
            baseApiUrl: this.payload.generated_api_url || "https://api.github.com",
            action: "UNKNOWN",
            author: null,
            reviewers: [],
            repo: {},
            diffUrl: null,
            threadsUrl: null
        };

        const rawAction = this.payload.action;
        switch (rawAction) {
            case "opened": data.action = "OPENED"; break;
            case "submitted": data.action = this.payload.review ? "COMMENTED" : "UNKNOWN"; break;
            case "synchronize": data.action = "UPDATED_CODE"; break;
            case "review_requested": data.action = "REVIEW_REQUESTED"; break;
            case "ready_for_review": data.action = "UNDRAFTED"; break;
            default: data.action = rawAction ? rawAction.toUpperCase() : "UNKNOWN";
        }

        const prData = this.payload.pull_request || {};
        data.pullRequestNumber = prData.number || null;

        const repoData = this.payload.repository || {};
        if (repoData.full_name) {
            const [owner, repo] = repoData.full_name.split('/');
            data.repo = { owner, name: repo };
        }

        const actorData = this.payload.sender || {};
        if (actorData.id) {
            data.author = new NormalizedUser(actorData.id, actorData.login);
        }

        if (data.action === "REVIEW_REQUESTED" && this.payload.requested_reviewer) {
            const reviewerData = this.payload.requested_reviewer;
            data.reviewers.push(new NormalizedUser(reviewerData.id, reviewerData.login));
        }

        // Populate API URLs
        const { owner, name } = data.repo;
        const prNumber = data.pullRequestNumber;
        if (owner && name && prNumber) {
            const baseUrl = `${data.baseApiUrl}/repos/${owner}/${name}/pulls/${prNumber}`;
            data.diffUrl = `${baseUrl}.diff`;
            data.threadsUrl = `${baseUrl}/comments`;
        }

        return data;
    }

    get provider() { return this._normalizedData.provider; }
    get baseApiUrl() { return this._normalizedData.baseApiUrl; }
    get pullRequestNumber() { return this._normalizedData.pullRequestNumber; }
    get action() { return this._normalizedData.action; }
    get author() { return this._normalizedData.author; }
    get reviewers() { return this._normalizedData.reviewers; }
    get diffUrl() { return this._normalizedData.diffUrl; }
    get threadsUrl() { return this._normalizedData.threadsUrl; }
}