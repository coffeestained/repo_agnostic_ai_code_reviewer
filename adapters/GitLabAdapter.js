import { BaseRepoAdapter, NormalizedUser } from "./Base.js";

export class GitLabAdapter extends BaseRepoAdapter {
    constructor(payload) {
        super(payload);
        this._normalizedData = this._normalize();
    }

    _normalize() {
        const data = {
            provider: "gitlab",
            baseApiUrl: this.payload.generated_api_url || "https://gitlab.com/api/v4",
            action: "UNKNOWN",
            author: null,
            reviewers: [],
            repo: {},
            diffUrl: null,
            threadsUrl: null,
            headers: {
                'PROVIDER-TOKEN': `${process.env.GITLAB_TOKEN}`,
            },
            agent: process.env.GITLAB_AGENT_USER,
            commentProperties: ['id', 'in_reply_to_id', 'path', 'diff_hunk', 'side', 'line', 'position', 'created_at', 'user.login']
        };

        if (this.payload.object_attributes?.last_commit?.id) {
            data.headSha = this.payload.object_attributes.last_commit.id;
        }

        const objectKind = this.payload.object_kind;
        const objectAttrs = this.payload.object_attributes || {};
        const rawAction = objectAttrs.action;

        if (objectKind === "merge_request" && rawAction === "open") { data.action = "OPENED"; }
        else if (objectKind === "note") { data.action = "COMMENTED"; }
        else if (objectKind === "merge_request" && rawAction === "update") {
            if (objectAttrs.oldrev) { data.action = "UPDATED_CODE"; }
            else if (this.payload.reviewers) { data.action = "REVIEW_REQUESTED"; }
            else if (this.payload.changes?.work_in_progress !== undefined) { data.action = "UNDRAFTED"; }
            else { data.action = "UPDATED_METADATA"; }
        } else {
            data.action = rawAction ? rawAction.toUpperCase() : "UNKNOWN";
        }

        if (this.payload.merge_request) {
            data.pullRequestNumber = this.payload.merge_request.iid || null;
        } else {
            data.pullRequestNumber = objectAttrs.iid || null;
        }

        const projectData = this.payload.project || {};
        data.repo.id = projectData.id || objectAttrs.source_project_id || null;

        const actorData = this.payload.user || {};
        if (actorData) {
            data.author = new NormalizedUser(actorData.id, actorData.username, actorData.name);
        }

        if (data.action === "REVIEW_REQUESTED" && this.payload.reviewers) {
            for (const reviewerData of this.payload.reviewers) {
                data.reviewers.push(new NormalizedUser(reviewerData.id, reviewerData.username, reviewerData.name));
            }
        }

        // Populate API URLs
        const projectId = data.repo.id;
        const mrIid = data.pullRequestNumber;
        if (projectId && mrIid) {
            data.prUrl = `${data.baseApiUrl}/projects/${projectId}/merge_requests/${mrIid}`;
            data.diffUrl = `${data.prUrl}/changes`;
            data.threadsUrl = `${data.prUrl}/discussions`;
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
                `${this.baseApiUrl}/projects/${encodeURIComponent(this._normalizedData.repo.owner + '/' + this._normalizedData.repo.name)}`,
                this.headers
            );
            return res.status === 200;
        } catch (err) {
            return false;
        }
    }
}