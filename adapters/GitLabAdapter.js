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
            }
        };

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
            const baseUrl = `${data.baseApiUrl}/projects/${projectId}/merge_requests/${mrIid}`;
            data.diffUrl = `${baseUrl}/changes`;
            data.threadsUrl = `${baseUrl}/discussions`;
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