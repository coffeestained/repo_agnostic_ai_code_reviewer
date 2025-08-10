import { BaseRepoAdapter } from "./Base.js";

export class BitbucketAdapter extends BaseRepoAdapter {
    constructor(payload) {
        super(payload);
        this._normalizedData = this._normalize();
    }

    _normalize() {
        const data = {
            provider: "bitbucket",
            baseApiUrl: this.payload.generated_api_url || "https://api.bitbucket.org/2.0",
            action: "UNKNOWN",
            author: null,
            reviewers: [],
            repo: {},
            diffUrl: null,
            threadsUrl: null
        };

        const eventKey = this.payload.eventKey;
        switch (eventKey) {
            case "pr:opened": data.action = "OPENED"; break;
            case "pr:comment:added": data.action = "COMMENTED"; break;
            case "pr:from_ref_updated": data.action = "UPDATED_CODE"; break;
            case "pr:reviewer:updated":
                if (this.payload.addedReviewers && this.payload.addedReviewers.length > 0) {
                    data.action = "REVIEW_REQUESTED";
                }
                break;
            case "pr:updated": data.action = "UNDRAFTED"; break;
            default: data.action = eventKey ? eventKey.toUpperCase().replace(':', '_') : "UNKNOWN";
        }

        const prData = this.payload.pullRequest || {};
        data.pullRequestNumber = prData.id || null;

        const repoData = this.payload.repository || {};
        if (repoData.fullName) {
            const [workspace, repo_slug] = repoData.fullName.split('/');
            data.repo = { workspace, name: repo_slug };
        }

        const actorData = this.payload.actor || {};
        if (actorData) {
            data.author = new NormalizedUser(actorData.uuid, actorData.name, actorData.displayName);
        }

        if (data.action === "REVIEW_REQUESTED" && this.payload.addedReviewers) {
            for (const reviewerData of this.payload.addedReviewers) {
                data.reviewers.push(new NormalizedUser(reviewerData.uuid, reviewerData.name, reviewerData.displayName));
            }
        }

        // Populate API URLs
        const { workspace, name } = data.repo;
        const prId = data.pullRequestNumber;
        if (workspace && name && prId) {
            const baseUrl = `${data.baseApiUrl}/repositories/${workspace}/${name}/pullrequests/${prId}`;
            data.diffUrl = `${baseUrl}/diff`;
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