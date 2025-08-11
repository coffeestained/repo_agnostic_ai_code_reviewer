import { BaseRepoAdapter, NormalizedUser } from "./Base.js";

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
            threadsUrl: null,
            reviewersUrl: null,
            reviewsUrl: null,
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                Accept: "application/vnd.github.v3+json"
            },
            agent: process.env.GITHUB_AGENT_USER,
            commentProperties: ['id', 'in_reply_to_id', 'path', 'diff_hunk', 'side', 'line', 'position', 'created_at', 'user.login']
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

        if (prData.head && prData.head.sha) {
            data.headSha = prData.head.sha;
        }

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
            data.prUrl = `${data.baseApiUrl}/repos/${owner}/${name}/pulls/${prNumber}`;
            data.diffUrl = `${data.prUrl}.diff`;
            data.threadsUrl = `${data.prUrl}/comments`;
            data.reviewersUrl = `${data.prUrl}/requested_reviewers`;
            data.reviewsUrl = `${data.prUrl}/reviews`;
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
    get reviewersUrl() { return this._normalizedData.reviewersUrl; }
    get reviewsUrl() { return this._normalizedData.reviewsUrl; }
    get headers() { return this._normalizedData.headers; }
    get sha() { return this._normalizedData.headSha; }
    get commentProperties() { return this._normalizedData.commentProperties; }

    get llmResponse() { return this._llmResponse; }
    set llmResponse(val) { this._llmResponse = val };

    get diff() { return this._diff; }
    set diff(val) { this._diff = val };

    get tree() { return this._tree; }
    set tree(val) { this._tree = val };

    async isAuthenticated() {
        try {
            const res = await this.http.get(
                `${this.baseApiUrl}/repos/${this._normalizedData.repo.owner}/${this._normalizedData.repo.name}`,
                { headers: this.headers }
            );
            return res.status === 200;
        } catch (err) {
            return false;
        }
    }

    async getDiff() {
        try {
            const res = await this.http.get(
                `${this.prUrl}`,
                { ...this.headers, Accept: "application/vnd.github.v3.diff" }
            );
            return res.status === 200 && this.parse(res.data).map(file => {
                const changes = [];
                for (const chunk of file.chunks) {
                    let oldLine = chunk.oldStart;
                    let newLine = chunk.newStart;

                    for (const change of chunk.changes) {
                        let side, line;

                        if (change.type === 'normal') {
                            oldLine++;
                            newLine++;
                            continue; // skip unchanged lines
                        }

                        if (change.type === 'add') {
                            side = 'RIGHT';
                            line = newLine++;
                        } else if (change.type === 'del') {
                            side = 'LEFT';
                            line = oldLine++;
                        }

                        changes.push({
                            side,
                            line,
                            type: change.type,
                            content: change.content,
                        });
                    }
                }

                this.diff = {
                    filePath: file.to.replace(/^b\//, ''),
                    changes,
                };
            });
        } catch (err) {
            return false;
        }
    }

    async getCommentTree() {
        try {
            const comments = (await this.http.get(
                `${this.threadsUrl}`,
                this.headers
            )).data.map((item) => ({ ...this.getNested(item, this.commentProperties), children: [] }));

            const commentMap = {};
            const tree = [];

            comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            comments.forEach(comment => {
                commentMap[comment.id] = comment;
            });
            comments.forEach(comment => {
                if (comment.in_reply_to_id && commentMap[comment.in_reply_to_id]) {
                    commentMap[comment.in_reply_to_id].children.push(comment);
                    delete commentMap[comment.id];
                }
            });
            Object.values(commentMap).forEach((value) => tree.push(value));

            this.tree = tree;
        } catch (err) {
            return [];
        }
    }

    async getLLMResponse(actionType) {
        this.llmResponse = await this.doLLM(this.diff, "", actionType, this.tree, this._normalizedData.agent);
    }

    async doPostProcessingActions(response) {
        Logger.info(`Provider starting post-processing for AI response.`);

        if (Array.isArray(response.comments)) {
            for (const comment of response.comments) {
                if (comment.filePath && comment.line) {
                    try {
                        await this.postReviewComments({
                            path: comment.filePath,
                            line: comment.line,
                            body: `${comment.message} You can discuss the request or make a change to trigger a re-review. When all threads are resolved -- the agent will approve.`,
                            commit_id: this.sha,
                            side: comment.side
                        });
                    } catch (e) {
                        throw e;
                    }
                }
            }
        }

        if (Array.isArray(response.newReviews)) {
            for (const comment of response.newReviews) {
                if (comment.filePath && comment.line) {
                    try {
                        await this.postReviewCommentUpdates({
                            path: comment.filePath,
                            line: comment.line,
                            body: `${comment.message} You can discuss the request or make a change to trigger a re-review. When all threads are resolved -- the agent will approve.`,
                            commit_id: this.sha,
                            side: comment.side
                        });
                    } catch (e) {
                        throw e;
                    }
                }
            }
        }

        const reviewEvent = response.approved ? 'APPROVE' : 'COMMENT';
        if (response.baseMessage || response.approved) {
            await this.submitReview(reviewEvent, response.baseMessage);
        }
    }

    async postNewReviewer() {
        const url = `${this.reviewersUrl}`;
        const payload = {
            reviewers: [this._normalizedData.agent],
        };
        console.log(payload, url);
        try {
            await this.http.post(url, payload, this.headers);
        } catch (error) {
            throw error;
        }
    }

    async postReviewComments(payload) {
        const res = await this.http.post(
            `${this.threadsUrl}`,
            payload,
            this.headers
        );
        return res.status === 201 ? res.data : false;
    }

    async postReviewCommentUpdates(payload) {
        const { commentId, message, resolveReviewThread } = payload;

        const url = `${this.threadsUrl}/${commentId}/replies`;

        await this.http.post(url, { body: message }, this.headers);

        if (resolveReviewThread) {
            //this.resolveThreadFromParentComment(commentId)
            // This is going to need custom graphql request
        }

    }


    async submitReview(event, message) {
        const url = `${this.reviewsUrl}`;
        const payload = {
            commit_id: this.sha,
            body: message,
            event: event,
        };

        try {
            await this.http.post(url, payload, this.headers);
        } catch (e) {
            throw e;
        }
    }

    // GitHub ONLY Methods

}