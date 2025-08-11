import { BaseRepoAdapter, NormalizedUser } from "./Base.js";

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
            threadsUrl: null,
            headers: {
                Authorization: `Bearer ${process.env.BITBUCKET_TOKEN}`,
            },
            agent: process.env.BITBUCKET_AGENT_USER,
            commentProperties: ['id', 'in_reply_to_id', 'path', 'diff_hunk', 'side', 'line', 'position', 'created_at', 'user.login']
        };

        if (this.payload.pullrequest?.source?.commit?.hash) {
            data.headSha = this.payload.pullrequest.source.commit.hash;
        }

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
            data.prUrl = `${data.baseApiUrl}/repositories/${workspace}/${name}/pullrequests/${prId}`;
            data.diffUrl = `${data.prUrl}/diff`;
            data.threadsUrl = `${data.prUrl}/comments`;
        }

        return data;
    }

    get provider() { return this._normalizedData.provider; }
    get baseApiUrl() { return this._normalizedData.baseApiUrl; }
    get pullRequestNumber() { return this._normalizedData.pullRequestNumber; }
    get action() { return this._normalizedData.action; }
    get author() { return this._normalizedData.author; }
    get reviewers() { return this._normalizedData.reviewers; }
    get prUrl() { return this._normalizedData.prUrl; }
    get diffUrl() { return this._normalizedData.diffUrl; }
    get threadsUrl() { return this._normalizedData.threadsUrl; }
    get headers() { return this._normalizedData.headers; }
    get sha() { return this._normalizedData.headSha; }
    get commentProperties() { return this._normalizedData.commentProperties; }

    async isAuthenticated() {
        try {
            const res = await this.http.get(
                `${this.baseApiUrl}/repositories/${this._normalizedData.repo.owner}/${this._normalizedData.repo.name}`,
                this.headers
            );
            return res.status === 200;
        } catch (err) {
            return false;
        }
    }
}